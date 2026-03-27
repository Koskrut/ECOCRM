import { Inject, Injectable } from "@nestjs/common";
import { randomUUID } from "crypto";
import type { AppConfig } from "../config/configuration";
import { CONFIG } from "../config/config.module";
import { StructuredLogger } from "../common/structured-logger";
import { jsonTopLevelKeys, summarizeJsonShape } from "./kyivstar-contract-audit";
import { expandCallPath, extractOutboundCallId, kyivstarHttpJson } from "./kyivstar-http";
import {
  extractFailureReason,
  extractStatusString,
  mapProviderStatusToTelephony,
} from "./kyivstar-status-map";
import type {
  TelephonyCallHandle,
  TelephonyCallState,
  TelephonyEvent,
  TelephonyProvider,
} from "./telephony-provider.interface";

type CallMeta = {
  externalSessionId: string;
  attemptId: string;
  providerSessionId?: string | null;
  lastEmitted?: TelephonyCallState;
  lastReason?: string;
  lastStatus?: TelephonyCallState;
  statusFailures: number;
};

/**
 * Kyivstar control plane: HTTP adapter to B2B/SIP control service.
 * - `KYIVSTAR_CONTROL_PLANE_MODE=http` (default): real REST calls, no synthetic timers.
 * - `synthetic`: dev-only timer-based states — not for pilot/production.
 *
 * SIP env vars are forwarded in outbound JSON when set; they are for trunk/media alignment
 * with your adapter and are not used by this class for raw SIP/RTP.
 */
@Injectable()
export class KyivstarTelephonyProvider implements TelephonyProvider {
  private readonly listeners = new Set<(event: TelephonyEvent) => void>();
  private readonly metaByCallId = new Map<string, CallMeta>();
  private readonly syntheticTimers = new Map<string, ReturnType<typeof setTimeout>[]>();

  constructor(
    @Inject(CONFIG) private readonly config: AppConfig,
    private readonly log: StructuredLogger,
  ) {}

  async createOutboundLeg(input: {
    externalSessionId: string;
    e164Phone: string;
    attemptId: string;
  }): Promise<TelephonyCallHandle> {
    this.assertConfigured();

    if (this.config.kyivstarControlPlaneMode === "synthetic") {
      return this.createOutboundLegSynthetic(input);
    }

    const body: Record<string, unknown> = {
      destination: input.e164Phone,
      externalSessionId: input.externalSessionId,
      attemptId: input.attemptId,
      correlation: {
        externalSessionId: input.externalSessionId,
        attemptId: input.attemptId,
      },
    };
    const sip = this.optionalSipBlock();
    if (sip) body.sip = sip;

    const path = this.config.kyivstarHttpOutboundPath.startsWith("/")
      ? this.config.kyivstarHttpOutboundPath
      : `/${this.config.kyivstarHttpOutboundPath}`;

    this.log.log("kyivstar_outbound_create_request", {
      externalSessionId: input.externalSessionId,
      attemptId: input.attemptId,
      path,
    });

    let res: Awaited<ReturnType<typeof kyivstarHttpJson>>;
    try {
      res = await kyivstarHttpJson(this.config, "POST", path, body);
    } catch (err) {
      this.log.error("kyivstar_outbound_create_network_error", {
        externalSessionId: input.externalSessionId,
        attemptId: input.attemptId,
        error: String(err),
      });
      throw new Error("KYIVSTAR_OUTBOUND_CREATE_FAILED");
    }

    if (!res.ok) {
      const reason = extractFailureReason(res.json) ?? res.text?.slice(0, 500) ?? `HTTP_${res.status}`;
      this.log.error("kyivstar_outbound_create_http_error", {
        externalSessionId: input.externalSessionId,
        attemptId: input.attemptId,
        status: res.status,
        reason,
      });
      throw new Error("KYIVSTAR_OUTBOUND_CREATE_FAILED");
    }

    const extracted = extractOutboundCallId(res.json);
    if (!extracted?.callId) {
      this.log.error("kyivstar_outbound_create_missing_call_id", {
        externalSessionId: input.externalSessionId,
        attemptId: input.attemptId,
        jsonTopLevelKeys: jsonTopLevelKeys(res.json).join(","),
        shapeSummary: summarizeJsonShape(res.json),
        note: "Confirm outbound response contract with your B2B adapter — call id field name may differ.",
      });
      throw new Error("KYIVSTAR_OUTBOUND_CREATE_INVALID_RESPONSE");
    }

    const providerCallId = extracted.callId;
    const providerSessionId = extracted.sessionId ?? `kyivstar-session-${randomUUID()}`;

    this.metaByCallId.set(providerCallId, {
      externalSessionId: input.externalSessionId,
      attemptId: input.attemptId,
      providerSessionId,
      statusFailures: 0,
    });

    const raw = extractStatusString(res.json);
    if (raw) {
      const mapped = mapProviderStatusToTelephony(raw);
      if (mapped) {
        this.applyAndEmit(providerCallId, mapped.status, mapped.reason);
      } else {
        this.emitOnce(providerCallId, "dialing");
      }
    } else {
      this.emitOnce(providerCallId, "dialing");
    }

    this.log.log("kyivstar_outbound_leg_created", {
      externalSessionId: input.externalSessionId,
      attemptId: input.attemptId,
      providerCallId,
      providerSessionId,
    });

    return { providerCallId, providerSessionId };
  }

  async getCallStatus(providerCallId: string): Promise<{ status: TelephonyCallState; reason?: string }> {
    this.assertConfigured();

    if (this.config.kyivstarControlPlaneMode === "synthetic") {
      const m = this.metaByCallId.get(providerCallId);
      return { status: m?.lastStatus ?? "dialing" };
    }

    return this.refreshStatusFromHttp(providerCallId);
  }

  async transferCall(providerCallId: string, target: string): Promise<void> {
    this.assertConfigured();
    this.log.warn("kyivstar_transfer_degraded", {
      providerCallId,
      target,
      note: "No provider-backed transfer API is wired in this release; capability is non-production.",
    });
    throw new Error("KYIVSTAR_TRANSFER_NOT_SUPPORTED");
  }

  async hangupCall(providerCallId: string): Promise<void> {
    this.assertConfigured();

    if (this.config.kyivstarControlPlaneMode === "synthetic") {
      this.clearSyntheticTimers(providerCallId);
      this.log.log("kyivstar_hangup_synthetic", { providerCallId });
      this.emitOnce(providerCallId, "completed");
      return;
    }

    const path = expandCallPath(this.config.kyivstarHttpHangupPathTemplate, providerCallId);
    const method = this.config.kyivstarHttpHangupMethod;

    this.log.log("kyivstar_hangup_request", { providerCallId, method, path });

    let res: Awaited<ReturnType<typeof kyivstarHttpJson>>;
    try {
      res = await kyivstarHttpJson(this.config, method, path);
    } catch (err) {
      this.log.error("kyivstar_hangup_network_error", { providerCallId, error: String(err) });
      throw new Error("KYIVSTAR_HANGUP_FAILED");
    }

    if (!res.ok) {
      const reason = extractFailureReason(res.json) ?? res.text?.slice(0, 500) ?? `HTTP_${res.status}`;
      this.log.error("kyivstar_hangup_http_error", { providerCallId, status: res.status, reason });
      throw new Error("KYIVSTAR_HANGUP_FAILED");
    }

    const meta = this.metaByCallId.get(providerCallId);
    if (meta) {
      this.applyAndEmit(providerCallId, "completed");
    }

    this.log.log("kyivstar_hangup_ok", { providerCallId });
  }

  subscribe(listener: (event: TelephonyEvent) => void): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  private optionalSipBlock(): Record<string, string> | undefined {
    const realm = this.config.kyivstarSipRealm?.trim();
    const user = this.config.kyivstarSipUser?.trim();
    const password = this.config.kyivstarSipPassword?.trim();
    const proxy = this.config.kyivstarSipProxy?.trim();
    if (!realm && !user && !password && !proxy) return undefined;
    const o: Record<string, string> = {};
    if (realm) o.realm = realm;
    if (user) o.user = user;
    if (password) o.password = password;
    if (proxy) o.proxy = proxy;
    return o;
  }

  private createOutboundLegSynthetic(input: {
    externalSessionId: string;
    e164Phone: string;
    attemptId: string;
  }): TelephonyCallHandle {
    this.log.warn("kyivstar_control_plane_synthetic_active", {
      externalSessionId: input.externalSessionId,
      note: "Synthetic timers — not for production pilot.",
    });
    const providerCallId = `kyivstar-call-${randomUUID()}`;
    const providerSessionId = `kyivstar-session-${randomUUID()}`;
    this.metaByCallId.set(providerCallId, {
      externalSessionId: input.externalSessionId,
      attemptId: input.attemptId,
      providerSessionId,
      lastStatus: "dialing",
      statusFailures: 0,
    });
    this.emitState(input.externalSessionId, providerCallId, providerSessionId, "dialing");
    const t1 = setTimeout(() => {
      this.patchSyntheticStatus(providerCallId, "ringing");
      this.emitState(input.externalSessionId, providerCallId, providerSessionId, "ringing");
    }, 200);
    const t2 = setTimeout(() => {
      this.patchSyntheticStatus(providerCallId, "answered");
      this.emitState(input.externalSessionId, providerCallId, providerSessionId, "answered");
    }, 500);
    this.syntheticTimers.set(providerCallId, [t1, t2]);
    this.log.log("kyivstar_outbound_leg_created", {
      externalSessionId: input.externalSessionId,
      attemptId: input.attemptId,
      providerCallId,
      synthetic: true,
    });
    return { providerCallId, providerSessionId };
  }

  private patchSyntheticStatus(providerCallId: string, status: TelephonyCallState): void {
    const m = this.metaByCallId.get(providerCallId);
    if (m) {
      m.lastStatus = status;
    }
  }

  private clearSyntheticTimers(providerCallId: string): void {
    const ts = this.syntheticTimers.get(providerCallId);
    if (ts) for (const t of ts) clearTimeout(t);
    this.syntheticTimers.delete(providerCallId);
  }

  private async refreshStatusFromHttp(providerCallId: string): Promise<{
    status: TelephonyCallState;
    reason?: string;
  }> {
    const meta = this.metaByCallId.get(providerCallId);
    if (!meta) {
      this.log.warn("kyivstar_status_unknown_call", { providerCallId });
      return { status: "failed", reason: "unknown_provider_call" };
    }

    const path = expandCallPath(this.config.kyivstarHttpStatusPathTemplate, providerCallId);

    let res: Awaited<ReturnType<typeof kyivstarHttpJson>>;
    try {
      res = await kyivstarHttpJson(this.config, "GET", path);
    } catch (err) {
      meta.statusFailures++;
      this.log.error("kyivstar_status_network_error", {
        providerCallId,
        externalSessionId: meta.externalSessionId,
        attemptId: meta.attemptId,
        failures: meta.statusFailures,
        error: String(err),
      });
      return this.afterStatusFailure(meta, providerCallId);
    }

    if (!res.ok) {
      meta.statusFailures++;
      this.log.error("kyivstar_status_http_error", {
        providerCallId,
        externalSessionId: meta.externalSessionId,
        attemptId: meta.attemptId,
        status: res.status,
        failures: meta.statusFailures,
      });
      return this.afterStatusFailure(meta, providerCallId);
    }

    meta.statusFailures = 0;
    const raw = extractStatusString(res.json);
    if (!raw) {
      this.log.warn("kyivstar_status_missing_status_field", {
        providerCallId,
        externalSessionId: meta.externalSessionId,
        jsonTopLevelKeys: jsonTopLevelKeys(res.json).join(","),
        shapeSummary: summarizeJsonShape(res.json),
        note: "Status polling could not find a known status field — confirm GET response shape.",
      });
      return { status: meta.lastStatus ?? "dialing" };
    }

    const mapped = mapProviderStatusToTelephony(raw);
    if (!mapped) {
      this.log.warn("kyivstar_status_unmapped", {
        providerCallId,
        externalSessionId: meta.externalSessionId,
        raw,
        note: "Add mapping in kyivstar-status-map or confirm provider labels.",
      });
      return { status: meta.lastStatus ?? "dialing" };
    }

    meta.lastStatus = mapped.status;
    this.applyAndEmit(providerCallId, mapped.status, mapped.reason);
    return { status: mapped.status, reason: mapped.reason };
  }

  private afterStatusFailure(meta: CallMeta, providerCallId: string): { status: TelephonyCallState; reason?: string } {
    if (meta.statusFailures >= 5) {
      const reason = "provider_status_unavailable";
      this.applyAndEmit(providerCallId, "failed", reason);
      return { status: "failed", reason };
    }
    return { status: meta.lastStatus ?? "dialing" };
  }

  private applyAndEmit(
    providerCallId: string,
    status: TelephonyCallState,
    reason?: string,
  ): void {
    const meta = this.metaByCallId.get(providerCallId);
    if (!meta) return;
    if (meta.lastEmitted === status && (status !== "failed" || meta.lastReason === reason)) {
      return;
    }
    meta.lastEmitted = status;
    meta.lastReason = reason;
    meta.lastStatus = status;
    this.emitState(meta.externalSessionId, providerCallId, meta.providerSessionId ?? null, status, reason);
  }

  private emitOnce(providerCallId: string, state: TelephonyCallState, reason?: string): void {
    const meta = this.metaByCallId.get(providerCallId);
    if (!meta) return;
    if (meta.lastEmitted === state) return;
    meta.lastEmitted = state;
    meta.lastStatus = state;
    this.emitState(meta.externalSessionId, providerCallId, meta.providerSessionId ?? null, state, reason);
  }

  private emitState(
    externalSessionId: string,
    providerCallId: string,
    providerSessionId: string | null,
    state: TelephonyCallState,
    reason?: string,
  ): void {
    const ev: TelephonyEvent = {
      externalSessionId,
      providerCallId,
      providerSessionId,
      state,
      reason,
      occurredAt: new Date().toISOString(),
    };
    for (const listener of this.listeners) listener(ev);
  }

  private assertConfigured(): void {
    if (!this.config.kyivstarApiBaseUrl || !this.config.kyivstarApiToken) {
      throw new Error("KYIVSTAR_PROVIDER_CONFIG_MISSING");
    }
  }
}

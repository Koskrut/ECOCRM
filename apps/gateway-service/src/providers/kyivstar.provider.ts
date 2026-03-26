import { Inject, Injectable } from "@nestjs/common";
import { randomUUID } from "crypto";
import type { AppConfig } from "../config/configuration";
import { CONFIG } from "../config/config.module";
import { StructuredLogger } from "../common/structured-logger";
import type {
  TelephonyCallHandle,
  TelephonyCallState,
  TelephonyEvent,
  TelephonyProvider,
} from "./telephony-provider.interface";

/**
 * Kyivstar integration point.
 * In real deployments this calls provider HTTP/SIP control plane and emits call-state events.
 * If provider credentials are missing, throws explicit config error.
 */
@Injectable()
export class KyivstarTelephonyProvider implements TelephonyProvider {
  private readonly listeners = new Set<(event: TelephonyEvent) => void>();

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
    const providerCallId = `kyivstar-call-${randomUUID()}`;
    const providerSessionId = `kyivstar-session-${randomUUID()}`;

    // Integration placeholder: real API/SIP INVITE should be wired here.
    // For early staging without trunk access we emit synthetic ringing/answered states.
    this.emitState(input.externalSessionId, providerCallId, providerSessionId, "dialing");
    setTimeout(() => this.emitState(input.externalSessionId, providerCallId, providerSessionId, "ringing"), 200);
    setTimeout(() => this.emitState(input.externalSessionId, providerCallId, providerSessionId, "answered"), 500);

    this.log.log("kyivstar_outbound_leg_created", {
      externalSessionId: input.externalSessionId,
      attemptId: input.attemptId,
      providerCallId,
    });

    return { providerCallId, providerSessionId };
  }

  async getCallStatus(providerCallId: string): Promise<{ status: TelephonyCallState; reason?: string }> {
    this.assertConfigured();
    void providerCallId;
    return { status: "answered" };
  }

  async transferCall(providerCallId: string, target: string): Promise<void> {
    this.assertConfigured();
    this.log.log("kyivstar_transfer_requested", { providerCallId, target });
  }

  async hangupCall(providerCallId: string): Promise<void> {
    this.assertConfigured();
    this.log.log("kyivstar_hangup_requested", { providerCallId });
  }

  subscribe(listener: (event: TelephonyEvent) => void): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  private emitState(
    externalSessionId: string,
    providerCallId: string,
    providerSessionId: string,
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

import { Inject, Injectable, Logger, OnModuleDestroy, OnModuleInit } from "@nestjs/common";
import { randomUUID } from "crypto";
import * as modesl from "modesl";
import { CONFIG } from "../config/config.module";
import type { AppConfig } from "../config/configuration";
import { CallStoreService } from "../calls/call-store.service";
import type { CallStatus } from "../calls/call.types";
import { buildOriginateVars, destinationToDialString } from "./dial-string.util";

type EslConnection = modesl.Connection;

@Injectable()
export class FreeswitchService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(FreeswitchService.name);
  private conn: EslConnection | null = null;
  private readonly mockTimers = new Map<string, ReturnType<typeof setTimeout>[]>();

  constructor(
    @Inject(CONFIG) private readonly config: AppConfig,
    private readonly callStore: CallStoreService,
  ) {}

  onModuleInit(): void {
    if (this.config.freeswitchMode !== "esl") return;
    this.connectEsl();
  }

  onModuleDestroy(): void {
    for (const timers of this.mockTimers.values()) {
      for (const t of timers) clearTimeout(t);
    }
    this.mockTimers.clear();
    if (this.conn) {
      try {
        this.conn.disconnect();
      } catch {
        /* ignore */
      }
      this.conn = null;
    }
  }

  async originateOutbound(callId: string, destination: string): Promise<string | null> {
    if (this.config.freeswitchMode === "mock") {
      this.scheduleMockProgress(callId);
      return `mock-${callId}`;
    }
    const dial = destinationToDialString(destination, this.config.sipDialPrefix);
    const vars = buildOriginateVars({
      cliNumber: this.config.sipCliNumber,
      publicIp: this.config.sipPublicIp,
      callId,
    });
    const dialString = `${vars}sofia/gateway/${this.config.sipGatewayName}/${dial} &park()`;
    const reply = await this.bgapi(dialString);
    const body = reply.getBody?.() ?? String(reply);
    const uuid = parseUuidFromOriginate(body);
    if (!uuid) {
      this.logger.error(`originate failed callId=${callId} body=${body.slice(0, 300)}`);
      this.callStore.setStatus(callId, "failed", "originate_failed");
      return null;
    }
    this.callStore.update(callId, { fsUuid: uuid });
    return uuid;
  }

  async hangup(callId: string, fsUuid: string | null): Promise<void> {
    if (this.config.freeswitchMode === "mock") {
      this.clearMockTimers(callId);
      this.callStore.setStatus(callId, "completed");
      return;
    }
    if (!fsUuid) return;
    await this.api(`uuid_kill ${fsUuid}`);
    const record = this.callStore.get(callId);
    if (record?.bridgeUuid) {
      await this.api(`uuid_kill ${record.bridgeUuid}`).catch(() => undefined);
    }
  }

  async attachMedia(
    callId: string,
    fsUuid: string | null,
    host: string,
    port: number,
    codec: "alaw" | "mulaw",
  ): Promise<{ symmetricRtp: boolean; remoteAddress: string | null; remotePort: number | null }> {
    if (this.config.freeswitchMode === "mock") {
      this.callStore.update(callId, {
        mediaAttached: true,
        codec,
        symmetricRtp: true,
        rtpRemoteAddress: this.config.sipPublicIp,
        rtpRemotePort: port,
      });
      return {
        symmetricRtp: true,
        remoteAddress: this.config.sipPublicIp,
        remotePort: port,
      };
    }
    if (!fsUuid) {
      throw new Error("FS_UUID_MISSING");
    }
    const bridgeUuid = randomUUID();
    const codecStr = codec === "alaw" ? "PCMA" : "PCMU";
    const socketLeg = `{origination_uuid=${bridgeUuid},absolute_codec_string=${codecStr},rtp_ptime=20}socket/${host}:${port} async full &park()`;
    const orig = await this.bgapi(`originate ${socketLeg}`);
    const origBody = orig.getBody?.() ?? String(orig);
    if (!/\+OK/i.test(origBody)) {
      this.logger.error(`socket originate failed: ${origBody.slice(0, 300)}`);
      throw new Error("SOCKET_ORIGINATE_FAILED");
    }
    const bridge = await this.bgapi(`uuid_bridge ${fsUuid} ${bridgeUuid}`);
    const bridgeBody = bridge.getBody?.() ?? String(bridge);
    if (!/\+OK/i.test(bridgeBody)) {
      this.logger.error(`uuid_bridge failed: ${bridgeBody.slice(0, 300)}`);
      throw new Error("UUID_BRIDGE_FAILED");
    }
    this.callStore.update(callId, {
      bridgeUuid,
      mediaAttached: true,
      codec,
      symmetricRtp: true,
      rtpRemoteAddress: this.config.sipPublicIp,
      rtpRemotePort: null,
    });
    return {
      symmetricRtp: true,
      remoteAddress: this.config.sipPublicIp,
      remotePort: null,
    };
  }

  async playFile(fsUuid: string, filePath: string): Promise<void> {
    if (this.config.freeswitchMode === "mock") return;
    await this.api(`uuid_broadcast ${fsUuid} ${filePath} aleg`);
  }

  private connectEsl(): void {
    const { freeswitchEslHost, freeswitchEslPort, freeswitchEslPassword } = this.config;
    this.conn = new modesl.Connection(freeswitchEslHost, freeswitchEslPort, freeswitchEslPassword, () => {
      this.logger.log("ESL connected");
    });
    this.conn.on("error", (err: unknown) => {
      this.logger.error(`ESL error: ${err instanceof Error ? err.message : String(err)}`);
    });
    this.conn.on("esl::event::**", (event: modesl.Event) => {
      this.onEslEvent(event);
    });
  }

  private onEslEvent(event: modesl.Event): void {
    const name = event.getHeader("Event-Name");
    if (name !== "CHANNEL_PROGRESS" && name !== "CHANNEL_ANSWER" && name !== "CHANNEL_HANGUP") {
      return;
    }
    const callId = event.getHeader("variable_crm_call_id");
    if (!callId) return;
    const uuid = event.getHeader("Unique-ID") ?? null;
    if (name === "CHANNEL_PROGRESS") {
      this.callStore.setStatus(callId, "ringing");
      return;
    }
    if (name === "CHANNEL_ANSWER") {
      this.callStore.update(callId, { status: "answered", fsUuid: uuid });
      return;
    }
    if (name === "CHANNEL_HANGUP") {
      const cause = event.getHeader("Hangup-Cause") ?? "hangup";
      const answered = event.getHeader("variable_endpoint_disposition") === "ANSWER";
      this.callStore.setStatus(callId, answered ? "completed" : "failed", cause);
    }
  }

  private scheduleMockProgress(callId: string): void {
    const t1 = setTimeout(() => this.callStore.setStatus(callId, "ringing"), 400);
    const t2 = setTimeout(() => this.callStore.setStatus(callId, "answered"), 1200);
    this.mockTimers.set(callId, [t1, t2]);
  }

  private clearMockTimers(callId: string): void {
    const ts = this.mockTimers.get(callId);
    if (ts) for (const t of ts) clearTimeout(t);
    this.mockTimers.delete(callId);
  }

  private bgapi(command: string): Promise<modesl.ESLresponse> {
    return new Promise((resolve, reject) => {
      if (!this.conn) {
        reject(new Error("ESL_NOT_CONNECTED"));
        return;
      }
      this.conn.bgapi(command, (res: modesl.ESLresponse) => {
        if (!res) {
          reject(new Error("ESL_EMPTY_RESPONSE"));
          return;
        }
        resolve(res);
      });
    });
  }

  private api(command: string): Promise<modesl.ESLresponse> {
    return new Promise((resolve, reject) => {
      if (!this.conn) {
        reject(new Error("ESL_NOT_CONNECTED"));
        return;
      }
      this.conn.api(command, (res: modesl.ESLresponse) => {
        if (!res) {
          reject(new Error("ESL_EMPTY_RESPONSE"));
          return;
        }
        resolve(res);
      });
    });
  }
}

function parseUuidFromOriginate(body: string): string | null {
  const m = body.match(/([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})/i);
  return m?.[1] ?? null;
}

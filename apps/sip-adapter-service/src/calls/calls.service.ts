import {
  ConflictException,
  Injectable,
  NotFoundException,
  ServiceUnavailableException,
} from "@nestjs/common";
import { CallStoreService } from "./call-store.service";
import { FreeswitchService } from "../freeswitch/freeswitch.service";

@Injectable()
export class CallsService {
  constructor(
    private readonly store: CallStoreService,
    private readonly fs: FreeswitchService,
  ) {}

  async createOutbound(input: {
    destination: string;
    externalSessionId: string;
    attemptId: string;
  }): Promise<{ callId: string; status: string }> {
    const record = this.store.create({
      externalSessionId: input.externalSessionId,
      attemptId: input.attemptId,
      destination: input.destination,
    });
    const fsUuid = await this.fs.originateOutbound(record.callId, input.destination);
    if (!fsUuid) {
      throw new ServiceUnavailableException("originate_failed");
    }
    return { callId: record.callId, status: record.status };
  }

  getStatus(callId: string): { status: string; phase: string } {
    const record = this.store.get(callId);
    if (!record) throw new NotFoundException("call_not_found");
    return { status: record.status, phase: record.status };
  }

  async hangup(callId: string): Promise<{ ok: boolean; status: string }> {
    const record = this.store.get(callId);
    if (!record) throw new NotFoundException("call_not_found");
    await this.fs.hangup(callId, record.fsUuid);
    const updated = this.store.setStatus(callId, "completed") ?? record;
    return { ok: true, status: updated.status };
  }

  async attachMedia(
    callId: string,
    input: { host: string; port: number; codec: "alaw" | "mulaw" },
  ): Promise<{
    ok: boolean;
    status: string;
    symmetricRtp: boolean;
    rtp: { remoteAddress: string | null; remotePort: number | null; codec: string };
  }> {
    const record = this.store.get(callId);
    if (!record) throw new NotFoundException("call_not_found");
    if (record.mediaAttached) {
      throw new ConflictException("media_already_attached");
    }
    if (record.status !== "answered") {
      throw new ConflictException("call_not_answered");
    }
    const media = await this.fs.attachMedia(callId, record.fsUuid, input.host, input.port, input.codec);
    return {
      ok: true,
      status: "media_attached",
      symmetricRtp: media.symmetricRtp,
      rtp: {
        remoteAddress: media.remoteAddress,
        remotePort: media.remotePort,
        codec: input.codec,
      },
    };
  }
}

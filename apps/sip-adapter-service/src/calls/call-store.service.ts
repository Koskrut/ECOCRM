import { Injectable } from "@nestjs/common";
import { randomUUID } from "crypto";
import type { CallRecord, CallStatus } from "./call.types";

@Injectable()
export class CallStoreService {
  private readonly byId = new Map<string, CallRecord>();

  create(input: {
    externalSessionId: string;
    attemptId: string;
    destination: string;
    fsUuid?: string | null;
  }): CallRecord {
    const now = new Date().toISOString();
    const record: CallRecord = {
      callId: randomUUID(),
      externalSessionId: input.externalSessionId,
      attemptId: input.attemptId,
      destination: input.destination,
      status: "dialing",
      fsUuid: input.fsUuid ?? null,
      bridgeUuid: null,
      mediaAttached: false,
      symmetricRtp: true,
      rtpRemoteAddress: null,
      rtpRemotePort: null,
      codec: "alaw",
      failureReason: null,
      createdAt: now,
      updatedAt: now,
    };
    this.byId.set(record.callId, record);
    return record;
  }

  get(callId: string): CallRecord | undefined {
    return this.byId.get(callId);
  }

  update(callId: string, patch: Partial<CallRecord>): CallRecord | undefined {
    const existing = this.byId.get(callId);
    if (!existing) return undefined;
    const next = { ...existing, ...patch, updatedAt: new Date().toISOString() };
    this.byId.set(callId, next);
    return next;
  }

  setStatus(callId: string, status: CallStatus, failureReason?: string): CallRecord | undefined {
    return this.update(callId, {
      status,
      failureReason: failureReason ?? (status === "failed" ? "provider_failed" : null),
    });
  }
}

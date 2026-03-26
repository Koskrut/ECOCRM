import { Inject, Injectable } from "@nestjs/common";
import type { SessionStore } from "../storage/session-store.interface";
import type { SessionEventRecord } from "../contracts/gateway.types";
import { CorrelationIdService } from "./correlation-id.service";

@Injectable()
export class SessionEventsService {
  constructor(
    @Inject("SessionStore") private readonly sessions: SessionStore,
    private readonly ids: CorrelationIdService,
  ) {}

  append(
    externalSessionId: string,
    eventType: string,
    deliveryId: string,
    payload: Record<string, unknown>,
  ): SessionEventRecord {
    const rec: SessionEventRecord = {
      id: this.ids.newEventRecordId(),
      externalSessionId,
      eventType,
      deliveryId,
      createdAt: new Date().toISOString(),
      payload,
    };
    this.sessions.appendEvent(rec);
    return rec;
  }
}

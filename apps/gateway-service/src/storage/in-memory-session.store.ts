import { Injectable } from "@nestjs/common";
import type { SessionEntity, SessionEventRecord, ExternalSessionId } from "../contracts/gateway.types";
import type { SessionStore } from "./session-store.interface";

@Injectable()
export class InMemorySessionStore implements SessionStore {
  private readonly sessions = new Map<ExternalSessionId, SessionEntity>();
  private readonly events = new Map<ExternalSessionId, SessionEventRecord[]>();

  save(session: SessionEntity): void {
    this.sessions.set(session.externalSessionId, { ...session });
    if (!this.events.has(session.externalSessionId)) {
      this.events.set(session.externalSessionId, []);
    }
  }

  getByExternalId(id: ExternalSessionId): SessionEntity | undefined {
    const s = this.sessions.get(id);
    return s ? { ...s } : undefined;
  }

  update(id: ExternalSessionId, patch: Partial<SessionEntity>): SessionEntity | undefined {
    const cur = this.sessions.get(id);
    if (!cur) return undefined;
    const next = { ...cur, ...patch, timestamps: { ...cur.timestamps, ...patch.timestamps } };
    if (patch.subStatuses) {
      next.subStatuses = { ...cur.subStatuses, ...patch.subStatuses };
    }
    if (patch.correlationIds) {
      next.correlationIds = { ...cur.correlationIds, ...patch.correlationIds };
    }
    this.sessions.set(id, next);
    return { ...next };
  }

  appendEvent(record: SessionEventRecord): void {
    const list = this.events.get(record.externalSessionId) ?? [];
    list.push(record);
    this.events.set(record.externalSessionId, list);
  }

  listEvents(externalSessionId: ExternalSessionId): SessionEventRecord[] {
    return [...(this.events.get(externalSessionId) ?? [])];
  }
}

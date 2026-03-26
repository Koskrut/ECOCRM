import type { SessionEntity, SessionEventRecord, ExternalSessionId } from "../contracts/gateway.types";

export interface SessionStore {
  save(session: SessionEntity): void;
  getByExternalId(id: ExternalSessionId): SessionEntity | undefined;
  update(id: ExternalSessionId, patch: Partial<SessionEntity>): SessionEntity | undefined;
  appendEvent(record: SessionEventRecord): void;
  listEvents(externalSessionId: ExternalSessionId): SessionEventRecord[];
}

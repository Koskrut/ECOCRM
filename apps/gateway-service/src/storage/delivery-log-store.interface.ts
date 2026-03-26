import type { DeliveryRecord } from "../contracts/gateway.types";

export interface DeliveryLogStore {
  upsert(record: DeliveryRecord): void;
  get(deliveryId: string): DeliveryRecord | undefined;
  listBySession(externalSessionId: string): DeliveryRecord[];
}

import { Inject, Injectable } from "@nestjs/common";
import type { DeliveryLogStore } from "../storage/delivery-log-store.interface";
import type { DeliveryRecord } from "../contracts/gateway.types";

@Injectable()
export class DeliveryLogService {
  constructor(@Inject("DeliveryLogStore") private readonly store: DeliveryLogStore) {}

  createPending(record: Omit<DeliveryRecord, "tryCount" | "lastStatus" | "lastError" | "lastHttpStatus" | "updatedAt" | "sentAt" | "deliveredAt">): DeliveryRecord {
    const now = new Date().toISOString();
    const full: DeliveryRecord = {
      ...record,
      tryCount: 0,
      lastStatus: "pending",
      lastError: null,
      lastHttpStatus: null,
      updatedAt: now,
      sentAt: null,
      deliveredAt: null,
    };
    this.store.upsert(full);
    return full;
  }

  recordAttempt(
    deliveryId: string,
    patch: Partial<Pick<DeliveryRecord, "tryCount" | "lastStatus" | "lastError" | "lastHttpStatus" | "sentAt" | "deliveredAt">>,
  ): DeliveryRecord | undefined {
    const cur = this.store.get(deliveryId);
    if (!cur) return undefined;
    const now = new Date().toISOString();
    const next: DeliveryRecord = {
      ...cur,
      ...patch,
      updatedAt: now,
    };
    this.store.upsert(next);
    return next;
  }
}

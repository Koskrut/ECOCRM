import { Injectable } from "@nestjs/common";
import type { DeliveryRecord } from "../contracts/gateway.types";
import type { DeliveryLogStore } from "./delivery-log-store.interface";

@Injectable()
export class InMemoryDeliveryLogStore implements DeliveryLogStore {
  private readonly byDelivery = new Map<string, DeliveryRecord>();
  private readonly bySession = new Map<string, Set<string>>();

  upsert(record: DeliveryRecord): void {
    this.byDelivery.set(record.deliveryId, { ...record });
    if (!this.bySession.has(record.externalSessionId)) {
      this.bySession.set(record.externalSessionId, new Set());
    }
    this.bySession.get(record.externalSessionId)!.add(record.deliveryId);
  }

  get(deliveryId: string): DeliveryRecord | undefined {
    const r = this.byDelivery.get(deliveryId);
    return r ? { ...r } : undefined;
  }

  listBySession(externalSessionId: string): DeliveryRecord[] {
    const ids = this.bySession.get(externalSessionId);
    if (!ids) return [];
    return [...ids].map((id) => this.byDelivery.get(id)!).filter(Boolean);
  }
}

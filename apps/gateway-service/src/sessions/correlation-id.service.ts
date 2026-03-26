import { Injectable } from "@nestjs/common";
import { randomUUID } from "crypto";

@Injectable()
export class CorrelationIdService {
  newExternalSessionId(): string {
    return randomUUID();
  }

  newDeliveryId(): string {
    return randomUUID();
  }

  newEventRecordId(): string {
    return randomUUID();
  }
}

import { Injectable, Logger } from "@nestjs/common";
import { OnEvent } from "@nestjs/event-emitter";
import { VISIT_COMPLETED_EVENT, type VisitCompletedEvent } from "./field.events";
import { FieldFuelService } from "./field-fuel.service";

@Injectable()
export class FieldFuelListener {
  private readonly logger = new Logger(FieldFuelListener.name);

  constructor(private readonly fuel: FieldFuelService) {}

  @OnEvent(VISIT_COMPLETED_EVENT, { async: true })
  async onVisitCompleted(payload: VisitCompletedEvent) {
    try {
      await this.fuel.recalculateForOwner(payload.ownerId, payload.dateStr);
    } catch (err) {
      this.logger.warn(
        `Fuel recalc failed for ${payload.ownerId} ${payload.dateStr}: ${
          err instanceof Error ? err.message : String(err)
        }`,
      );
    }
  }
}

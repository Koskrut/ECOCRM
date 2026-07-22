import { Injectable, Logger } from "@nestjs/common";
import { Cron } from "@nestjs/schedule";
import { withAuditSource } from "../audit/audit-context";
import { OrdersService } from "./orders.service";

@Injectable()
export class OrdersPickupAutoShipCron {
  private readonly logger = new Logger(OrdersPickupAutoShipCron.name);

  constructor(private readonly orders: OrdersService) {}

  /** End of day (Kyiv): pickup READY_TO_SHIP → SHIPPED. */
  @Cron("0 23 * * *", { timeZone: "Europe/Kyiv" })
  async runNightly() {
    if (process.env.CRON_ENABLED !== "true") return;
    if (process.env.PICKUP_AUTO_SHIP_CRON_DISABLED === "true") return;

    return withAuditSource(
      "cron",
      "cron:pickup-auto-ship",
      async () => {
        try {
          const r = await this.orders.autoShipReadyPickupOrders();
          if (r.candidates > 0) {
            this.logger.log(
              `Pickup auto-ship: candidates=${r.candidates}, shipped=${r.shipped}, failed=${r.failed}`,
            );
          }
        } catch (e: unknown) {
          const msg = e instanceof Error ? e.message : String(e);
          this.logger.error(`Pickup auto-ship failed: ${msg}`);
        }
      },
      { job: "pickup-auto-ship" },
    );
  }
}

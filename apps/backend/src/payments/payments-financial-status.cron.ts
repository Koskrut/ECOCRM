import { Inject, Injectable, Logger } from "@nestjs/common";
import { Cron } from "@nestjs/schedule";
import type { OrderStage } from "@prisma/client";
import { withAuditSource } from "../audit/audit-context";
import { ModuleStateService } from "../modules/module-state.service";
import { ModuleIds } from "../modules/module-ids";
import { computeFinancialStatusFromOrder } from "../orders/order-status-sync.mapper";
import { RECEIVABLES_DEBT_ORDER_STAGES } from "../receivables/receivables.constants";
import { PrismaService } from "../prisma/prisma.service";

const BATCH_SIZE = 200;

/** Terminal stages: no need to refresh financial status for debt tracking. */
const TERMINAL_STAGES: OrderStage[] = ["COMPLETED", "CANCELED", "REFUSED", "FULLY_RETURNED"];

@Injectable()
export class PaymentsFinancialStatusCron {
  private readonly logger = new Logger(PaymentsFinancialStatusCron.name);

  constructor(
    @Inject(PrismaService) private readonly prisma: PrismaService,
    @Inject(ModuleStateService) private readonly modules: ModuleStateService,
  ) {}

  /** Daily at 00:05 Europe/Kyiv — refresh stored financialStatus for open debt orders. */
  @Cron("5 0 * * *", { timeZone: "Europe/Kyiv" })
  async runDaily(): Promise<void> {
    if (process.env.FINANCE_CRON_DISABLED === "true") return;
    if (process.env.CRON_ENABLED !== "true") return;
    if (process.env.MODULE_GATING_ENABLED === "true") {
      const ok = await this.modules.isEffective(ModuleIds.Finance);
      if (!ok) return;
    }
    return withAuditSource("cron", "cron:payments-financial-status", async () => {
      let cursor: string | undefined;
      let updated = 0;
      let scanned = 0;
      try {
        for (;;) {
          const rows = await this.prisma.order.findMany({
            where: {
              debtAmount: { gt: 0 },
              orderStage: { in: [...RECEIVABLES_DEBT_ORDER_STAGES].filter((s) => !TERMINAL_STAGES.includes(s)) },
            },
            take: BATCH_SIZE,
            ...(cursor ? { skip: 1, cursor: { id: cursor } } : {}),
            orderBy: { id: "asc" },
            select: {
              id: true,
              paymentType: true,
              totalAmount: true,
              paidAmount: true,
              debtAmount: true,
              paymentDueDate: true,
              orderStage: true,
              financialStatus: true,
            },
          });
          if (rows.length === 0) break;
          cursor = rows[rows.length - 1]!.id;
          scanned += rows.length;
          for (const o of rows) {
            const next = computeFinancialStatusFromOrder({
              paymentType: o.paymentType,
              totalAmount: Number(o.totalAmount),
              paidAmount: Number(o.paidAmount),
              debtAmount: Number(o.debtAmount),
              paymentDueDate: o.paymentDueDate ?? undefined,
              orderStage: o.orderStage ?? undefined,
            });
            if (next !== o.financialStatus) {
              await this.prisma.order.update({
                where: { id: o.id },
                data: { financialStatus: next },
              });
              updated += 1;
            }
          }
          if (rows.length < BATCH_SIZE) break;
        }
        this.logger.log(
          `Financial status refresh: scanned=${scanned} updated=${updated}`,
        );
      } catch (e: unknown) {
        const msg = e instanceof Error ? e.message : String(e);
        this.logger.error(`Financial status refresh failed: ${msg}`);
      }
    }, { job: "payments-financial-status" });
  }
}

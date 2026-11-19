import { Injectable, Logger } from "@nestjs/common";
import { PrismaService } from "../../prisma/prisma.service";
import { OfficeToolsConfigService } from "./office-tools-config.service";
import { OfficeToolsPaymentsService } from "./office-tools-payments.service";
import { OfficeToolsReceivablesService } from "./office-tools-receivables.service";
import { OfficeToolsStockService } from "./office-tools-stock.service";
import { OFFICE_TOOLS_INTEGRATION } from "./office-tools.constants";

@Injectable()
export class OfficeToolsSyncService {
  private readonly logger = new Logger(OfficeToolsSyncService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly config: OfficeToolsConfigService,
    private readonly stock: OfficeToolsStockService,
    private readonly payments: OfficeToolsPaymentsService,
    private readonly receivables: OfficeToolsReceivablesService,
  ) {}

  async getStatus() {
    const states = await this.prisma.integrationSyncState.findMany({
      where: { integration: OFFICE_TOOLS_INTEGRATION },
    });
    const unmatched = await this.prisma.officeToolsReceipt.count({
      where: { status: "unmatched" },
    });
    return {
      active: await this.config.isActive(),
      unmatchedReceipts: unmatched,
      entities: Object.fromEntries(states.map((s) => [s.entity, s])),
    };
  }

  async syncAll(): Promise<{
    stock: Awaited<ReturnType<OfficeToolsStockService["syncRems"]>>;
    payments: Awaited<ReturnType<OfficeToolsPaymentsService["syncCompRec"]>>;
    receivables: Awaited<ReturnType<OfficeToolsReceivablesService["syncCompBalans"]>>;
  }> {
    await this.config.requireActiveConfig();
    const stock = await this.stock.syncRems();
    const payments = await this.payments.syncCompRec();
    const receivables = await this.receivables.syncCompBalans();
    this.logger.log("Office Tools full sync finished");
    return { stock, payments, receivables };
  }

  syncStock() {
    return this.stock.syncRems();
  }

  syncPayments(fromDate?: string) {
    return this.payments.syncCompRec({ fromDate });
  }

  syncReceivables() {
    return this.receivables.syncCompBalans();
  }
}

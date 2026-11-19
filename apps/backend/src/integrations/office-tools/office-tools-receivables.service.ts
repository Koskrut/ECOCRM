import { forwardRef, Inject, Injectable, Logger } from "@nestjs/common";
import { PrismaService } from "../../prisma/prisma.service";
import { ReceivablesService } from "../../receivables/receivables.service";
import { officeToolsListAllPages, officeToolsListCompBalans } from "./office-tools-client";
import { OfficeToolsConfigService } from "./office-tools-config.service";
import { OFFICE_TOOLS_INTEGRATION } from "./office-tools.constants";
import { debtFromSumAc } from "./office-tools.util";

@Injectable()
export class OfficeToolsReceivablesService {
  private readonly logger = new Logger(OfficeToolsReceivablesService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly config: OfficeToolsConfigService,
    @Inject(forwardRef(() => ReceivablesService))
    private readonly receivables: ReceivablesService,
  ) {}

  async syncCompBalans(): Promise<{ rows: number; snapshotId: string | null }> {
    const cfg = await this.config.requireActiveConfig();
    const ctx = this.config.requestContext(cfg);
    const rows = await officeToolsListAllPages((offset, limit) =>
      officeToolsListCompBalans(ctx, {
        SELECT: [],
        FILTER: {},
        ORDER: { CompID: "ASC" },
        LIMIT: limit,
        OFFSET: offset,
      }),
    );

    const byCode = new Map<string, number>();
    for (const row of rows) {
      const code = row.Code != null ? String(row.Code).trim() : "";
      if (!code) continue;
      const debt = debtFromSumAc(row.SumAC);
      if (debt <= 0) continue;
      byCode.set(code, (byCode.get(code) ?? 0) + debt);
    }

    if (byCode.size === 0) {
      await this.touchSyncState("compbalans", "ok", "0");
      return { rows: rows.length, snapshotId: null };
    }

    const importedById =
      cfg.configuredByUserId ||
      (
        await this.prisma.user.findFirst({
          where: { role: "ADMIN" },
          select: { id: true },
          orderBy: { createdAt: "asc" },
        })
      )?.id;

    if (!importedById) {
      throw new Error("No user available to own receivables snapshot");
    }

    const snapshotId = await this.receivables.importAmountsByCode({
      importedById,
      note: "Office Tools compbalans",
      byCode,
    });

    await this.touchSyncState("compbalans", "ok", String(byCode.size));
    this.logger.log(`Office Tools PDZ sync: rows=${rows.length} codes=${byCode.size}`);
    return { rows: rows.length, snapshotId };
  }

  private async touchSyncState(entity: string, status: string, cursor: string) {
    await this.prisma.integrationSyncState.upsert({
      where: {
        integration_entity: {
          integration: OFFICE_TOOLS_INTEGRATION,
          entity,
        },
      },
      create: {
        integration: OFFICE_TOOLS_INTEGRATION,
        entity,
        lastSyncAt: new Date(),
        lastRunAt: new Date(),
        status,
        lastCursor: cursor,
      },
      update: {
        lastSyncAt: new Date(),
        lastRunAt: new Date(),
        status,
        lastCursor: cursor,
        error: null,
      },
    });
  }
}

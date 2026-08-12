import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import {
  PaymentSourceType,
  PaymentStatus,
  Prisma,
  UserRole,
} from "@prisma/client";
import type { AuthUser } from "../../auth/auth.types";
import { PrismaService } from "../../prisma/prisma.service";
import { PaymentsService } from "../../payments/payments.service";
import {
  parseOneCPaymentsExcel,
  type OneCPaymentExcelRow,
} from "./one-c-payments-excel.parser";
import {
  OneCPaymentsMatcherService,
  type OneCMatchResult,
  type OneCMatchStatus,
} from "./one-c-payments-matcher.service";

export const TARGET_ENTITY_PAYMENTS_1C = "PAYMENTS_1C";

type StagingSummary = {
  phase: string;
  fileName?: string;
  rows?: OneCPaymentExcelRow[];
  matches?: OneCMatchResult[];
  overrides?: Record<string, string>; // importKey → orderId
  commitResult?: {
    created: number;
    skipped: number;
    errors: Array<{ importKey: string; message: string }>;
    paymentIds: string[];
  };
  parseError?: string;
};

export type OneCPaymentsPreviewRow = {
  rowIndex: number;
  importKey: string;
  paidAt: string;
  documentNumber: string;
  enterpriseCode: string;
  enterpriseName: string;
  amountLv: number;
  amountOv: number | null;
  currency: string;
  purpose: string;
  isNovaPay: boolean;
  managerName: string | null;
  status: OneCMatchStatus;
  matchSource: OneCMatchResult["matchSource"];
  matchedRef: string | null;
  order: OneCMatchResult["order"];
  candidateOrders: OneCMatchResult["candidateOrders"];
  contactByCode: OneCMatchResult["contactByCode"];
  warnings: string[];
  amountDebtDelta: number | null;
  overrideOrderId: string | null;
};

@Injectable()
export class OneCPaymentsImportService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly matcher: OneCPaymentsMatcherService,
    private readonly payments: PaymentsService,
  ) {}

  async upload(params: {
    actor: AuthUser;
    fileBuffer: Buffer;
    fileName?: string;
  }) {
    let rows: OneCPaymentExcelRow[];
    try {
      rows = parseOneCPaymentsExcel(params.fileBuffer);
    } catch (e) {
      if (e instanceof BadRequestException) throw e;
      throw new BadRequestException(
        `Failed to parse file: ${e instanceof Error ? e.message : String(e)}`,
      );
    }

    // Serialize dates for JSON storage
    const serializableRows = rows.map((r) => ({
      ...r,
      paidAt: r.paidAt.toISOString(),
    }));

    const matches = await this.matcher.matchRows(rows);

    const job = await this.prisma.dataImportJob.create({
      data: {
        targetEntity: TARGET_ENTITY_PAYMENTS_1C,
        status: "validated",
        fileName: params.fileName ?? null,
        createdById: params.actor.id,
        summary: {
          phase: "validated",
          fileName: params.fileName,
          rows: serializableRows,
          matches,
          overrides: {},
        } as object,
      },
    });

    return {
      jobId: job.id,
      status: job.status,
      fileName: job.fileName,
      rowCount: rows.length,
      summary: this.buildPreview(matches, {}, rows),
    };
  }

  async getJob(jobId: string, actor: AuthUser) {
    const job = await this.loadJob(jobId, actor);
    const summary = (job.summary ?? {}) as StagingSummary;
    const rows = this.hydrateRows(summary.rows ?? []);
    const matches = summary.matches ?? [];
    const overrides = summary.overrides ?? {};
    return {
      jobId: job.id,
      status: job.status,
      fileName: job.fileName,
      createdAt: job.createdAt,
      rowCount: rows.length,
      summary: this.buildPreview(matches, overrides, rows),
      commitResult: summary.commitResult ?? null,
    };
  }

  async setOverrides(
    jobId: string,
    actor: AuthUser,
    overrides: Record<string, string>,
  ) {
    const job = await this.loadJob(jobId, actor);
    if (job.status === "committed") {
      throw new BadRequestException("Job already committed");
    }
    const summary = (job.summary ?? {}) as StagingSummary;
    const nextOverrides = { ...(summary.overrides ?? {}), ...overrides };
    // Empty string clears override
    for (const [k, v] of Object.entries(overrides)) {
      if (!v) delete nextOverrides[k];
    }

    await this.prisma.dataImportJob.update({
      where: { id: job.id },
      data: {
        summary: {
          ...summary,
          overrides: nextOverrides,
          phase: "validated",
        } as object,
      },
    });

    const rows = this.hydrateRows(summary.rows ?? []);
    return {
      jobId: job.id,
      status: "validated",
      summary: this.buildPreview(summary.matches ?? [], nextOverrides, rows),
    };
  }

  async revalidate(jobId: string, actor: AuthUser) {
    const job = await this.loadJob(jobId, actor);
    if (job.status === "committed") {
      throw new BadRequestException("Job already committed");
    }
    const summary = (job.summary ?? {}) as StagingSummary;
    const rows = this.hydrateRows(summary.rows ?? []);
    if (!rows.length) throw new BadRequestException("Job has no staged rows");

    const matches = await this.matcher.matchRows(rows);
    const overrides = summary.overrides ?? {};

    await this.prisma.dataImportJob.update({
      where: { id: job.id },
      data: {
        status: "validated",
        summary: {
          ...summary,
          phase: "validated",
          matches,
          overrides,
        } as object,
      },
    });

    return {
      jobId: job.id,
      status: "validated",
      summary: this.buildPreview(matches, overrides, rows),
    };
  }

  async commit(jobId: string, actor: AuthUser) {
    const job = await this.loadJob(jobId, actor);
    if (job.status === "committed") {
      throw new BadRequestException("Job already committed");
    }
    if (actor.role === UserRole.MANAGER) {
      throw new BadRequestException("Only ADMIN or LEAD can commit 1C payment import");
    }

    const summary = (job.summary ?? {}) as StagingSummary;
    const rows = this.hydrateRows(summary.rows ?? []);
    const matches = summary.matches ?? [];
    const overrides = summary.overrides ?? {};

    if (!rows.length) throw new BadRequestException("Job has no staged rows");

    const matchByKey = new Map(matches.map((m) => [m.importKey, m]));
    const rowByKey = new Map(rows.map((r) => [r.importKey, r]));

    let created = 0;
    let skipped = 0;
    const errors: Array<{ importKey: string; message: string }> = [];
    const paymentIds: string[] = [];
    const touchedOrderIds = new Set<string>();

    for (const row of rows) {
      const match = matchByKey.get(row.importKey);
      const overrideOrderId = overrides[row.importKey]?.trim() || null;

      if (match?.status === "ALREADY_IMPORTED") {
        skipped += 1;
        continue;
      }

      let orderId = overrideOrderId ?? match?.order?.orderId ?? null;
      if (!orderId) {
        skipped += 1;
        continue;
      }

      // Re-check dedup
      const existing = await this.prisma.payment.findUnique({
        where: { oneCImportKey: row.importKey },
        select: { id: true },
      });
      if (existing) {
        skipped += 1;
        continue;
      }

      const order = await this.prisma.order.findUnique({
        where: { id: orderId },
        select: { id: true, contactId: true, clientId: true, companyId: true, currency: true },
      });
      if (!order) {
        errors.push({ importKey: row.importKey, message: `Order ${orderId} not found` });
        continue;
      }

      const noteParts = [row.purpose];
      if (row.isNovaPay) noteParts.unshift("[NovaPay]");
      noteParts.push(`(1C doc #${row.documentNumber})`);
      const note = noteParts.filter(Boolean).join(" ").slice(0, 2000);

      try {
        const payment = await this.prisma.payment.create({
          data: {
            orderId: order.id,
            contactId: order.contactId ?? order.clientId ?? null,
            companyId: order.companyId ?? null,
            sourceType: PaymentSourceType.ONE_C,
            amount: new Prisma.Decimal(row.amountLv),
            currency: row.currency || "UAH",
            amountUsd:
              row.amountOv != null && Number.isFinite(row.amountOv)
                ? new Prisma.Decimal(row.amountOv)
                : null,
            paidAt: row.paidAt,
            status: PaymentStatus.COMPLETED,
            createdByUserId: actor.id,
            note,
            oneCImportKey: row.importKey,
          },
        });
        paymentIds.push(payment.id);
        touchedOrderIds.add(order.id);
        created += 1;
      } catch (e) {
        if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2002") {
          skipped += 1;
          continue;
        }
        errors.push({
          importKey: row.importKey,
          message: e instanceof Error ? e.message : String(e),
        });
      }
    }

    for (const orderId of touchedOrderIds) {
      await this.payments.recalcOrder(orderId);
    }

    const commitResult = { created, skipped, errors, paymentIds };
    await this.prisma.dataImportJob.update({
      where: { id: job.id },
      data: {
        status: "committed",
        summary: {
          ...summary,
          phase: "committed",
          commitResult,
        } as object,
      },
    });

    return {
      jobId: job.id,
      status: "committed",
      ...commitResult,
      rowCount: rows.length,
      unusedRows: rowByKey.size,
    };
  }

  async listJobs(actor: AuthUser, limit = 20) {
    const items = await this.prisma.dataImportJob.findMany({
      where: {
        targetEntity: TARGET_ENTITY_PAYMENTS_1C,
        ...(actor.role === UserRole.ADMIN ? {} : { createdById: actor.id }),
      },
      orderBy: { createdAt: "desc" },
      take: Math.min(Math.max(limit, 1), 100),
      select: {
        id: true,
        status: true,
        fileName: true,
        createdAt: true,
        createdById: true,
        summary: true,
      },
    });
    return {
      items: items.map((j) => {
        const s = (j.summary ?? {}) as StagingSummary;
        return {
          id: j.id,
          status: j.status,
          fileName: j.fileName,
          createdAt: j.createdAt,
          createdById: j.createdById,
          rowCount: Array.isArray(s.rows) ? s.rows.length : 0,
          commitResult: s.commitResult ?? null,
        };
      }),
    };
  }

  private async loadJob(jobId: string, actor: AuthUser) {
    const job = await this.prisma.dataImportJob.findFirst({
      where: {
        id: jobId,
        targetEntity: TARGET_ENTITY_PAYMENTS_1C,
        ...(actor.role === UserRole.ADMIN ? {} : { createdById: actor.id }),
      },
    });
    if (!job) throw new NotFoundException("Import job not found");
    return job;
  }

  private hydrateRows(
    rows: Array<OneCPaymentExcelRow | (Omit<OneCPaymentExcelRow, "paidAt"> & { paidAt: string })>,
  ): OneCPaymentExcelRow[] {
    return rows.map((r) => ({
      ...r,
      paidAt: r.paidAt instanceof Date ? r.paidAt : new Date(r.paidAt),
    }));
  }

  private buildPreview(
    matches: OneCMatchResult[],
    overrides: Record<string, string>,
    rows: OneCPaymentExcelRow[],
  ): {
    counts: Record<string, number>;
    rows: OneCPaymentsPreviewRow[];
  } {
    const rowByKey = new Map(rows.map((r) => [r.importKey, r]));
    const previewRows: OneCPaymentsPreviewRow[] = matches.map((m) => {
      const row = rowByKey.get(m.importKey)!;
      const overrideOrderId = overrides[m.importKey]?.trim() || null;
      return {
        rowIndex: m.rowIndex,
        importKey: m.importKey,
        paidAt: row.paidAt.toISOString(),
        documentNumber: row.documentNumber,
        enterpriseCode: row.enterpriseCode,
        enterpriseName: row.enterpriseName,
        amountLv: row.amountLv,
        amountOv: row.amountOv,
        currency: row.currency,
        purpose: row.purpose,
        isNovaPay: row.isNovaPay,
        managerName: row.managerName,
        status: overrideOrderId && m.status !== "ALREADY_IMPORTED" ? "MATCHED" : m.status,
        matchSource: overrideOrderId ? "manual" : m.matchSource,
        matchedRef: m.matchedRef,
        order: m.order,
        candidateOrders: m.candidateOrders,
        contactByCode: m.contactByCode,
        warnings: m.warnings,
        amountDebtDelta: m.amountDebtDelta,
        overrideOrderId,
      };
    });

    const counts: Record<string, number> = {
      total: previewRows.length,
      MATCHED: 0,
      AMBIGUOUS: 0,
      UNMATCHED: 0,
      ALREADY_IMPORTED: 0,
      CONTACT_MISMATCH: 0,
      readyToCommit: 0,
    };
    for (const r of previewRows) {
      counts[r.status] = (counts[r.status] ?? 0) + 1;
      if (
        r.status !== "ALREADY_IMPORTED" &&
        (r.overrideOrderId || r.order?.orderId) &&
        (r.status === "MATCHED" ||
          r.status === "CONTACT_MISMATCH" ||
          r.overrideOrderId)
      ) {
        counts.readyToCommit = (counts.readyToCommit ?? 0) + 1;
      }
    }

    return { counts, rows: previewRows };
  }
}

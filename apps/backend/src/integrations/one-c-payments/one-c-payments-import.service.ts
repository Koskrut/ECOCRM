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
const DEBT_TOLERANCE = 1;

type PaymentAllocation = {
  orderId: string;
  amount: number;
  amountOv: number | null;
  note: string;
  importKey: string;
};

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
  contactOrders: OneCMatchResult["contactOrders"];
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

  private buildAllocations(params: {
    row: OneCPaymentExcelRow;
    match: OneCMatchResult | undefined;
    overrideOrderId: string | null;
  }): PaymentAllocation[] {
    const { row, match, overrideOrderId } = params;
    const noteParts = [row.purpose];
    if (row.isNovaPay) noteParts.unshift("[NovaPay]");
    noteParts.push(`(1C doc #${row.documentNumber})`);
    const baseNote = noteParts.filter(Boolean).join(" ").slice(0, 2000);

    if (overrideOrderId) {
      return [
        {
          orderId: overrideOrderId,
          amount: row.amountLv,
          amountOv: row.amountOv,
          note: baseNote,
          importKey: row.importKey,
        },
      ];
    }
    if (match?.order?.orderId) {
      return [
        {
          orderId: match.order.orderId,
          amount: row.amountLv,
          amountOv: row.amountOv,
          note: baseNote,
          importKey: row.importKey,
        },
      ];
    }

    const orders = [...(match?.contactOrders ?? [])].sort((a, b) => a.debtAmount - b.debtAmount);
    if (!orders.length) return [];

    let remaining = row.amountLv;
    const allocations: PaymentAllocation[] = [];
    let idx = 1;
    for (const o of orders) {
      if (remaining <= DEBT_TOLERANCE) break;
      const amount = Math.min(remaining, o.debtAmount);
      if (amount <= 0) continue;
      const ratio = row.amountLv > 0 ? amount / row.amountLv : 0;
      allocations.push({
        orderId: o.orderId,
        amount: Number(amount.toFixed(2)),
        amountOv:
          row.amountOv != null && Number.isFinite(row.amountOv)
            ? Number((row.amountOv * ratio).toFixed(2))
            : null,
        note: `${baseNote} [split ${idx}]`,
        importKey: `${row.importKey}#${idx}`,
      });
      remaining -= amount;
      idx += 1;
    }
    const allocated = allocations.reduce((sum, a) => sum + a.amount, 0);
    if (Math.abs(allocated - row.amountLv) > DEBT_TOLERANCE) return [];
    return allocations;
  }

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
    const summary = this.stagingSummary(job.summary);
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
    const summary = this.stagingSummary(job.summary);
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
    const summary = this.stagingSummary(job.summary);
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

    const summary = this.stagingSummary(job.summary);
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

      const allocations = this.buildAllocations({ row, match, overrideOrderId });
      if (!allocations.length) {
        skipped += 1;
        continue;
      }

      // Re-check dedup
      const existing = await this.prisma.payment.findFirst({
        where: {
          OR: [
            { oneCImportKey: row.importKey },
            { oneCImportKey: { startsWith: `${row.importKey}#` } },
          ],
        },
        select: { id: true },
      });
      if (existing) {
        skipped += 1;
        continue;
      }

      for (const allocation of allocations) {
        const order = await this.prisma.order.findUnique({
          where: { id: allocation.orderId },
          select: { id: true, contactId: true, clientId: true, companyId: true, currency: true },
        });
        if (!order) {
          errors.push({ importKey: row.importKey, message: `Order ${allocation.orderId} not found` });
          continue;
        }

        try {
          const payment = await this.prisma.payment.create({
            data: {
              orderId: order.id,
              contactId: order.contactId ?? order.clientId ?? null,
              companyId: order.companyId ?? null,
              sourceType: PaymentSourceType.ONE_C,
              amount: new Prisma.Decimal(allocation.amount),
              currency: row.currency || "UAH",
              amountUsd:
                allocation.amountOv != null && Number.isFinite(allocation.amountOv)
                  ? new Prisma.Decimal(allocation.amountOv)
                  : null,
              paidAt: row.paidAt,
              status: PaymentStatus.COMPLETED,
              createdByUserId: actor.id,
              note: allocation.note,
              oneCImportKey: allocation.importKey,
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

  async createContactFromImport(
    jobId: string,
    actor: AuthUser,
    body: { enterpriseCode: string; enterpriseName: string },
  ) {
    await this.loadJob(jobId, actor);
    if (!body.enterpriseCode?.trim()) {
      throw new BadRequestException("enterpriseCode is required");
    }

    const existing = await this.prisma.contact.findFirst({
      where: {
        OR: [
          { externalCode: body.enterpriseCode },
          { externalCode: body.enterpriseCode.padStart(9, "0") },
        ],
      },
      select: { id: true, firstName: true, lastName: true, externalCode: true },
    });
    if (existing) {
      return { created: false, contactId: existing.id, message: "Contact already exists" };
    }

    const nameParts = body.enterpriseName.trim().split(/\s+/);
    const contact = await this.prisma.contact.create({
      data: {
        firstName: nameParts.slice(1).join(" ") || body.enterpriseName.trim(),
        lastName: nameParts[0] ?? "",
        phone: "",
        region: "",
        externalCode: body.enterpriseCode,
        documentDisplayName: body.enterpriseName.trim(),
      },
      select: { id: true, firstName: true, lastName: true, externalCode: true, documentDisplayName: true },
    });

    return { created: true, contactId: contact.id, contact };
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
        const s = this.stagingSummary(j.summary);
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

  private stagingSummary(raw: Prisma.JsonValue | null | undefined): StagingSummary {
    return (raw ?? {}) as unknown as StagingSummary;
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
        contactOrders: m.contactOrders,
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
      CONTACT_NOT_FOUND: 0,
      readyToCommit: 0,
    };
    for (const r of previewRows) {
      counts[r.status] = (counts[r.status] ?? 0) + 1;
      if (
        r.status !== "ALREADY_IMPORTED" &&
        (r.overrideOrderId || r.order?.orderId || r.contactOrders.length > 1) &&
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

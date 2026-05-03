import { BadRequestException, Injectable, NotFoundException } from "@nestjs/common";
import { PrismaService } from "../prisma/prisma.service";
import { getPhoneNormalizedDigits, normalizePhoneToE164 } from "../common/phone.utils";

const MAX_STAGING_CSV_BYTES = 450_000;

export type ContactCsvRow = { phone: string; firstName: string; lastName: string };

@Injectable()
export class DataImportService {
  constructor(private readonly prisma: PrismaService) {}

  parseContactCsv(text: string): ContactCsvRow[] {
    const lines = text.split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
    if (lines.length < 2) throw new BadRequestException("CSV must include header and at least one row");
    const header = lines[0]!.toLowerCase().split(",").map((h) => h.trim());
    const phoneIdx = header.findIndex((h) => ["phone", "телефон", "tel"].includes(h));
    const fnIdx = header.findIndex((h) =>
      ["firstname", "first_name", "first name", "ім'я", "имя"].includes(h),
    );
    const lnIdx = header.findIndex((h) =>
      ["lastname", "last_name", "last name", "прізвище", "фамилия"].includes(h),
    );
    if (phoneIdx < 0 || fnIdx < 0 || lnIdx < 0) {
      throw new BadRequestException("CSV header must include phone, first_name, last_name columns");
    }
    const rows: ContactCsvRow[] = [];
    for (let i = 1; i < lines.length; i++) {
      const cols = lines[i]!.split(",").map((c) => c.trim().replace(/^"|"$/g, ""));
      const phone = cols[phoneIdx] ?? "";
      const firstName = cols[fnIdx] ?? "";
      const lastName = cols[lnIdx] ?? "";
      if (!phone || !firstName || !lastName) continue;
      rows.push({ phone, firstName, lastName });
    }
    return rows;
  }

  async createContactsStagingJob(userId: string, fileName: string | undefined, csvText: string) {
    const buf = Buffer.byteLength(csvText, "utf8");
    if (buf > MAX_STAGING_CSV_BYTES) {
      throw new BadRequestException(`CSV exceeds max size of ${MAX_STAGING_CSV_BYTES} bytes`);
    }
    const job = await this.prisma.dataImportJob.create({
      data: {
        targetEntity: "CONTACTS",
        status: "uploaded",
        fileName: fileName ?? null,
        createdById: userId,
        summary: { stagingCsv: csvText, phase: "uploaded" } as object,
      },
    });
    return { jobId: job.id, status: job.status };
  }

  async validateJob(jobId: string, userId: string) {
    const job = await this.prisma.dataImportJob.findFirst({
      where: { id: jobId, createdById: userId },
    });
    if (!job) throw new NotFoundException("Import job not found");
    const summary = (job.summary ?? {}) as { stagingCsv?: string };
    if (!summary.stagingCsv || typeof summary.stagingCsv !== "string") {
      throw new BadRequestException("Job has no staged CSV; create a new job");
    }
    let rows: ContactCsvRow[];
    try {
      rows = this.parseContactCsv(summary.stagingCsv);
    } catch (e) {
      await this.prisma.dataImportJob.update({
        where: { id: job.id },
        data: {
          status: "failed",
          summary: {
            ...summary,
            phase: "failed",
            parseError: e instanceof Error ? e.message : String(e),
          } as object,
        },
      });
      throw e;
    }
    const validationErrors: string[] = [];
    for (let i = 0; i < rows.length; i++) {
      const r = rows[i]!;
      const phoneNormalized = getPhoneNormalizedDigits(r.phone);
      if (!phoneNormalized) {
        validationErrors.push(`Row ${i + 2}: invalid phone`);
      }
    }
    const nextSummary = {
      ...summary,
      phase: "validated",
      rowCount: rows.length,
      validationErrors: validationErrors.slice(0, 200),
      validatedAt: new Date().toISOString(),
    };
    await this.prisma.dataImportJob.update({
      where: { id: job.id },
      data: {
        status: validationErrors.length ? "validated_with_errors" : "validated",
        summary: nextSummary as object,
      },
    });
    return {
      jobId: job.id,
      status: validationErrors.length ? "validated_with_errors" : "validated",
      rowCount: rows.length,
      validationErrors,
    };
  }

  async commitContactsJob(jobId: string, userId: string) {
    const job = await this.prisma.dataImportJob.findFirst({
      where: { id: jobId, createdById: userId },
    });
    if (!job) throw new NotFoundException("Import job not found");
    if (!["validated", "validated_with_errors"].includes(job.status)) {
      throw new BadRequestException(
        `Run POST .../validate first; cannot commit from status ${job.status}`,
      );
    }
    const summary = (job.summary ?? {}) as { stagingCsv?: string };
    if (!summary.stagingCsv || typeof summary.stagingCsv !== "string") {
      throw new BadRequestException("Job has no staged CSV");
    }
    await this.prisma.dataImportJob.update({
      where: { id: job.id },
      data: { status: "committing", summary: { ...summary, phase: "committing" } as object },
    });

    const rows = this.parseContactCsv(summary.stagingCsv);
    let created = 0;
    let skipped = 0;
    const errors: string[] = [];

    for (let i = 0; i < rows.length; i++) {
      const r = rows[i]!;
      try {
        const phoneNormalized = getPhoneNormalizedDigits(r.phone);
        if (!phoneNormalized) {
          errors.push(`Row ${i + 2}: invalid phone`);
          skipped++;
          continue;
        }
        const taken = await this.prisma.contact.findFirst({
          where: { OR: [{ phoneNormalized }, { phones: { some: { phoneNormalized } } }] },
          select: { id: true },
        });
        if (taken) {
          skipped++;
          continue;
        }
        const phoneCanonical = normalizePhoneToE164(r.phone) ?? r.phone.trim();
        await this.prisma.contact.create({
          data: {
            firstName: r.firstName,
            lastName: r.lastName,
            phone: phoneCanonical,
            phoneNormalized,
            ownerId: userId,
          },
        });
        created++;
      } catch (e) {
        errors.push(`Row ${i + 2}: ${e instanceof Error ? e.message : String(e)}`);
        skipped++;
      }
    }

    const finalSummary = {
      ...summary,
      phase: "committed",
      rowCount: rows.length,
      created,
      skipped,
      errors: errors.slice(0, 50),
      committedAt: new Date().toISOString(),
    };
    await this.prisma.dataImportJob.update({
      where: { id: job.id },
      data: { status: "committed", summary: finalSummary as object },
    });
    return { jobId: job.id, ...finalSummary };
  }

  /** Legacy one-shot import (upload + validate + commit). */
  async createContactsImportJob(userId: string, fileName: string | undefined, csvText: string) {
    const { jobId } = await this.createContactsStagingJob(userId, fileName, csvText);
    await this.validateJob(jobId, userId);
    return this.commitContactsJob(jobId, userId);
  }

  async listJobs(userId: string, limit = 30) {
    const items = await this.prisma.dataImportJob.findMany({
      where: { createdById: userId, targetEntity: "CONTACTS" },
      orderBy: { createdAt: "desc" },
      take: Math.min(100, limit),
      select: {
        id: true,
        status: true,
        fileName: true,
        createdAt: true,
        updatedAt: true,
        summary: true,
      },
    });
    return {
      items: items.map((j) => ({
        ...j,
        summary: sanitizeJobSummaryForList(j.summary),
      })),
    };
  }

  async getJob(jobId: string, userId: string) {
    const job = await this.prisma.dataImportJob.findFirst({
      where: { id: jobId, createdById: userId },
    });
    if (!job) throw new NotFoundException("Import job not found");
    return {
      ...job,
      summary: sanitizeJobSummaryForList(job.summary),
    };
  }
}

function sanitizeJobSummaryForList(summary: unknown): unknown {
  if (!summary || typeof summary !== "object") return summary;
  const s = { ...(summary as Record<string, unknown>) };
  delete s.stagingCsv;
  return s;
}

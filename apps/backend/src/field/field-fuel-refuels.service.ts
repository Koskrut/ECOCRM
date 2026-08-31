import {
  BadRequestException,
  ForbiddenException,
  Inject,
  Injectable,
  NotFoundException,
  forwardRef,
} from "@nestjs/common";
import { FuelCompensationStatus, UserRole } from "@prisma/client";
import { createReadStream, existsSync } from "fs";
import { mkdir, rename, unlink, writeFile } from "fs/promises";
import { join, dirname } from "path";
import { randomUUID } from "crypto";
import type { Response } from "express";
import type { AuthUser } from "../auth/auth.types";
import { isKyivYmdAfterToday } from "../crm-timezone";
import { PrismaService } from "../prisma/prisma.service";
import { assertCanAccessOwner } from "../visits/visits-owner-scope";
import type { FuelRefuelEntryDto, FuelRefuelTotals } from "./field-fuel-refuels.types";
import { FieldFuelService } from "./field-fuel.service";

const MAX_FILE_BYTES = 5 * 1024 * 1024;
const MAX_REFUELS_PER_DAY = 10;
const MAX_AMOUNT = 100_000;
const MAX_LITERS = 500;

const ALLOWED_MIME = new Set([
  "image/jpeg",
  "image/png",
  "image/webp",
  "image/heic",
  "image/heif",
]);

const EXT_BY_MIME: Record<string, string> = {
  "image/jpeg": ".jpg",
  "image/png": ".png",
  "image/webp": ".webp",
  "image/heic": ".heic",
  "image/heif": ".heif",
};

@Injectable()
export class FieldFuelRefuelsService {
  private readonly baseDir: string;

  constructor(
    private readonly prisma: PrismaService,
    @Inject(forwardRef(() => FieldFuelService))
    private readonly fuel: FieldFuelService,
  ) {
    this.baseDir = process.env.FUEL_RECEIPTS_DIR?.trim() || "/data/fuel-receipts";
  }

  private parseUtcDay(dateStr: string): Date {
    return this.fuel.parseUtcDay(dateStr);
  }

  private serialize(row: {
    id: string;
    ownerId: string;
    date: Date;
    fuelDayReportId: string;
    liters: { toNumber(): number } | number;
    amount: { toNumber(): number } | number;
    currency: string;
    receiptFileName: string;
    receiptMimeType: string;
    receiptSizeBytes: number;
    createdAt: Date;
    updatedAt: Date;
  }): FuelRefuelEntryDto {
    return {
      id: row.id,
      ownerId: row.ownerId,
      date: row.date.toISOString().slice(0, 10),
      fuelDayReportId: row.fuelDayReportId,
      liters: Number(row.liters),
      amount: Number(row.amount),
      currency: row.currency,
      receiptFileName: row.receiptFileName,
      receiptMimeType: row.receiptMimeType,
      receiptSizeBytes: row.receiptSizeBytes,
      createdAt: row.createdAt.toISOString(),
      updatedAt: row.updatedAt.toISOString(),
    };
  }

  private absolutePath(storageKey: string): string {
    const normalized = storageKey.replace(/^\/+/, "");
    if (normalized.includes("..")) {
      throw new BadRequestException("Invalid storage key");
    }
    return join(this.baseDir, normalized);
  }

  private async ensureBaseDir(): Promise<void> {
    await mkdir(this.baseDir, { recursive: true });
  }

  private parsePositiveNumber(raw: string | undefined, label: string, max: number): number {
    if (raw == null || raw.trim() === "") {
      throw new BadRequestException(`${label} is required`);
    }
    const n = Number(raw.replace(",", "."));
    if (!Number.isFinite(n) || n <= 0) {
      throw new BadRequestException(`${label} must be greater than 0`);
    }
    if (n > max) {
      throw new BadRequestException(`${label} exceeds maximum allowed value`);
    }
    return Math.round(n * 1000) / 1000;
  }

  private assertNotFutureDate(dateStr: string): void {
    if (isKyivYmdAfterToday(dateStr)) {
      throw new BadRequestException("Не можна додати заправку на майбутню дату");
    }
  }

  private assertCanModifyReport(status: FuelCompensationStatus): void {
    if (status === FuelCompensationStatus.PAID) {
      throw new ForbiddenException("Cannot modify refuels after report is paid");
    }
  }

  private async assertOwnerCanCreate(actor: AuthUser, ownerId: string): Promise<void> {
    if (ownerId !== actor.id) {
      throw new ForbiddenException("Only the report owner can add refuels");
    }
  }

  async listForDay(
    actor: AuthUser | undefined,
    dateStr: string,
    ownerIdOverride?: string,
  ): Promise<{ items: FuelRefuelEntryDto[]; totals: FuelRefuelTotals }> {
    if (!actor) throw new BadRequestException("User is required");
    const ownerId = await this.fuel.resolveOwnerId(actor, ownerIdOverride);
    const date = this.parseUtcDay(dateStr);

    const rows = await this.prisma.fuelRefuelEntry.findMany({
      where: { ownerId, date },
      orderBy: { createdAt: "asc" },
    });

    return {
      items: rows.map((r: (typeof rows)[number]) => this.serialize(r)),
      totals: this.sumRows(rows),
    };
  }

  sumRows(
    rows: Array<{ liters: { toNumber(): number } | number; amount: { toNumber(): number } | number }>,
  ): FuelRefuelTotals {
    let liters = 0;
    let amount = 0;
    for (const r of rows) {
      liters += Number(r.liters);
      amount += Number(r.amount);
    }
    return {
      count: rows.length,
      liters: Math.round(liters * 1000) / 1000,
      amount: Math.round(amount * 100) / 100,
    };
  }

  async getTotalsByReportIds(
    reportIds: string[],
  ): Promise<Map<string, FuelRefuelTotals>> {
    const map = new Map<string, FuelRefuelTotals>();
    if (reportIds.length === 0) return map;

    const rows = await this.prisma.fuelRefuelEntry.findMany({
      where: { fuelDayReportId: { in: reportIds } },
      select: { fuelDayReportId: true, liters: true, amount: true },
    });

    const grouped = new Map<string, typeof rows>();
    for (const r of rows) {
      const list = grouped.get(r.fuelDayReportId) ?? [];
      list.push(r);
      grouped.set(r.fuelDayReportId, list);
    }

    for (const id of reportIds) {
      map.set(id, this.sumRows(grouped.get(id) ?? []));
    }
    return map;
  }

  async create(
    actor: AuthUser | undefined,
    dateStr: string,
    body: { liters?: string; amount?: string },
    file: { buffer?: Buffer; originalname?: string; mimetype?: string; size?: number } | undefined,
    ownerIdOverride?: string,
  ): Promise<FuelRefuelEntryDto> {
    if (!actor) throw new BadRequestException("User is required");
    if (!dateStr) throw new BadRequestException("date is required");
    if (!file?.buffer?.length) {
      throw new BadRequestException("Receipt photo is required");
    }

    const ownerId = await this.fuel.resolveOwnerId(actor, ownerIdOverride);
    await this.assertOwnerCanCreate(actor, ownerId);
    this.assertNotFutureDate(dateStr);

    const liters = this.parsePositiveNumber(body.liters, "liters", MAX_LITERS);
    const amount = this.parsePositiveNumber(body.amount, "amount", MAX_AMOUNT);

    const mime = (file.mimetype ?? "").toLowerCase();
    if (!ALLOWED_MIME.has(mime)) {
      throw new BadRequestException("Unsupported image type");
    }
    if (file.size != null && file.size > MAX_FILE_BYTES) {
      throw new BadRequestException("Receipt photo exceeds 5 MB limit");
    }
    if (file.buffer.length > MAX_FILE_BYTES) {
      throw new BadRequestException("Receipt photo exceeds 5 MB limit");
    }

    const day = await this.fuel.getOrCreateDay(actor, dateStr, ownerId);
    this.assertCanModifyReport(day.report.compensationStatus);

    const date = this.parseUtcDay(dateStr);
    const dayShift = await this.prisma.fieldShift.findFirst({
      where: { ownerId, date },
      orderBy: { startedAt: "desc" },
      select: { mobilityMode: true },
    });
    if (dayShift?.mobilityMode === "WALK_TRANSIT") {
      throw new BadRequestException(
        "Cannot add refuels on a walk / public-transit day (no fuel compensation)",
      );
    }

    const existingCount = await this.prisma.fuelRefuelEntry.count({
      where: { ownerId, date },
    });
    if (existingCount >= MAX_REFUELS_PER_DAY) {
      throw new BadRequestException(`Maximum ${MAX_REFUELS_PER_DAY} refuels per day`);
    }

    const ext = EXT_BY_MIME[mime] ?? ".jpg";
    const fileId = randomUUID();
    const storageKey = `${ownerId}/${dateStr}/${fileId}${ext}`;
    const finalPath = this.absolutePath(storageKey);
    const tempPath = `${finalPath}.tmp`;

    await this.ensureBaseDir();
    await mkdir(dirname(finalPath), { recursive: true });

    let createdId: string | null = null;
    try {
      await writeFile(tempPath, file.buffer);

      const row = await this.prisma.fuelRefuelEntry.create({
        data: {
          ownerId,
          date,
          fuelDayReportId: day.report.id,
          liters,
          amount,
          currency: "UAH",
          receiptStorageKey: storageKey,
          receiptFileName: file.originalname?.trim() || `receipt${ext}`,
          receiptMimeType: mime,
          receiptSizeBytes: file.buffer.length,
        },
      });
      createdId = row.id;

      await rename(tempPath, finalPath);
      return this.serialize(row);
    } catch (e) {
      await unlink(tempPath).catch(() => undefined);
      if (createdId) {
        await this.prisma.fuelRefuelEntry.delete({ where: { id: createdId } }).catch(() => undefined);
      }
      throw e;
    }
  }

  async delete(actor: AuthUser | undefined, id: string): Promise<{ ok: true }> {
    if (!actor) throw new BadRequestException("User is required");

    const row = await this.prisma.fuelRefuelEntry.findUnique({
      where: { id },
      include: { fuelDayReport: { select: { compensationStatus: true } } },
    });
    if (!row) throw new NotFoundException("Refuel not found");

    await assertCanAccessOwner(this.prisma, actor, row.ownerId);
    const isOwner = row.ownerId === actor.id;
    const isAdmin = actor.role === UserRole.ADMIN;
    if (!isOwner && !isAdmin) {
      throw new ForbiddenException("Only the owner or admin can delete refuels");
    }
    this.assertCanModifyReport(row.fuelDayReport.compensationStatus);

    const filePath = this.absolutePath(row.receiptStorageKey);
    await this.prisma.fuelRefuelEntry.delete({ where: { id } });
    if (existsSync(filePath)) {
      await unlink(filePath).catch(() => undefined);
    }
    return { ok: true };
  }

  async streamReceipt(
    actor: AuthUser | undefined,
    id: string,
    res: Response,
  ): Promise<void> {
    if (!actor) throw new BadRequestException("User is required");

    const row = await this.prisma.fuelRefuelEntry.findUnique({ where: { id } });
    if (!row) {
      res.status(404).json({ message: "Refuel not found" });
      return;
    }

    await assertCanAccessOwner(this.prisma, actor, row.ownerId);

    const filePath = this.absolutePath(row.receiptStorageKey);
    if (!existsSync(filePath)) {
      res.status(404).json({ message: "Receipt file not found" });
      return;
    }

    res.setHeader("Content-Type", row.receiptMimeType);
    res.setHeader("Cache-Control", "private, max-age=3600");
    createReadStream(filePath).pipe(res);
  }
}

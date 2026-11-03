import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import { Prisma } from "@prisma/client";
import { PrismaService } from "../prisma/prisma.service";
import type { CreateWarehouseDto } from "./dto/create-warehouse.dto";
import type { UpdateWarehouseDto } from "./dto/update-warehouse.dto";

export type WarehouseListItem = {
  id: string;
  name: string;
  sortOrder: number;
  externalCode: string | null;
  responsibleUserId: string | null;
  responsibleUser: { id: string; fullName: string } | null;
};

const warehouseSelect = {
  id: true,
  name: true,
  sortOrder: true,
  externalCode: true,
  responsibleUserId: true,
  responsibleUser: { select: { id: true, fullName: true } },
} as const;

@Injectable()
export class WarehousesService {
  constructor(private readonly prisma: PrismaService) {}

  async list(): Promise<WarehouseListItem[]> {
    const rows = await this.prisma.warehouse.findMany({
      orderBy: { sortOrder: "asc" },
      select: warehouseSelect,
    });
    return rows;
  }

  async create(dto: CreateWarehouseDto): Promise<WarehouseListItem> {
    const name = dto.name?.trim() ?? "";
    if (!name) throw new BadRequestException("Warehouse name is required");
    await this.assertNameUnique(name);

    const externalCode = this.normalizeExternalCode(dto.externalCode);
    if (externalCode) await this.assertExternalCodeUnique(externalCode);

    const responsibleUserId = await this.normalizeResponsibleUserId(dto.responsibleUserId);

    let sortOrder = dto.sortOrder;
    if (sortOrder === undefined || !Number.isFinite(sortOrder)) {
      const agg = await this.prisma.warehouse.aggregate({ _max: { sortOrder: true } });
      sortOrder = (agg._max.sortOrder ?? -1) + 1;
    }

    const created = await this.prisma.warehouse.create({
      data: {
        name,
        sortOrder: Math.floor(sortOrder),
        externalCode,
        responsibleUserId,
      },
      select: warehouseSelect,
    });
    return created;
  }

  async update(id: string, dto: UpdateWarehouseDto): Promise<WarehouseListItem> {
    const w = await this.prisma.warehouse.findUnique({ where: { id } });
    if (!w) throw new NotFoundException("Warehouse not found");

    const name = dto.name !== undefined ? dto.name.trim() : undefined;
    if (name !== undefined) {
      if (!name) throw new BadRequestException("Warehouse name cannot be empty");
      await this.assertNameUnique(name, id);
    }

    const externalCode =
      dto.externalCode === undefined ? undefined : this.normalizeExternalCode(dto.externalCode);
    if (externalCode) await this.assertExternalCodeUnique(externalCode, id);

    const sortOrder =
      dto.sortOrder !== undefined && Number.isFinite(dto.sortOrder)
        ? Math.floor(dto.sortOrder)
        : undefined;

    const responsibleUserId =
      dto.responsibleUserId === undefined
        ? undefined
        : await this.normalizeResponsibleUserId(dto.responsibleUserId);

    try {
      const updated = await this.prisma.warehouse.update({
        where: { id },
        data: {
          ...(name !== undefined ? { name } : {}),
          ...(sortOrder !== undefined ? { sortOrder } : {}),
          ...(dto.externalCode !== undefined ? { externalCode } : {}),
          ...(responsibleUserId !== undefined ? { responsibleUserId } : {}),
        },
        select: warehouseSelect,
      });
      return updated;
    } catch (e) {
      if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2002") {
        throw new ConflictException("Warehouse with this name or external code already exists");
      }
      throw e;
    }
  }

  async remove(id: string): Promise<void> {
    const w = await this.prisma.warehouse.findUnique({ where: { id } });
    if (!w) throw new NotFoundException("Warehouse not found");

    const [stockWithQty, orderCount] = await Promise.all([
      this.prisma.productWarehouseStock.count({
        where: { warehouseId: id, qty: { gt: 0 } },
      }),
      this.prisma.order.count({ where: { warehouseId: id } }),
    ]);

    if (stockWithQty > 0) {
      throw new ConflictException(
        "Cannot delete warehouse: it has products with non-zero stock. Clear stock first.",
      );
    }
    if (orderCount > 0) {
      throw new ConflictException(
        "Cannot delete warehouse: it is linked to existing orders.",
      );
    }

    await this.prisma.warehouse.delete({ where: { id } });
  }

  /** First warehouse by sortOrder; fallback to «Днепр» for legacy data. */
  async getDefaultWarehouseId(): Promise<string | null> {
    const first = await this.prisma.warehouse.findFirst({
      orderBy: { sortOrder: "asc" },
      select: { id: true },
    });
    if (first) return first.id;

    const dnipro = await this.prisma.warehouse.findFirst({
      where: { name: "Днепр" },
      select: { id: true },
    });
    return dnipro?.id ?? null;
  }

  private normalizeExternalCode(value: string | null | undefined): string | null {
    if (value === undefined || value === null) return null;
    const s = String(value).trim();
    return s.length > 0 ? s : null;
  }

  private async normalizeResponsibleUserId(
    value: string | null | undefined,
  ): Promise<string | null> {
    if (value === undefined || value === null) return null;
    const id = String(value).trim();
    if (!id) return null;
    const user = await this.prisma.user.findUnique({
      where: { id },
      select: { id: true, isActive: true },
    });
    if (!user) throw new BadRequestException("Responsible user not found");
    if (!user.isActive) throw new BadRequestException("Responsible user is inactive");
    return user.id;
  }

  private async assertNameUnique(name: string, excludeId?: string): Promise<void> {
    const existing = await this.prisma.warehouse.findFirst({
      where: {
        name: { equals: name, mode: "insensitive" },
        ...(excludeId ? { id: { not: excludeId } } : {}),
      },
      select: { id: true },
    });
    if (existing) {
      throw new ConflictException(`Warehouse "${name}" already exists`);
    }
  }

  private async assertExternalCodeUnique(code: string, excludeId?: string): Promise<void> {
    const existing = await this.prisma.warehouse.findFirst({
      where: {
        externalCode: code,
        ...(excludeId ? { id: { not: excludeId } } : {}),
      },
      select: { id: true },
    });
    if (existing) {
      throw new ConflictException(`External code "${code}" is already used by another warehouse`);
    }
  }
}

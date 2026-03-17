import { Injectable, NotFoundException } from "@nestjs/common";
import { PrismaService } from "../prisma/prisma.service";

export type WarehouseListItem = { id: string; name: string; sortOrder: number; externalCode: string | null };

@Injectable()
export class WarehousesService {
  constructor(private readonly prisma: PrismaService) {}

  async list(): Promise<WarehouseListItem[]> {
    const rows = await this.prisma.warehouse.findMany({
      orderBy: { sortOrder: "asc" },
      select: { id: true, name: true, sortOrder: true, externalCode: true },
    });
    return rows;
  }

  async update(id: string, data: { externalCode?: string | null }): Promise<WarehouseListItem> {
    const w = await this.prisma.warehouse.findUnique({ where: { id } });
    if (!w) throw new NotFoundException("Warehouse not found");
    const updated = await this.prisma.warehouse.update({
      where: { id },
      data: { externalCode: data.externalCode === undefined ? undefined : data.externalCode },
      select: { id: true, name: true, sortOrder: true, externalCode: true },
    });
    return updated;
  }

  /** Id склада «Днепр» для подстановки по умолчанию в заказ. */
  async getDefaultWarehouseId(): Promise<string | null> {
    const wh = await this.prisma.warehouse.findFirst({
      where: { name: "Днепр" },
      orderBy: { sortOrder: "asc" },
      select: { id: true },
    });
    return wh?.id ?? null;
  }
}

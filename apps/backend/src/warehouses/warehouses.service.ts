import { Injectable } from "@nestjs/common";
import { PrismaService } from "../prisma/prisma.service";

export type WarehouseListItem = { id: string; name: string; sortOrder: number };

@Injectable()
export class WarehousesService {
  constructor(private readonly prisma: PrismaService) {}

  async list(): Promise<WarehouseListItem[]> {
    const rows = await this.prisma.warehouse.findMany({
      orderBy: { sortOrder: "asc" },
      select: { id: true, name: true, sortOrder: true },
    });
    return rows;
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

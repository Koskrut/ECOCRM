import { Injectable } from "@nestjs/common";
import { PrismaClient } from "@prisma/client";

@Injectable()
export class NpCatalogService {
  constructor(private readonly prisma: PrismaClient) {}

  async searchCities(query: string) {
    return this.prisma.npCity.findMany({
      where: {
        isActive: true,
        description: { contains: query, mode: "insensitive" },
      },
      orderBy: { description: "asc" },
      take: 20,
    });
  }

  async searchWarehouses(cityRef: string, type: "warehouse" | "postomat", query: string) {
    return this.prisma.npWarehouse.findMany({
      where: {
        cityRef,
        isActive: true,
        isPostomat: type === "postomat",
        OR: [
          { description: { contains: query, mode: "insensitive" } },
          { number: { contains: query, mode: "insensitive" } },
        ],
      },
      orderBy: [{ number: "asc" }, { description: "asc" }],
      take: 30,
    });
  }

  async searchStreets(cityRef: string, query: string) {
    return this.prisma.npStreet.findMany({
      where: {
        cityRef,
        street: { contains: query, mode: "insensitive" },
      },
      orderBy: { street: "asc" },
      take: 30,
    });
  }
}

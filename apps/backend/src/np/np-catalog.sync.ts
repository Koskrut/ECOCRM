import { Injectable, Logger } from "@nestjs/common";
import { Cron } from "@nestjs/schedule";
import { PrismaClient } from "@prisma/client";
import { NpClient } from "./np-client.service";

@Injectable()
export class NpCatalogSync {
  private readonly logger = new Logger(NpCatalogSync.name);

  constructor(
    private readonly prisma: PrismaClient,
    private readonly np: NpClient,
  ) {}

  // каждый день в 03:00 по серверному TZ (у тебя Europe/Zaporozhye — отлично)
  @Cron("0 3 * * *")
  async syncDaily() {
    this.logger.log("NP daily sync started");

    await this.syncCities();
    await this.syncWarehouses();

    this.logger.log("NP daily sync finished");
  }

  private async syncCities() {
    // TODO: подставь точный calledMethod: обычно Address/getCities
    const res = await this.np.call<any>("Address", "getCities", {});
    const items = res.data ?? [];

    // Мягкая деактивация: сначала пометим все как неактивные, потом активируем пришедшие
    await this.prisma.npCity.updateMany({ data: { isActive: false } });

    for (const c of items) {
      await this.prisma.npCity.upsert({
        where: { ref: c.Ref },
        update: {
          description: c.Description,
          area: c.Area,
          areaDescription: c.AreaDescription,
          region: c.Region,
          settlementTypeDescription: c.SettlementTypeDescription,
          isActive: true,
        },
        create: {
          ref: c.Ref,
          description: c.Description,
          area: c.Area,
          areaDescription: c.AreaDescription,
          region: c.Region,
          settlementTypeDescription: c.SettlementTypeDescription,
          isActive: true,
        },
      });
    }
  }

  private async syncWarehouses() {
    // TODO: подставь точный calledMethod: Address/getWarehouses
    const res = await this.np.call<any>("Address", "getWarehouses", {});
    const items = res.data ?? [];

    await this.prisma.npWarehouse.updateMany({ data: { isActive: false } });

    for (const w of items) {
      const isPostomat =
        String(w.CategoryOfWarehouse || "")
          .toLowerCase()
          .includes("postomat") ||
        String(w.TypeOfWarehouse || "")
          .toLowerCase()
          .includes("postomat") ||
        String(w.Description || "")
          .toLowerCase()
          .includes("поштомат");

      await this.prisma.npWarehouse.upsert({
        where: { ref: w.Ref },
        update: {
          cityRef: w.CityRef,
          cityName: w.CityDescription || w.CityDescriptionRu || "",
          number: w.Number,
          description: w.Description,
          shortAddress: w.ShortAddress || null,
          typeOfWarehouse: w.TypeOfWarehouse || null,
          isPostomat,
          isActive: true,
        },
        create: {
          ref: w.Ref,
          cityRef: w.CityRef,
          cityName: w.CityDescription || w.CityDescriptionRu || "",
          number: w.Number,
          description: w.Description,
          shortAddress: w.ShortAddress || null,
          typeOfWarehouse: w.TypeOfWarehouse || null,
          isPostomat,
          isActive: true,
        },
      });
    }
  }
}

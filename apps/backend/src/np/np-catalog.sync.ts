import { Injectable, Logger } from "@nestjs/common";
import { Cron } from "@nestjs/schedule";
import type { PrismaClient } from "@prisma/client";
import type { NpClient } from "./np-client.service";

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
    const res = await this.np.call<Record<string, unknown>>("Address", "getCities", {});
    const items = res.data ?? [];

    // Мягкая деактивация: сначала пометим все как неактивные, потом активируем пришедшие
    await this.prisma.npCity.updateMany({ data: { isActive: false } });

    for (const c of items as Array<Record<string, unknown>>) {
      const ref = String(c.Ref ?? "");
      const description = String(c.Description ?? "");
      await this.prisma.npCity.upsert({
        where: { ref },
        update: {
          description,
          area: c.Area != null ? String(c.Area) : undefined,
          areaDescription: c.AreaDescription != null ? String(c.AreaDescription) : undefined,
          region: c.Region != null ? String(c.Region) : undefined,
          settlementTypeDescription:
            c.SettlementTypeDescription != null ? String(c.SettlementTypeDescription) : undefined,
          isActive: true,
        },
        create: {
          ref,
          description,
          area: c.Area != null ? String(c.Area) : undefined,
          areaDescription: c.AreaDescription != null ? String(c.AreaDescription) : undefined,
          region: c.Region != null ? String(c.Region) : undefined,
          settlementTypeDescription:
            c.SettlementTypeDescription != null ? String(c.SettlementTypeDescription) : undefined,
          isActive: true,
        },
      });
    }
  }

  private async syncWarehouses() {
    // TODO: подставь точный calledMethod: Address/getWarehouses
    const res = await this.np.call<Record<string, unknown>>("Address", "getWarehouses", {});
    const items = res.data ?? [];

    await this.prisma.npWarehouse.updateMany({ data: { isActive: false } });

    for (const w of items as Array<Record<string, unknown>>) {
      const isPostomat =
        String(w.CategoryOfWarehouse ?? "")
          .toLowerCase()
          .includes("postomat") ||
        String(w.TypeOfWarehouse ?? "")
          .toLowerCase()
          .includes("postomat") ||
        String(w.Description ?? "")
          .toLowerCase()
          .includes("поштомат");

      const ref = String(w.Ref ?? "");
      const cityRef = String(w.CityRef ?? "");
      const cityName = String(w.CityDescription ?? w.CityDescriptionRu ?? "");
      const number = w.Number != null ? String(w.Number) : undefined;
      const description = String(w.Description ?? "");
      const shortAddress = w.ShortAddress != null ? String(w.ShortAddress) : null;
      const typeOfWarehouse = w.TypeOfWarehouse != null ? String(w.TypeOfWarehouse) : null;

      await this.prisma.npWarehouse.upsert({
        where: { ref },
        update: {
          cityRef,
          cityName,
          number,
          description,
          shortAddress,
          typeOfWarehouse,
          isPostomat,
          isActive: true,
        },
        create: {
          ref,
          cityRef,
          cityName,
          number,
          description,
          shortAddress,
          typeOfWarehouse,
          isPostomat,
          isActive: true,
        },
      });
    }
  }
}

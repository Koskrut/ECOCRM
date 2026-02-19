// src/np/np-sync.service.ts
import { Injectable, Logger } from "@nestjs/common";
import { PrismaClient } from "@prisma/client";
import { NpClient } from "./np-client.service";

type NpCityDto = {
  Ref: string;
  Description: string;
  Area?: string | null;
  AreaDescription?: string | null;
  Region?: string | null;
  SettlementTypeDescription?: string | null;
};

type NpWarehouseDto = {
  Ref: string;
  Description: string;
  CityRef: string;
  CityDescription?: string | null;
  CityName?: string | null;
  Number?: string | number | null;
  ShortAddress?: string | null;
  ShortAddressRu?: string | null;
  TypeOfWarehouse?: string | null;
  CategoryOfWarehouse?: string | null;
};

type NpStreetDto = {
  Ref: string;
  Description: string;
};

@Injectable()
export class NpSyncService {
  private readonly logger = new Logger(NpSyncService.name);

  // ✅ lock чтобы 100 менеджеров не стартанули sync улиц одновременно
  private streetsSyncLocks = new Map<string, Promise<void>>(); // cityRef -> running promise

  constructor(
    private readonly prisma: PrismaClient,
    private readonly np: NpClient,
  ) {}

  // ====== SYNC ======

  // вызывай раз в сутки (cron) или вручную
  async syncAll() {
    await this.syncCities();
    await this.syncWarehouses();
    // улицы обычно по городу:
    // await this.syncStreetsForAllCities();
  }

  async syncCities() {
    const resp = await this.np.call<NpCityDto>("Address", "getCities", {});
    const cities = resp.data ?? [];

    for (const c of cities) {
      await this.prisma.npCity.upsert({
        where: { ref: c.Ref },
        create: {
          ref: c.Ref,
          description: c.Description,
          area: c.Area ?? null,
          areaDescription: c.AreaDescription ?? null,
          region: c.Region ?? null,
          settlementTypeDescription: c.SettlementTypeDescription ?? null,
          isActive: true,
        },
        update: {
          description: c.Description,
          area: c.Area ?? null,
          areaDescription: c.AreaDescription ?? null,
          region: c.Region ?? null,
          settlementTypeDescription: c.SettlementTypeDescription ?? null,
          isActive: true,
        },
      });
    }

    this.logger.log(`NP sync: cities upserted = ${cities.length}`);
  }

  async syncWarehouses() {
    const resp = await this.np.call<NpWarehouseDto>("Address", "getWarehouses", {});
    const whs = resp.data ?? [];

    for (const w of whs) {
      const number =
        this.extractWarehouseNumber(w.Description) ?? (w.Number != null ? String(w.Number) : null);

      const isPostomat =
        (w.TypeOfWarehouse ?? "").toLowerCase().includes("postomat") ||
        (w.CategoryOfWarehouse ?? "").toLowerCase().includes("postomat") ||
        w.Description.toLowerCase().includes("поштомат");

      await this.prisma.npWarehouse.upsert({
        where: { ref: w.Ref },
        create: {
          ref: w.Ref,
          cityRef: w.CityRef,
          cityName: String(w.CityDescription ?? w.CityName ?? ""),
          number,
          description: w.Description,
          shortAddress: w.ShortAddress ?? w.ShortAddressRu ?? null,
          typeOfWarehouse: w.TypeOfWarehouse ?? null,
          isPostomat,
          isActive: true,
        },
        update: {
          cityRef: w.CityRef,
          cityName: String(w.CityDescription ?? w.CityName ?? ""),
          number,
          description: w.Description,
          shortAddress: w.ShortAddress ?? w.ShortAddressRu ?? null,
          typeOfWarehouse: w.TypeOfWarehouse ?? null,
          isPostomat,
          isActive: true,
        },
      });
    }

    this.logger.log(`NP sync: warehouses upserted = ${whs.length}`);
  }

  async syncStreetsForCity(cityRef: string) {
    const ref = (cityRef ?? "").trim();
    if (!ref) {
      this.logger.warn("NP sync streets: cityRef is empty");
      return;
    }

    const resp = await this.np.call<NpStreetDto>("Address", "getStreet", { CityRef: ref });
    const streets = resp.data ?? [];

    for (const s of streets) {
      await this.prisma.npStreet.upsert({
        where: { ref: s.Ref },
        create: { ref: s.Ref, cityRef: ref, street: s.Description },
        update: { cityRef: ref, street: s.Description },
      });
    }

    this.logger.log(`NP sync: streets upserted for city=${ref} count=${streets.length}`);
  }

  // ✅ (опционально) улицы по всем городам из кеша
  async syncStreetsForAllCities(limitCities = 200) {
    const cities = await this.prisma.npCity.findMany({
      where: { isActive: true },
      select: { ref: true, description: true },
      take: limitCities,
      orderBy: { description: "asc" },
    });

    for (const c of cities) {
      await this.syncStreetsForCity(c.ref);
    }
  }

  // ====== SEARCH (autocomplete) ======

  async searchCities(args: { q: string; limit?: number }) {
    const q = (args.q ?? "").trim();
    const limit = Number.isFinite(args.limit) ? Math.min(Math.max(Number(args.limit), 1), 50) : 20;

    if (q.length < 2) return { status: "MIN_CHARS", items: [], message: "min 2 chars" };

    const items = await this.prisma.npCity.findMany({
      where: {
        isActive: true,
        description: { contains: q, mode: "insensitive" },
      },
      select: { ref: true, description: true },
      orderBy: { description: "asc" },
      take: limit,
    });

    return { status: "OK", items };
  }

  async searchWarehouses(args: {
    cityRef: string;
    q: string;
    type?: "WAREHOUSE" | "POSTOMAT";
    limit?: number;
  }) {
    const cityRef = (args.cityRef ?? "").trim();
    const q = (args.q ?? "").trim();
    const limit = Number.isFinite(args.limit) ? Math.min(Math.max(Number(args.limit), 1), 50) : 20;

    if (!cityRef) return { status: "BAD_REQUEST", items: [], message: "cityRef is required" };
    if (q.length < 1) return { status: "MIN_CHARS", items: [], message: "min 1 char" };

    // ✅ type filtering:
    // - POSTOMAT => only postomats
    // - WAREHOUSE => only warehouses (exclude postomats)
    // - undefined => all
    const typeFilter =
      args.type === "POSTOMAT"
        ? { isPostomat: true }
        : args.type === "WAREHOUSE"
          ? { isPostomat: false }
          : {};

    const where: any = {
      cityRef,
      isActive: true,
      ...typeFilter,
      OR: [
        { number: { equals: q } }, // если ввели "75"
        { description: { contains: q, mode: "insensitive" } },
        { shortAddress: { contains: q, mode: "insensitive" } },
      ],
    };

    const items = await this.prisma.npWarehouse.findMany({
      where,
      select: { ref: true, description: true, shortAddress: true, number: true, isPostomat: true },
      orderBy: [{ isPostomat: "asc" }, { number: "asc" }, { description: "asc" }],
      take: limit,
    });

    return { status: "OK", items };
  }

  // ✅ autocomplete улиц для React
  // - q минимум 3 символа
  // - если улиц для города нет, стартуем sync в фоне и возвращаем SYNCING
  async searchStreets(args: { cityRef: string; q: string; limit?: number }) {
    const cityRef = (args.cityRef ?? "").trim();
    const q = (args.q ?? "").trim();
    const limit = Number.isFinite(args.limit) ? Math.min(Math.max(Number(args.limit), 1), 50) : 20;

    if (!cityRef) return { status: "BAD_REQUEST", items: [], message: "cityRef is required" };
    if (q.length < 3) return { status: "MIN_CHARS", items: [], message: "min 3 chars" };

    const streetsCount = await this.prisma.npStreet.count({ where: { cityRef } });

    if (streetsCount === 0) {
      // запускаем синк (1 раз на cityRef), но не ждём
      if (!this.streetsSyncLocks.has(cityRef)) {
        const p = this.syncStreetsForCity(cityRef)
          .catch((e) =>
            this.logger.error(`NP streets sync failed city=${cityRef}: ${e?.message || e}`),
          )
          .finally(() => this.streetsSyncLocks.delete(cityRef));

        this.streetsSyncLocks.set(cityRef, p);
      }

      return { status: "SYNCING", items: [] };
    }

    // Быстро: startsWith. (Если нужно — добавим fallback на contains + trigram index)
    const items = await this.prisma.npStreet.findMany({
      where: {
        cityRef,
        street: { startsWith: q, mode: "insensitive" },
      },
      select: { ref: true, street: true },
      orderBy: { street: "asc" },
      take: limit,
    });

    return { status: "OK", items };
  }

  // ====== HELPERS ======

  private extractWarehouseNumber(description: string): string | null {
    const m = description.match(/(?:№|#)\s*(\d+)/);
    return m?.[1] ?? null;
  }
}

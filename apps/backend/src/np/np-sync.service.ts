// src/np/np-sync.service.ts
import { Injectable, Logger } from "@nestjs/common";
import type { Prisma } from "@prisma/client";
import { PrismaService } from "../prisma/prisma.service";
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
  StreetsType?: string;
  StreetsTypeRef?: string;
};

@Injectable()
export class NpSyncService {
  private readonly logger = new Logger(NpSyncService.name);

  // ✅ lock чтобы 100 менеджеров не стартанули sync улиц одновременно
  private streetsSyncLocks = new Map<string, Promise<void>>(); // cityRef -> running promise

  constructor(
    private readonly prisma: PrismaService,
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
      const fullCityName = c.SettlementTypeDescription ? `${c.SettlementTypeDescription} ${c.Description}` : c.Description;
      await this.prisma.npCity.upsert({
        where: { ref: c.Ref },
        create: {
          ref: c.Ref,
          description: fullCityName,
          area: c.Area ?? null,
          areaDescription: c.AreaDescription ?? null,
          region: c.Region ?? null,
          settlementTypeDescription: c.SettlementTypeDescription ?? null,
          isActive: true,
        },
        update: {
          description: fullCityName,
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

    let allStreets: NpStreetDto[] = [];
    let page = 1;
    let hasMore = true;

    while (hasMore) {
      const resp = await this.np.call<NpStreetDto>("Address", "getStreet", {
        CityRef: ref,
        Page: String(page),
        Limit: "1000",
      });
      const streets = resp.data ?? [];
      allStreets = allStreets.concat(streets);
      
      if (streets.length < 1000) {
        hasMore = false;
      } else {
        page++;
      }
    }

    for (const s of allStreets) {
      const fullStreetName = s.StreetsType ? `${s.StreetsType} ${s.Description}` : s.Description;
      await this.prisma.npStreet.upsert({
        where: { ref: s.Ref },
        create: { ref: s.Ref, cityRef: ref, street: fullStreetName },
        update: { cityRef: ref, street: fullStreetName },
      });
    }

    this.logger.log(`NP sync: streets upserted for city=${ref} count=${allStreets.length}`);
  }

  /** Улицы по всем городам из кеша. limitCities — макс. число городов; не передавать = все города. */
  async syncStreetsForAllCities(limitCities?: number) {
    const cities = await this.prisma.npCity.findMany({
      where: { isActive: true },
      select: { ref: true, description: true },
      ...(limitCities != null && Number.isFinite(limitCities) && limitCities > 0
        ? { take: limitCities }
        : {}),
      orderBy: { description: "asc" },
    });

    this.logger.log(`NP streets sync: starting for ${cities.length} cities`);
    const failed: Array<{ ref: string; description: string; err: string }> = [];
    for (let i = 0; i < cities.length; i++) {
      const c = cities[i];
      try {
        await this.syncStreetsForCity(c.ref);
      } catch (e) {
        const err = e instanceof Error ? e.message : String(e);
        this.logger.warn(`NP streets sync: city failed ${c.description} (${c.ref}): ${err}`);
        failed.push({ ref: c.ref, description: c.description, err });
      }
      if ((i + 1) % 50 === 0) {
        this.logger.log(`NP streets sync: ${i + 1}/${cities.length} cities${failed.length ? `, failed: ${failed.length}` : ""}`);
      }
    }
    this.logger.log(`NP streets sync: done ${cities.length} cities${failed.length ? `, failed: ${failed.length}` : ""}`);
    if (failed.length > 0) {
      this.logger.warn(`NP streets sync failed cities: ${failed.map((f) => f.description).join("; ")}`);
    }
  }

  // ====== SEARCH (autocomplete) ======

  /** Основні міста України для пріоритету в пошуку (початок назви як у НП) */
  private static readonly MAIN_CITY_PREFIXES = [
    "Київ",
    "Харків",
    "Одеса",
    "Дніпро",
    "Львів",
    "Запоріжжя",
    "Вінниця",
    "Кривий Ріг",
    "Полтава",
    "Чернігів",
    "Івано-Франківськ",
    "Кропивницький",
    "Тернопіль",
    "Ужгород",
    "Луцьк",
    "Черкаси",
    "Суми",
    "Миколаїв",
    "Херсон",
    "Чернівці",
    "Житомир",
    "Рівне",
    "Кам'янське",
    "Кременчук",
  ];

  private static isMainCity(description: string): boolean {
    const d = description.trim();
    return NpSyncService.MAIN_CITY_PREFIXES.some(
      (name) => d === name || d.startsWith(name + ",") || d.startsWith(name + " "),
    );
  }

  async searchCities(args: { q: string; limit?: number }) {
    const q = (args.q ?? "").trim();
    const limit = Number.isFinite(args.limit) ? Math.min(Math.max(Number(args.limit), 1), 50) : 20;

    if (q.length < 2) return { status: "MIN_CHARS", items: [], message: "min 2 chars" };

    const qLower = q.toLowerCase();
    const raw = await this.prisma.npCity.findMany({
      where: {
        isActive: true,
        description: { contains: q, mode: "insensitive" },
      },
      select: {
        ref: true,
        description: true,
        settlementTypeDescription: true,
        areaDescription: true,
        region: true,
      },
      orderBy: { description: "asc" },
      take: limit * 4,
    });

    const items = raw
      .sort((a, b) => {
        const aDesc = a.description.trim();
        const bDesc = b.description.trim();
        const aMain = NpSyncService.isMainCity(aDesc);
        const bMain = NpSyncService.isMainCity(bDesc);
        const aStart = aDesc.toLowerCase().startsWith(qLower);
        const bStart = bDesc.toLowerCase().startsWith(qLower);
        const aScore = (aMain ? 2 : 0) + (aStart ? 1 : 0);
        const bScore = (bMain ? 2 : 0) + (bStart ? 1 : 0);
        if (bScore !== aScore) return bScore - aScore;
        return aDesc.localeCompare(bDesc, "uk");
      })
      .slice(0, limit);

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

    const where: Prisma.NpWarehouseWhereInput = {
      cityRef,
      isActive: true,
      ...typeFilter,
      OR: [
        { number: { equals: q } },
        { description: { contains: q, mode: "insensitive" } },
        { shortAddress: { contains: q, mode: "insensitive" } },
      ],
    };

    const raw = await this.prisma.npWarehouse.findMany({
      where,
      select: { ref: true, description: true, shortAddress: true, number: true, isPostomat: true },
      take: limit * 3,
    });

    const numVal = (n: string | null): number => {
      if (n == null || n === "") return 999999;
      const v = parseInt(n.replace(/\D/g, ""), 10);
      return Number.isNaN(v) ? 999999 : v;
    };

    const items = raw
      .sort((a, b) => {
        if (a.isPostomat !== b.isPostomat) return a.isPostomat ? 1 : -1;
        const na = numVal(a.number);
        const nb = numVal(b.number);
        if (na !== nb) return na - nb;
        return (a.description ?? "").localeCompare(b.description ?? "", "uk");
      })
      .slice(0, limit);

    return { status: "OK", items };
  }

  // ✅ autocomplete улиц для React
  // - q минимум 3 символа
  // - если улиц для города нет, стартуем sync в фоне и возвращаем SYNCING
  async searchStreets(args: { cityRef: string; q: string; limit?: number; browse?: boolean }) {
    const cityRef = (args.cityRef ?? "").trim();
    const q = (args.q ?? "").trim();
    const limit = Number.isFinite(args.limit) ? Math.min(Math.max(Number(args.limit), 1), 50) : 20;
    const browse = args.browse === true;

    if (!cityRef) {
      return { status: "BAD_REQUEST", items: [], message: "cityRef is required" };
    }
    if (!browse && q.length < 3) {
      return { status: "MIN_CHARS", items: [], message: "min 3 chars" };
    }

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

    const allForCity = await this.prisma.npStreet.findMany({
      where: { cityRef },
      select: { ref: true, street: true },
      orderBy: { street: "asc" },
      take: 2000,
    });

    if (browse) {
      return { status: "OK", items: allForCity.slice(0, limit) };
    }

    // Нормализация для поиска: NFC + приведение і/и, є/е, ї/й к одному виду (НП часто і, пользователь может и)
    const qNorm = this.normalizeStreetQuery(q.toLowerCase().normalize("NFC"));
    const raw = allForCity.filter((r) =>
      this.normalizeStreetQuery(r.street.normalize("NFC").toLowerCase()).includes(qNorm),
    );
    const items =
      raw.length > 0
        ? raw
            .sort((a, b) => {
              const aStr = this.normalizeStreetQuery(a.street.normalize("NFC").toLowerCase());
              const bStr = this.normalizeStreetQuery(b.street.normalize("NFC").toLowerCase());
              const aStart = aStr.startsWith(qNorm) ? 0 : 1;
              const bStart = bStr.startsWith(qNorm) ? 0 : 1;
              if (aStart !== bStart) return aStart - bStart;
              return a.street.localeCompare(b.street, "uk");
            })
            .slice(0, limit)
        : [];

    return {
      status: "OK",
      items,
      ...(items.length === 0 && {
        message: "За вашим запитом нічого не знайдено. Спробуйте інший запит або перевірте написання.",
      }),
    };
  }

  // ====== HELPERS ======

  /** Для поиска улиц: і↔и, є↔е, ї↔й чтобы "джин" находил "Джінчарадзе" */
  private normalizeStreetQuery(s: string): string {
    return s
      .replace(/\u0456/g, "\u0438") // і -> и
      .replace(/\u0454/g, "\u0435") // є -> е
      .replace(/\u0457/g, "\u0439"); // ї -> й
  }

  private extractWarehouseNumber(description: string): string | null {
    const m = description.match(/(?:№|#)\s*(\d+)/);
    return m?.[1] ?? null;
  }
}

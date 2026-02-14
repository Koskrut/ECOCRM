// src/np/np.controller.ts
import { Controller, Get, Param, Post, Query } from "@nestjs/common";
import { NpSyncService } from "./np-sync.service";
import { NpTtnService } from "./np-ttn.service";

@Controller("np")
export class NpController {
  constructor(
    private readonly sync: NpSyncService,
    private readonly ttn: NpTtnService,
  ) {}

  @Get("cities")
  async cities(@Query("q") q = "", @Query("limit") limit?: string) {
    return this.sync.searchCities({
      q,
      limit: limit ? Number(limit) : undefined,
    });
  }

  @Get("warehouses")
  async warehouses(
    @Query("cityRef") cityRef = "",
    @Query("q") q = "",
    @Query("limit") limit?: string,
    @Query("type") type?: "WAREHOUSE" | "POSTOMAT",
  ) {
    return this.sync.searchWarehouses({
      cityRef,
      q,
      limit: limit ? Number(limit) : undefined,
      type,
    });
  }

  @Get("streets")
  async streets(
    @Query("cityRef") cityRef = "",
    @Query("q") q = "",
    @Query("limit") limit?: string,
  ) {
    return this.sync.searchStreets({
      cityRef,
      q,
      limit: limit ? Number(limit) : undefined,
    });
  }

  // ручной sync (cities + warehouses)
  @Post("sync")
  async syncAll() {
    await this.sync.syncAll();
    return { ok: true };
  }

  // ручной sync улиц для конкретного города
  @Post("sync/streets/:cityRef")
  async syncStreets(@Param("cityRef") cityRef: string) {
    await this.sync.syncStreetsForCity(cityRef);
    return { ok: true, cityRef };
  }

  // =========================
  // TTN статус по orderId
  // GET /np/ttn/:orderId/status?sync=1
  // =========================
  @Get("ttn/:orderId/status")
  async ttnStatus(
    @Param("orderId") orderId: string,
    @Query("sync") sync?: string,
  ) {
    const doSync = sync === "1" || sync === "true";
    return this.ttn.getTtnStatusByOrderId(orderId, { sync: doSync });
  }

  // ручной массовый прогон статусов
  // POST /np/ttn/sync-active?limit=200
  @Post("ttn/sync-active")
  async syncActive(@Query("limit") limit?: string) {
    return this.ttn.syncActiveTtns({ limit: limit ? Number(limit) : 200 });
  }
}

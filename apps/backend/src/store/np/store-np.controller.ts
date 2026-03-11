import { Controller, Get, Query } from "@nestjs/common";
import { NpSyncService } from "../../np/np-sync.service";

@Controller("store/np")
export class StoreNpController {
  constructor(private readonly npSync: NpSyncService) {}

  @Get("cities")
  async cities(@Query("q") q = "", @Query("limit") limit?: string) {
    return this.npSync.searchCities({
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
    return this.npSync.searchWarehouses({
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
    @Query("browse") browse?: string,
  ) {
    return this.npSync.searchStreets({
      cityRef: cityRef.trim(),
      q: q.trim(),
      limit: limit ? Number(limit) : undefined,
      browse: browse === "1" || browse === "true",
    });
  }
}

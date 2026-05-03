import { Controller, Get, Query } from "@nestjs/common";
import { IntegrationPortsService } from "../../integration-ports/integration-ports.service";
import { RequireModule } from "../../modules/gating/require-module.decorator";
import { ModuleIds } from "../../modules/module-ids";

@Controller("store/np")
@RequireModule(ModuleIds.NovaPoshta)
export class StoreNpController {
  constructor(private readonly integrations: IntegrationPortsService) {}

  @Get("cities")
  async cities(@Query("q") q = "", @Query("limit") limit?: string) {
    return this.integrations.searchNpCities({
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
    return this.integrations.searchNpWarehouses({
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
    return this.integrations.searchNpStreets({
      cityRef: cityRef.trim(),
      q: q.trim(),
      limit: limit ? Number(limit) : undefined,
      browse: browse === "1" || browse === "true",
    });
  }
}

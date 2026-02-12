import { Controller, Get, Query } from "@nestjs/common";
import { NpCatalogService } from "./np-catalog.service";

@Controller("np")
export class NpCatalogController {
  constructor(private readonly catalog: NpCatalogService) {}

  @Get("cities")
  async cities(@Query("query") query = "") {
    return this.catalog.searchCities(query);
  }

  @Get("warehouses")
  async warehouses(
    @Query("cityRef") cityRef: string,
    @Query("type") type: "warehouse" | "postomat" = "warehouse",
    @Query("query") query = "",
  ) {
    return this.catalog.searchWarehouses(cityRef, type, query);
  }

  @Get("streets")
  async streets(@Query("cityRef") cityRef: string, @Query("query") query = "") {
    return this.catalog.searchStreets(cityRef, query);
  }
}

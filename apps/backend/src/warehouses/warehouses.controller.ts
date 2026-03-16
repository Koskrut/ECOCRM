import { Controller, Get } from "@nestjs/common";
import { WarehousesService } from "./warehouses.service";

@Controller("warehouses")
export class WarehousesController {
  constructor(private readonly warehousesService: WarehousesService) {}

  @Get()
  list() {
    return this.warehousesService.list();
  }
}

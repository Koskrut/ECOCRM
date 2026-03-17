import { Body, Controller, Get, Param, Patch } from "@nestjs/common";
import { UserRole } from "@prisma/client";
import { Roles } from "../auth/roles.decorator";
import { WarehousesService } from "./warehouses.service";

@Controller("warehouses")
export class WarehousesController {
  constructor(private readonly warehousesService: WarehousesService) {}

  @Get()
  list() {
    return this.warehousesService.list();
  }

  @Patch(":id")
  @Roles(UserRole.ADMIN)
  update(@Param("id") id: string, @Body() body: { externalCode?: string | null }) {
    return this.warehousesService.update(id, body);
  }
}

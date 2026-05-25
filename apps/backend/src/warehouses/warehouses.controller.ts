import { Body, Controller, Delete, Get, Param, Patch, Post } from "@nestjs/common";
import { UserRole } from "@prisma/client";
import { Roles } from "../auth/roles.decorator";
import type { CreateWarehouseDto } from "./dto/create-warehouse.dto";
import type { UpdateWarehouseDto } from "./dto/update-warehouse.dto";
import { WarehousesService } from "./warehouses.service";

@Controller("warehouses")
export class WarehousesController {
  constructor(private readonly warehousesService: WarehousesService) {}

  @Get()
  list() {
    return this.warehousesService.list();
  }

  @Post()
  @Roles(UserRole.ADMIN)
  create(@Body() body: CreateWarehouseDto) {
    return this.warehousesService.create(body);
  }

  @Patch(":id")
  @Roles(UserRole.ADMIN)
  update(@Param("id") id: string, @Body() body: UpdateWarehouseDto) {
    return this.warehousesService.update(id, body);
  }

  @Delete(":id")
  @Roles(UserRole.ADMIN)
  remove(@Param("id") id: string) {
    return this.warehousesService.remove(id);
  }
}

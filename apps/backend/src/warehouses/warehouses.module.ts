import { Module } from "@nestjs/common";
import { PrismaModule } from "../prisma/prisma.module";
import { WarehousesController } from "./warehouses.controller";
import { WarehousesService } from "./warehouses.service";

@Module({
  imports: [PrismaModule],
  controllers: [WarehousesController],
  providers: [WarehousesService],
  exports: [WarehousesService],
})
export class WarehousesModule {}

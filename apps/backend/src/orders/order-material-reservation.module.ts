import { Module } from "@nestjs/common";
import { PrismaModule } from "../prisma/prisma.module";
import { DemandRulesService } from "../production-planning/demand-rules.service";
import { OrderMaterialReservationService } from "./order-material-reservation.service";

@Module({
  imports: [PrismaModule],
  providers: [DemandRulesService, OrderMaterialReservationService],
  exports: [OrderMaterialReservationService],
})
export class OrderMaterialReservationModule {}

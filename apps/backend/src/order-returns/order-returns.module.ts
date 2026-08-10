import { forwardRef, Module } from "@nestjs/common";
import { IntegrationPortsModule } from "../integration-ports/integration-ports.module";
import { NpModule } from "../np/np.module";
import { OrderMaterialReservationModule } from "../orders/order-material-reservation.module";
import { PrismaModule } from "../prisma/prisma.module";
import { OrderReturnsController } from "./order-returns.controller";
import { OrderReturnsService } from "./order-returns.service";
import { ReturnPackagesController } from "./return-packages.controller";
import { ReturnPackagesService } from "./return-packages.service";

@Module({
  imports: [
    PrismaModule,
    IntegrationPortsModule,
    OrderMaterialReservationModule,
    forwardRef(() => NpModule),
  ],
  controllers: [OrderReturnsController, ReturnPackagesController],
  providers: [
    ReturnPackagesService,
    OrderReturnsService,
  ],
  exports: [OrderReturnsService, ReturnPackagesService],
})
export class OrderReturnsModule {}

import { Module } from "@nestjs/common";
import { IntegrationPortsModule } from "../integration-ports/integration-ports.module";
import { PrismaModule } from "../prisma/prisma.module";
import { OrderReturnsController } from "./order-returns.controller";
import { OrderReturnsService } from "./order-returns.service";

@Module({
  imports: [PrismaModule, IntegrationPortsModule],
  controllers: [OrderReturnsController],
  providers: [OrderReturnsService],
  exports: [OrderReturnsService],
})
export class OrderReturnsModule {}

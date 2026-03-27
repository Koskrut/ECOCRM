import { Module } from "@nestjs/common";
import { PrismaModule } from "../prisma/prisma.module";
import { CallsController } from "./calls.controller";
import { CallsHistoryService } from "./calls-history.service";

@Module({
  imports: [PrismaModule],
  controllers: [CallsController],
  providers: [CallsHistoryService],
})
export class CallsModule {}

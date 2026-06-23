import { Module } from "@nestjs/common";
import { PrismaModule } from "../prisma/prisma.module";
import { DayPlanController } from "./day-plan.controller";
import { DayPlanService } from "./day-plan.service";

@Module({
  imports: [PrismaModule],
  controllers: [DayPlanController],
  providers: [DayPlanService],
  exports: [DayPlanService],
})
export class DayPlanModule {}

import { Module } from "@nestjs/common";
import { EventEmitterModule } from "@nestjs/event-emitter";
import { PrismaModule } from "../prisma/prisma.module";
import { SystemModule } from "../system/system.module";
import { VisitsModule } from "../visits/visits.module";
import { FieldController } from "./field.controller";
import { FieldFuelListener } from "./field-fuel.listener";
import { FieldFuelService } from "./field-fuel.service";
import { FieldShiftsCron } from "./field-shifts.cron";
import { FieldShiftsService } from "./field-shifts.service";

@Module({
  imports: [PrismaModule, VisitsModule, EventEmitterModule, SystemModule],
  controllers: [FieldController],
  providers: [FieldShiftsService, FieldFuelService, FieldFuelListener, FieldShiftsCron],
})
export class FieldModule {}

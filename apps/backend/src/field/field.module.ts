import { Module } from "@nestjs/common";
import { EventEmitterModule } from "@nestjs/event-emitter";
import { PrismaModule } from "../prisma/prisma.module";
import { VisitsModule } from "../visits/visits.module";
import { FieldController } from "./field.controller";
import { FieldFuelListener } from "./field-fuel.listener";
import { FieldFuelService } from "./field-fuel.service";
import { FieldShiftsService } from "./field-shifts.service";

@Module({
  imports: [PrismaModule, VisitsModule, EventEmitterModule],
  controllers: [FieldController],
  providers: [FieldShiftsService, FieldFuelService, FieldFuelListener],
})
export class FieldModule {}

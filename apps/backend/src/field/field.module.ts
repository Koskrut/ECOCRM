import { Module } from "@nestjs/common";
import { PrismaModule } from "../prisma/prisma.module";
import { FieldController } from "./field.controller";
import { FieldFuelService } from "./field-fuel.service";
import { FieldShiftsService } from "./field-shifts.service";

@Module({
  imports: [PrismaModule],
  controllers: [FieldController],
  providers: [FieldShiftsService, FieldFuelService],
})
export class FieldModule {}

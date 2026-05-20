import { Module } from "@nestjs/common";
import { CallsModule } from "../calls/calls.module";
import { CallsController } from "./calls.controller";
import { OutboundController } from "./outbound.controller";

@Module({
  imports: [CallsModule],
  controllers: [OutboundController, CallsController],
})
export class ApiModule {}

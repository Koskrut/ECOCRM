import { Module } from "@nestjs/common";
import { CallStoreService } from "./call-store.service";
import { CallsService } from "./calls.service";
import { FreeswitchService } from "../freeswitch/freeswitch.service";

@Module({
  providers: [CallStoreService, FreeswitchService, CallsService],
  exports: [CallStoreService, FreeswitchService, CallsService],
})
export class CallsModule {}

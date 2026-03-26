import { Module } from "@nestjs/common";
import { SessionRegistryService } from "./session-registry.service";
import { SessionEventsService } from "./session-events.service";
import { CorrelationIdService } from "./correlation-id.service";
import { StorageModule } from "../storage/storage.module";

@Module({
  imports: [StorageModule],
  providers: [SessionRegistryService, SessionEventsService, CorrelationIdService],
  exports: [SessionRegistryService, SessionEventsService, CorrelationIdService],
})
export class SessionsModule {}

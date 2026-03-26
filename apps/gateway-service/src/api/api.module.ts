import { Module } from "@nestjs/common";
import { OutboundCallsController } from "./outbound-calls.controller";
import { SessionsController } from "./sessions.controller";
import { MockScenariosController } from "../mock/mock-scenarios.controller";
import { SessionsModule } from "../sessions/sessions.module";
import { OrchestratorModule } from "../orchestrator/orchestrator.module";
import { StorageModule } from "../storage/storage.module";

@Module({
  imports: [SessionsModule, OrchestratorModule, StorageModule],
  controllers: [OutboundCallsController, SessionsController, MockScenariosController],
})
export class ApiModule {}

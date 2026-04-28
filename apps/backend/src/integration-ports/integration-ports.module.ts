import { Global, Module } from "@nestjs/common";
import { IntegrationPortsService } from "./integration-ports.service";

@Global()
@Module({
  providers: [IntegrationPortsService],
  exports: [IntegrationPortsService],
})
export class IntegrationPortsModule {}

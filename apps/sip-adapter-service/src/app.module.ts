import { Module } from "@nestjs/common";
import { ConfigModule } from "./config/config.module";
import { ApiModule } from "./api/api.module";
import { CallsModule } from "./calls/calls.module";
import { HealthController } from "./health/health.controller";

@Module({
  imports: [ConfigModule, CallsModule, ApiModule],
  controllers: [HealthController],
})
export class AppModule {}

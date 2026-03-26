import { Module } from "@nestjs/common";
import { ConfigModule } from "./config/config.module";
import { CommonNestModule } from "./common/common.module";
import { StorageModule } from "./storage/storage.module";
import { ApiModule } from "./api/api.module";
import { HealthController } from "./health/health.controller";
import { MediaModule } from "./media/media.module";

@Module({
  imports: [ConfigModule, CommonNestModule, StorageModule, MediaModule, ApiModule],
  controllers: [HealthController],
})
export class AppModule {}

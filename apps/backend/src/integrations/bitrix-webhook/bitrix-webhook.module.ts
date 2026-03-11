import { Module } from "@nestjs/common";
import { PrismaModule } from "../../prisma/prisma.module";
import { BitrixSyncModule } from "../bitrix-sync/bitrix.module";
import { BitrixWebhookController } from "./bitrix-webhook.controller";
import { BitrixWebhookService } from "./bitrix-webhook.service";

@Module({
  imports: [PrismaModule, BitrixSyncModule],
  controllers: [BitrixWebhookController],
  providers: [BitrixWebhookService],
})
export class BitrixWebhookModule {}

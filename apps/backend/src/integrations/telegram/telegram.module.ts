import { forwardRef, Module } from "@nestjs/common";
import { AuthModule } from "../../auth/auth.module";
import { PhoneEntityLookupService } from "../../common/phone-entity-lookup.service";
import { ContactsModule } from "../../contacts/contacts.module";
import { IntegrationPortsModule } from "../../integration-ports/integration-ports.module";
import { PrismaModule } from "../../prisma/prisma.module";
import { SettingsModule } from "../../settings/settings.module";
import { ConversationsController } from "./conversations.controller";
import { ConversationsService } from "./conversations.service";
import { TelegramAiService } from "./telegram-ai.service";
import { TelegramIntegrationAdapter } from "./telegram-integration.adapter";
import { TelegramController } from "./telegram.controller";
import { TelegramService } from "./telegram.service";

@Module({
  imports: [
    PrismaModule,
    SettingsModule,
    IntegrationPortsModule,
    ContactsModule,
    forwardRef(() => AuthModule),
  ],
  controllers: [TelegramController, ConversationsController],
  providers: [
    PhoneEntityLookupService,
    TelegramService,
    TelegramAiService,
    ConversationsService,
    TelegramIntegrationAdapter,
  ],
  exports: [TelegramService],
})
export class TelegramModule {}

import { forwardRef, Module } from "@nestjs/common";
import { AuthModule } from "../../auth/auth.module";
import { PhoneEntityLookupService } from "../../common/phone-entity-lookup.service";
import { ContactsModule } from "../../contacts/contacts.module";
import { IntegrationPortsModule } from "../../integration-ports/integration-ports.module";
import { NotificationsModule } from "../../notifications/notifications.module";
import { PrismaModule } from "../../prisma/prisma.module";
import { SettingsModule } from "../../settings/settings.module";
import { ConversationsController } from "./conversations.controller";
import { ConversationsService } from "./conversations.service";
import { TelegramAiService } from "./telegram-ai.service";
import { TelegramInboxNotifierService } from "./telegram-inbox-notifier.service";
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
    forwardRef(() => NotificationsModule),
  ],
  controllers: [TelegramController, ConversationsController],
  providers: [
    PhoneEntityLookupService,
    TelegramService,
    TelegramAiService,
    ConversationsService,
    TelegramIntegrationAdapter,
    TelegramInboxNotifierService,
  ],
  exports: [TelegramService],
})
export class TelegramModule {}

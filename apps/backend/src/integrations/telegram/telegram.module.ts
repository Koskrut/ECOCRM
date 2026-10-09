import { forwardRef, Module } from "@nestjs/common";
import { AuthModule } from "../../auth/auth.module";
import { PhoneEntityLookupService } from "../../common/phone-entity-lookup.service";
import { ContactsModule } from "../../contacts/contacts.module";
import { IntegrationPortsModule } from "../../integration-ports/integration-ports.module";
import { NotificationsModule } from "../../notifications/notifications.module";
import { PrismaModule } from "../../prisma/prisma.module";
import { ProductsModule } from "../../products/products.module";
import { SettingsModule } from "../../settings/settings.module";
import { StoreModule } from "../../store/store.module";
import { ConversationsController } from "./conversations.controller";
import { ConversationsService } from "./conversations.service";
import { TelegramAiService } from "./telegram-ai.service";
import { TelegramBotSessionService } from "./telegram-bot-session.service";
import { TelegramClientBotService } from "./telegram-client-bot.service";
import { TelegramClientNotifyService } from "./telegram-client-notify.service";
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
    ProductsModule,
    StoreModule,
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
    TelegramBotSessionService,
    TelegramClientBotService,
    TelegramClientNotifyService,
  ],
  exports: [TelegramService, ConversationsService, TelegramClientNotifyService],
})
export class TelegramModule {}

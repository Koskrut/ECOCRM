import { forwardRef, Module } from "@nestjs/common";
import { ContactsModule } from "../../contacts/contacts.module";
import { NotificationsModule } from "../../notifications/notifications.module";
import { PrismaModule } from "../../prisma/prisma.module";
import { SettingsModule } from "../../settings/settings.module";
import { MetaConversationsController } from "./meta-conversations.controller";
import { MetaConversationsService } from "./meta-conversations.service";
import { MetaInboxNotifierService } from "./meta-inbox-notifier.service";
import { MetaMessagingController } from "./meta-messaging.controller";
import { MetaMessagingService } from "./meta-messaging.service";

@Module({
  imports: [
    PrismaModule,
    SettingsModule,
    ContactsModule,
    forwardRef(() => NotificationsModule),
  ],
  controllers: [MetaMessagingController, MetaConversationsController],
  providers: [MetaMessagingService, MetaConversationsService, MetaInboxNotifierService],
  exports: [MetaMessagingService],
})
export class MetaMessagingModule {}

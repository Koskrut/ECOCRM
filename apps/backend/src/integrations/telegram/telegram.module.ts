import { forwardRef, Module } from "@nestjs/common";
import { AuthModule } from "../../auth/auth.module";
import { ContactsModule } from "../../contacts/contacts.module";
import { PrismaModule } from "../../prisma/prisma.module";
import { SettingsModule } from "../../settings/settings.module";
import { ConversationsController } from "./conversations.controller";
import { ConversationsService } from "./conversations.service";
import { TelegramAiService } from "./telegram-ai.service";
import { TelegramController } from "./telegram.controller";
import { TelegramService } from "./telegram.service";

@Module({
  imports: [
    PrismaModule,
    SettingsModule,
    ContactsModule,
    forwardRef(() => AuthModule),
  ],
  controllers: [TelegramController, ConversationsController],
  providers: [TelegramService, TelegramAiService, ConversationsService],
  exports: [TelegramService],
})
export class TelegramModule {}

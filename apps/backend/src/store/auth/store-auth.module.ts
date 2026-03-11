import { Module } from "@nestjs/common";
import { ContactsModule } from "../../contacts/contacts.module";
import { PrismaModule } from "../../prisma/prisma.module";
import { TelegramModule } from "../../integrations/telegram/telegram.module";
import { StoreAuthController } from "./store-auth.controller";
import { StoreAuthService } from "./store-auth.service";

@Module({
  imports: [PrismaModule, ContactsModule, TelegramModule],
  controllers: [StoreAuthController],
  providers: [StoreAuthService],
  exports: [StoreAuthService],
})
export class StoreAuthModule {}

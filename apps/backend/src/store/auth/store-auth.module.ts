import { Module } from "@nestjs/common";
import { ContactsModule } from "../../contacts/contacts.module";
import { IntegrationPortsModule } from "../../integration-ports/integration-ports.module";
import { PrismaModule } from "../../prisma/prisma.module";
import { StoreAuthController } from "./store-auth.controller";
import { StoreAuthService } from "./store-auth.service";

@Module({
  imports: [PrismaModule, ContactsModule, IntegrationPortsModule],
  controllers: [StoreAuthController],
  providers: [StoreAuthService],
  exports: [StoreAuthService],
})
export class StoreAuthModule {}

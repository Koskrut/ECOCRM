import { Module } from "@nestjs/common";
import { ContactsController } from "./contacts.controller";
import { ContactAccessService } from "./contact-access.service";
import { ContactsService } from "./contacts.service";
import { PrismaModule } from "../prisma/prisma.module";

@Module({
  imports: [PrismaModule],
  controllers: [ContactsController],
  providers: [ContactAccessService, ContactsService],
  exports: [ContactAccessService, ContactsService],
})
export class ContactsModule {}

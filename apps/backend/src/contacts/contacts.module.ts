import { Module } from "@nestjs/common";
import { PrismaClient } from "@prisma/client";
import { createPrismaClient } from "../common/prisma";
import { ContactsController } from "./contacts.controller";
import { ContactsService } from "./contacts.service";

@Module({
  controllers: [ContactsController],
  providers: [
    ContactsService,
    {
      provide: PrismaClient,
      useFactory: createPrismaClient,
    },
  ],
})
export class ContactsModule {}

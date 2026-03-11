import { Module } from "@nestjs/common";
import { PrismaModule } from "../prisma/prisma.module";
import { ContactsModule } from "../contacts/contacts.module";
import { OrdersModule } from "../orders/orders.module";
import { CompaniesModule } from "../companies/companies.module";
import { LeadsController } from "./leads.controller";
import { LeadsService } from "./leads.service";

@Module({
  imports: [PrismaModule, ContactsModule, OrdersModule, CompaniesModule],
  controllers: [LeadsController],
  providers: [LeadsService],
})
export class LeadsModule {}


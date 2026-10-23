import { Module } from "@nestjs/common";
import { NotificationsModule } from "../notifications/notifications.module";
import { CustomFieldsModule } from "../custom-fields/custom-fields.module";
import { PrismaModule } from "../prisma/prisma.module";
import { ContactsModule } from "../contacts/contacts.module";
import { OrdersModule } from "../orders/orders.module";
import { CompaniesModule } from "../companies/companies.module";
import { SettingsModule } from "../settings/settings.module";
import { WorkflowsModule } from "../workflows/workflows.module";
import { LeadsController } from "./leads.controller";
import { LeadsService } from "./leads.service";
import { LeadsPipelineConfigService } from "./pipeline/leads-pipeline-config.service";
import { MarketingModule } from "../marketing/marketing.module";

@Module({
  imports: [PrismaModule, SettingsModule, ContactsModule, OrdersModule, CompaniesModule, WorkflowsModule, NotificationsModule, CustomFieldsModule, MarketingModule],
  controllers: [LeadsController],
  providers: [LeadsService, LeadsPipelineConfigService],
})
export class LeadsModule {}


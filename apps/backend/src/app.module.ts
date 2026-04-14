import { Module } from "@nestjs/common";
import { APP_GUARD } from "@nestjs/core";
import { ActivitiesModule } from "./activities/activities.module";
import { AuthModule } from "./auth/auth.module";
import { JwtAuthGuard } from "./auth/jwt-auth.guard";
import { RolesGuard } from "./auth/roles.guard";
import { CompaniesModule } from "./companies/companies.module";
import { AnalyticsModule } from "./analytics/analytics.module";
import { DashboardModule } from "./dashboard/dashboard.module";
import { LeadsModule } from "./leads/leads.module";
import { ContactsModule } from "./contacts/contacts.module";
import { OrderReturnsModule } from "./order-returns/order-returns.module";
import { OrdersModule } from "./orders/orders.module";
import { ProductsModule } from "./products/products.module";
import { UsersModule } from "./users/users.module";
import { BankModule } from "./bank/bank.module";
import { NpModule } from "./np/np.module";
import { PaymentsModule } from "./payments/payments.module";
import { PrismaModule } from "./prisma/prisma.module";
import { SettingsModule } from "./settings/settings.module";
import { VisitsModule } from "./visits/visits.module";
import { TasksModule } from "./tasks/tasks.module";
import { TelegramModule } from "./integrations/telegram/telegram.module";
import { RingostatModule } from "./integrations/ringostat/ringostat.module";
import { BitrixSyncModule } from "./integrations/bitrix-sync/bitrix.module";
import { BitrixWebhookModule } from "./integrations/bitrix-webhook/bitrix-webhook.module";
import { GoogleSheetModule } from "./integrations/google-sheet/google-sheet.module";
import { StoreModule } from "./store/store.module";
import { WarehousesModule } from "./warehouses/warehouses.module";
import { CallsModule } from "./calls/calls.module";
import { ManualCallingModule } from "./manual-calling/manual-calling.module";
import { OutboundModule } from "./outbound/outbound.module";
import { ProductionPlanningModule } from "./production-planning/production-planning.module";
import { SystemModule } from "./system/system.module";
import { ModuleAccessGuard } from "./modules/gating/module-access.guard";
import { AuditModule } from "./audit/audit.module";

@Module({
  imports: [
    PrismaModule,
    AuditModule,
    SystemModule,
    SettingsModule,
    BankModule,
    NpModule,
    PaymentsModule,
    AuthModule,
    AnalyticsModule,
    DashboardModule,
    ActivitiesModule,
    VisitsModule,
    TasksModule,
    OrderReturnsModule,
    OrdersModule,
    ProductsModule,
    CompaniesModule,
    ContactsModule,
    LeadsModule,
    UsersModule,
    TelegramModule,
    RingostatModule,
    BitrixSyncModule,
    BitrixWebhookModule,
    GoogleSheetModule,
    StoreModule,
    WarehousesModule,
    OutboundModule,
    CallsModule,
    ManualCallingModule,
    ProductionPlanningModule,
  ],
  providers: [
    {
      provide: APP_GUARD,
      useClass: JwtAuthGuard,
    },
    {
      provide: APP_GUARD,
      useClass: RolesGuard,
    },
    {
      provide: APP_GUARD,
      useClass: ModuleAccessGuard,
    },
  ],
})
export class AppModule {}

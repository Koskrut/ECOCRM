/**
 * Core CRM API only: no extension/integration modules that ship as separate images or
 * heavy optional subsystems. Used by `core-main` / `crm-core-api` image target.
 * Full stack remains [`AppModule`](./app.module.ts).
 */
import { Module } from "@nestjs/common";
import { APP_GUARD } from "@nestjs/core";
import { ActivitiesModule } from "./activities/activities.module";
import { AuthModule } from "./auth/auth.module";
import { JwtAuthGuard } from "./auth/jwt-auth.guard";
import { RolesGuard } from "./auth/roles.guard";
import { CompaniesModule } from "./companies/companies.module";
import { AnalyticsModule } from "./analytics/analytics.module";
import { CustomFieldsModule } from "./custom-fields/custom-fields.module";
import { DashboardModule } from "./dashboard/dashboard.module";
import { DictionariesModule } from "./dictionaries/dictionaries.module";
import { LayoutsModule } from "./layouts/layouts.module";
import { LeadsModule } from "./leads/leads.module";
import { ContactsModule } from "./contacts/contacts.module";
import { OrderReturnsModule } from "./order-returns/order-returns.module";
import { OrdersModule } from "./orders/orders.module";
import { ProductsModule } from "./products/products.module";
import { UsersModule } from "./users/users.module";
import { PermissionsGuard } from "./rbac/permissions.guard";
import { RbacModule } from "./rbac/rbac.module";
import { PrismaModule } from "./prisma/prisma.module";
import { SettingsModule } from "./settings/settings.module";
import { VisitsModule } from "./visits/visits.module";
import { TasksModule } from "./tasks/tasks.module";
import { IntegrationPortsModule } from "./integration-ports/integration-ports.module";
import { WarehousesModule } from "./warehouses/warehouses.module";
import { WorkflowsModule } from "./workflows/workflows.module";
import { SystemModule } from "./system/system.module";
import { DataImportModule } from "./data-import/data-import.module";
import { CustomEntitiesModule } from "./custom-entities/custom-entities.module";
import { ModuleAccessGuard } from "./modules/gating/module-access.guard";
import { AuditModule } from "./audit/audit.module";

@Module({
  imports: [
    IntegrationPortsModule,
    PrismaModule,
    AuditModule,
    SystemModule,
    SettingsModule,
    DictionariesModule,
    CustomFieldsModule,
    LayoutsModule,
    WorkflowsModule,
    RbacModule,
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
    WarehousesModule,
    DataImportModule,
    CustomEntitiesModule,
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
      useClass: PermissionsGuard,
    },
    {
      provide: APP_GUARD,
      useClass: ModuleAccessGuard,
    },
  ],
})
export class AppModuleCore {}

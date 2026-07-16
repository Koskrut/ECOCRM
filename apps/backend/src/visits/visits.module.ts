import { Module } from "@nestjs/common";
import { EventEmitterModule } from "@nestjs/event-emitter";
import { ActivitiesModule } from "../activities/activities.module";
import { ContactsModule } from "../contacts/contacts.module";
import { PrismaModule } from "../prisma/prisma.module";
import { RoutingModule } from "../routing/routing.module";
import { SettingsModule } from "../settings/settings.module";
import { RoutePlansController } from "./route-plans.controller";
import { RoutePlansService } from "./route-plans.service";
import { RouteSessionsController } from "./route-sessions.controller";
import { RouteSessionsService } from "./route-sessions.service";
import { VisitsController } from "./visits.controller";
import { VisitsService } from "./visits.service";

@Module({
  imports: [PrismaModule, ActivitiesModule, EventEmitterModule, ContactsModule, SettingsModule, RoutingModule],
  controllers: [
    VisitsController,
    RoutePlansController,
    RouteSessionsController,
  ],
  providers: [VisitsService, RoutePlansService, RouteSessionsService],
  exports: [RoutePlansService],
})
export class VisitsModule {}


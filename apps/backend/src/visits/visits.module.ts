import { Module } from "@nestjs/common";
import { EventEmitterModule } from "@nestjs/event-emitter";
import { ActivitiesModule } from "../activities/activities.module";
import { PrismaModule } from "../prisma/prisma.module";
import { RoutePlansController } from "./route-plans.controller";
import { RoutePlansService } from "./route-plans.service";
import { RouteSessionsController } from "./route-sessions.controller";
import { RouteSessionsService } from "./route-sessions.service";
import { VisitsController } from "./visits.controller";
import { VisitsService } from "./visits.service";

@Module({
  imports: [PrismaModule, ActivitiesModule, EventEmitterModule],
  controllers: [
    VisitsController,
    RoutePlansController,
    RouteSessionsController,
  ],
  providers: [VisitsService, RoutePlansService, RouteSessionsService],
  exports: [RoutePlansService],
})
export class VisitsModule {}


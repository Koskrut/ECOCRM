import { Module } from "@nestjs/common";
import { ActivitiesModule } from "../activities/activities.module";
import { PrismaModule } from "../prisma/prisma.module";
import { RoutePlansController } from "./route-plans.controller";
import { RoutePlansService } from "./route-plans.service";
import { RouteSessionsController } from "./route-sessions.controller";
import { RouteSessionsService } from "./route-sessions.service";
import { VisitsController } from "./visits.controller";
import { VisitsService } from "./visits.service";

@Module({
  imports: [PrismaModule, ActivitiesModule],
  controllers: [
    VisitsController,
    RoutePlansController,
    RouteSessionsController,
  ],
  providers: [VisitsService, RoutePlansService, RouteSessionsService],
})
export class VisitsModule {}


import { Module } from "@nestjs/common";
import { ActivitiesController } from "./activities.controller";
import { ActivitiesService } from "./activities.service";
import { PrismaModule } from "../prisma/prisma.module";
import { WorkflowsModule } from "../workflows/workflows.module";

@Module({
  imports: [PrismaModule, WorkflowsModule],
  controllers: [ActivitiesController],
  providers: [ActivitiesService],
  exports: [ActivitiesService],
})
export class ActivitiesModule {}

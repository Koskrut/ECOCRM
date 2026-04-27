import { Module } from "@nestjs/common";
import { PrismaModule } from "../prisma/prisma.module";
import { WorkflowRuntimeService } from "./workflow-runtime.service";
import { WorkflowsController } from "./workflows.controller";
import { WorkflowsService } from "./workflows.service";

@Module({
  imports: [PrismaModule],
  controllers: [WorkflowsController],
  providers: [WorkflowsService, WorkflowRuntimeService],
  exports: [WorkflowsService, WorkflowRuntimeService],
})
export class WorkflowsModule {}

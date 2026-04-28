import { Module } from "@nestjs/common";
import { EventEmitterModule } from "@nestjs/event-emitter";
import { PrismaModule } from "../prisma/prisma.module";
import { WorkflowEventPublisher } from "./runtime/workflow-events";
import { WorkflowRuntimeService } from "./workflow-runtime.service";
import { WorkflowsController } from "./workflows.controller";
import { WorkflowsService } from "./workflows.service";

@Module({
  imports: [PrismaModule, EventEmitterModule.forRoot()],
  controllers: [WorkflowsController],
  providers: [WorkflowsService, WorkflowRuntimeService, WorkflowEventPublisher],
  exports: [WorkflowsService, WorkflowRuntimeService, WorkflowEventPublisher],
})
export class WorkflowsModule {}

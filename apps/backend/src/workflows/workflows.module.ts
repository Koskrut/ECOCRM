import { Module } from "@nestjs/common";
import { EventEmitterModule } from "@nestjs/event-emitter";
import { PrismaModule } from "../prisma/prisma.module";
import { WorkflowEventPublisher } from "./runtime/workflow-events";
import { WorkflowDomainEmitterService } from "./workflow-domain-emitter.service";
import { WorkflowRuntimeService } from "./workflow-runtime.service";
import { WorkflowsController } from "./workflows.controller";
import { WorkflowsService } from "./workflows.service";

@Module({
  imports: [PrismaModule, EventEmitterModule.forRoot()],
  controllers: [WorkflowsController],
  providers: [
    WorkflowsService,
    WorkflowRuntimeService,
    WorkflowEventPublisher,
    WorkflowDomainEmitterService,
  ],
  exports: [WorkflowsService, WorkflowRuntimeService, WorkflowEventPublisher, WorkflowDomainEmitterService],
})
export class WorkflowsModule {}

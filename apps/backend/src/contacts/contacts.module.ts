import { Module } from "@nestjs/common";
import { ContactsController } from "./contacts.controller";
import { ContactsService } from "./contacts.service";
import { PrismaModule } from "../prisma/prisma.module";
import { WorkflowsModule } from "../workflows/workflows.module";
import { ContactsInsightsService } from "./contacts-insights.service";
import { ContactsPriorityService } from "./contacts-priority.service";
import { ContactsWorkQueueService } from "./contacts-work-queue.service";

@Module({
  imports: [PrismaModule, WorkflowsModule],
  controllers: [ContactsController],
  providers: [
    ContactsService,
    ContactsInsightsService,
    ContactsPriorityService,
    ContactsWorkQueueService,
  ],
  exports: [ContactsService, ContactsWorkQueueService],
})
export class ContactsModule {}

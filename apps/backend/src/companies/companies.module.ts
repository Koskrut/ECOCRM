import { Module } from "@nestjs/common";
import { AuditModule } from "../audit/audit.module";
import { CustomFieldsModule } from "../custom-fields/custom-fields.module";
import { PrismaModule } from "../prisma/prisma.module";
import { WorkflowsModule } from "../workflows/workflows.module";
import { CompaniesController } from "./companies.controller";
import { CompaniesService } from "./companies.service";

@Module({
  imports: [PrismaModule, WorkflowsModule, AuditModule, CustomFieldsModule],
  controllers: [CompaniesController],
  providers: [CompaniesService],
  exports: [CompaniesService],
})
export class CompaniesModule {}

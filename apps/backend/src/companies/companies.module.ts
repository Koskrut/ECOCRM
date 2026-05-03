import { Module } from "@nestjs/common";
import { PrismaModule } from "../prisma/prisma.module";
import { WorkflowsModule } from "../workflows/workflows.module";
import { CompaniesController } from "./companies.controller";
import { CompaniesService } from "./companies.service";

@Module({
  imports: [PrismaModule, WorkflowsModule],
  controllers: [CompaniesController],
  providers: [CompaniesService],
  exports: [CompaniesService],
})
export class CompaniesModule {}

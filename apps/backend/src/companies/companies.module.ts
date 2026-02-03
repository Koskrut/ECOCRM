import { Module } from "@nestjs/common";
import { PrismaClient } from "@prisma/client";
import { createPrismaClient } from "../common/prisma";
import { CompaniesController } from "./companies.controller";
import { CompaniesService } from "./companies.service";

@Module({
  controllers: [CompaniesController],
  providers: [
    CompaniesService,
    {
      provide: PrismaClient,
      useFactory: createPrismaClient,
    },
  ],
})
export class CompaniesModule {}

import { Module } from "@nestjs/common";
import { PrismaClient } from "@prisma/client";
import { createPrismaClient } from "../common/prisma";
import { ActivitiesController } from "./activities.controller";
import { ActivitiesService } from "./activities.service";

@Module({
  controllers: [ActivitiesController],
  providers: [
    ActivitiesService,
    {
      provide: PrismaClient,
      useFactory: createPrismaClient,
    },
  ],
  exports: [ActivitiesService],
})
export class ActivitiesModule {}

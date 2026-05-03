import { Module } from "@nestjs/common";
import { PrismaModule } from "../prisma/prisma.module";
import { CustomEntitiesController } from "./custom-entities.controller";
import { CustomEntitiesService } from "./custom-entities.service";

@Module({
  imports: [PrismaModule],
  controllers: [CustomEntitiesController],
  providers: [CustomEntitiesService],
  exports: [CustomEntitiesService],
})
export class CustomEntitiesModule {}

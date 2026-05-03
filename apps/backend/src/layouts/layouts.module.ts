import { Module } from "@nestjs/common";
import { PrismaModule } from "../prisma/prisma.module";
import { LayoutsController } from "./layouts.controller";
import { LayoutsRuntimeController } from "./layouts-runtime.controller";
import { LayoutsService } from "./layouts.service";

@Module({
  imports: [PrismaModule],
  controllers: [LayoutsController, LayoutsRuntimeController],
  providers: [LayoutsService],
  exports: [LayoutsService],
})
export class LayoutsModule {}

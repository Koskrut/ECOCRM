import { Module } from "@nestjs/common";
import { PrismaModule } from "../../prisma/prisma.module";
import { MetaConversionsController } from "./meta-conversions.controller";
import { MetaConversionsService } from "./meta-conversions.service";
import { StoreMetaController } from "./store-meta.controller";

@Module({
  imports: [PrismaModule],
  controllers: [MetaConversionsController, StoreMetaController],
  providers: [MetaConversionsService],
  exports: [MetaConversionsService],
})
export class MetaConversionsModule {}

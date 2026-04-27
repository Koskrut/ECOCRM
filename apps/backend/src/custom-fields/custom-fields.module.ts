import { Module } from "@nestjs/common";
import { PrismaModule } from "../prisma/prisma.module";
import { CustomFieldsController } from "./custom-fields.controller";
import { CustomFieldsService } from "./custom-fields.service";

@Module({
  imports: [PrismaModule],
  controllers: [CustomFieldsController],
  providers: [CustomFieldsService],
  exports: [CustomFieldsService],
})
export class CustomFieldsModule {}

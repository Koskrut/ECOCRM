import { Module } from "@nestjs/common";
import { PrismaModule } from "../prisma/prisma.module";
import { DataImportController } from "./data-import.controller";
import { DataImportService } from "./data-import.service";

@Module({
  imports: [PrismaModule],
  controllers: [DataImportController],
  providers: [DataImportService],
  exports: [DataImportService],
})
export class DataImportModule {}

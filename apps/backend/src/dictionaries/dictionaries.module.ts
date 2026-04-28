import { Module } from "@nestjs/common";
import { PrismaModule } from "../prisma/prisma.module";
import { DictionariesController } from "./dictionaries.controller";
import { DictionariesService } from "./dictionaries.service";

@Module({
  imports: [PrismaModule],
  controllers: [DictionariesController],
  providers: [DictionariesService],
  exports: [DictionariesService],
})
export class DictionariesModule {}

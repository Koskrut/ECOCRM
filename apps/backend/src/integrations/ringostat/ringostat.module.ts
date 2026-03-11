import { Module } from "@nestjs/common";
import { PrismaModule } from "../../prisma/prisma.module";
import { RingostatController } from "./ringostat.controller";
import { RingostatIngestService } from "./ringostat-ingest.service";
import { RingostatPollingService } from "./ringostat-polling.service";

@Module({
  imports: [PrismaModule],
  controllers: [RingostatController],
  providers: [RingostatIngestService, RingostatPollingService],
})
export class RingostatModule {}


import { Module } from "@nestjs/common";
import { PrismaModule } from "../prisma/prisma.module";
import { ManualCallingController } from "./manual-calling.controller";
import { ManualCallingRingostatLinkService } from "./manual-calling-ringostat-link.service";
import { ManualCallingService } from "./manual-calling.service";
import { MissedCallQueueService } from "./missed-call-queue.service";

@Module({
  imports: [PrismaModule],
  controllers: [ManualCallingController],
  providers: [ManualCallingService, ManualCallingRingostatLinkService, MissedCallQueueService],
  exports: [MissedCallQueueService],
})
export class ManualCallingModule {}

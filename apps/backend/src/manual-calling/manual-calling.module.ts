import { Module } from "@nestjs/common";
import { PrismaModule } from "../prisma/prisma.module";
import { ManualCallingController } from "./manual-calling.controller";
import { ManualCallingRingostatLinkService } from "./manual-calling-ringostat-link.service";
import { ManualCallingService } from "./manual-calling.service";

@Module({
  imports: [PrismaModule],
  controllers: [ManualCallingController],
  providers: [ManualCallingService, ManualCallingRingostatLinkService],
})
export class ManualCallingModule {}

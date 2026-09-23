import { Module } from "@nestjs/common";
import { PrismaModule } from "../prisma/prisma.module";
import { CannedResponsesController } from "./canned-responses.controller";
import { CannedResponsesService } from "./canned-responses.service";

@Module({
  imports: [PrismaModule],
  controllers: [CannedResponsesController],
  providers: [CannedResponsesService],
  exports: [CannedResponsesService],
})
export class CannedResponsesModule {}

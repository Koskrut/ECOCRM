import { Module } from "@nestjs/common";
import { PrismaModule } from "../prisma/prisma.module";
import { PresenceController } from "./presence.controller";
import { PresenceService } from "./presence.service";

@Module({
  imports: [PrismaModule],
  controllers: [PresenceController],
  providers: [PresenceService],
})
export class PresenceModule {}

import { Module } from "@nestjs/common";
import { PrismaModule as CommonPrismaModule } from "../common/prisma.module";

@Module({
  imports: [CommonPrismaModule],
  exports: [CommonPrismaModule],
})
export class PrismaModule {}

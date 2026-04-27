import { Module } from "@nestjs/common";
import { PrismaModule } from "../prisma/prisma.module";
import { RbacController } from "./rbac.controller";
import { RbacService } from "./rbac.service";

@Module({
  imports: [PrismaModule],
  controllers: [RbacController],
  providers: [RbacService],
  exports: [RbacService],
})
export class RbacModule {}

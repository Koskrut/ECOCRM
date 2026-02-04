import { Module } from "@nestjs/common";
import { PrismaClient } from "@prisma/client";
import { createPrismaClient } from "../common/prisma";
import { AuthController } from "./auth.controller";
import { AuthService } from "./auth.service";

@Module({
  controllers: [AuthController],
  providers: [
    AuthService,
    {
      provide: PrismaClient,
      useFactory: createPrismaClient,
    },
  ],
})
export class AuthModule {}

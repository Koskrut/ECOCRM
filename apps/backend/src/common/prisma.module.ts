import { Global, Module } from "@nestjs/common";
import { PrismaClient } from "@prisma/client";
import { createPrismaClient } from "./prisma";

@Global()
@Module({
  providers: [
    {
      provide: PrismaClient,
      useFactory: () => createPrismaClient(),
    },
  ],
  exports: [PrismaClient],
})
export class PrismaModule {}

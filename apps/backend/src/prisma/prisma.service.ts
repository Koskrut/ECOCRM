import { Injectable, OnModuleDestroy, OnModuleInit } from "@nestjs/common";
import { createPrismaClient } from "../common/prisma";

@Injectable()
export class PrismaService implements OnModuleInit, OnModuleDestroy {
  // TS сам выведет тип из createPrismaClient()
  private readonly client = createPrismaClient();

  // Proxy: чтобы this.prisma.user.findMany работало как раньше
  constructor() {
    return new Proxy(this, {
      get: (target, prop) => {
        if (prop in target) return (target as any)[prop];
        return (target.client as any)[prop];
      },
    });
  }

  async onModuleInit() {
    await this.client.$connect();
  }

  async onModuleDestroy() {
    await this.client.$disconnect();
  }
}

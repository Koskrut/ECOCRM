import type { OnModuleDestroy, OnModuleInit } from "@nestjs/common";
import { Injectable } from "@nestjs/common";
import { PrismaClient } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import { Pool } from "pg";

@Injectable()
export class PrismaService extends PrismaClient implements OnModuleInit, OnModuleDestroy {
  constructor() {
    const connectionString = process.env.DATABASE_URL;
    if (!connectionString) {
      throw new Error("DATABASE_URL is not set");
    }

    const pool = new Pool({
      connectionString,
      keepAlive: true,
      idleTimeoutMillis: 30_000,
      max: 1,
      connectionTimeoutMillis: 10_000,
    });
    pool.on("error", (err) => {
      console.warn("[PrismaService] pool connection error (client will be removed):", err.message);
    });
    const adapter = new PrismaPg(pool as any);

    super({ adapter });
  }

  async onModuleInit() {
    await this.$connect();
  }

  async onModuleDestroy() {
    await this.$disconnect();
  }
}

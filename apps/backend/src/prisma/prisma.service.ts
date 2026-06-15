import type { OnModuleDestroy, OnModuleInit } from "@nestjs/common";
import { Injectable } from "@nestjs/common";
import { PrismaClient } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import { Pool } from "pg";
import { auditExtension } from "../audit/audit-prisma.extension";

@Injectable()
export class PrismaService extends PrismaClient implements OnModuleInit, OnModuleDestroy {
  constructor() {
    const connectionString = process.env.DATABASE_URL;
    if (!connectionString) {
      throw new Error(
        "DATABASE_URL is not set. Set it in apps/backend/.env or run inside the backend container: docker compose -f docker-compose.prod.yml exec backend npm run bitrix:import"
      );
    }

    const pool = new Pool({
      connectionString,
      keepAlive: true,
      idleTimeoutMillis: 30_000,
      max: 20,
      connectionTimeoutMillis: 10_000,
    });
    pool.on("error", (err) => {
      console.warn("[PrismaService] pool connection error (client will be removed):", err.message);
    });
    const adapter = new PrismaPg(pool as any);

    super({ adapter });

    // $extends() client does not expose $connect/$disconnect — keep base client for lifecycle.
    const baseClient = this;
    const extended = baseClient.$extends(auditExtension);

    return new Proxy(extended, {
      get(target, prop, receiver) {
        if (prop === "$connect") {
          return baseClient.$connect.bind(baseClient);
        }
        if (prop === "$disconnect") {
          return baseClient.$disconnect.bind(baseClient);
        }
        const value = Reflect.get(target, prop, receiver);
        return typeof value === "function" ? value.bind(target) : value;
      },
    }) as unknown as PrismaService;
  }

  async onModuleInit(): Promise<void> {
    await this.$connect();
  }

  async onModuleDestroy(): Promise<void> {
    await this.$disconnect();
  }
}

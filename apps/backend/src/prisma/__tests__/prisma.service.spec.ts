import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { Prisma, PrismaClient } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import { Pool } from "pg";
import { auditExtension, setAuditPrismaClient } from "../../audit/audit-prisma.extension";

function createExtendedClient() {
  process.env.DATABASE_URL ??= "postgresql://user:pass@localhost:5432/db";
  const pool = new Pool({ connectionString: process.env.DATABASE_URL });
  const base = new PrismaClient({ adapter: new PrismaPg(pool) });
  setAuditPrismaClient(base);
  return base.$extends(auditExtension);
}

describe("PrismaService extended client", () => {
  it("exposes model delegates and client methods", () => {
    const client = createExtendedClient();
    assert.equal(typeof client.user?.findUnique, "function");
    assert.equal(typeof client.$queryRaw, "function");
    assert.equal(typeof client.$transaction, "function");
    assert.equal(typeof client.$connect, "function");
  });

  it("$queryRaw invoked on client does not throw _createPrismaPromise error", async () => {
    const client = createExtendedClient();
    await assert.rejects(
      async () => {
        await client.$queryRaw(Prisma.sql`SELECT 1`);
      },
      (err: Error) =>
        !err.message.includes("_createPrismaPromise") && !err.message.includes("runInChildSpan"),
    );
  });

  it("$transaction callback client supports $queryRaw", async () => {
    const client = createExtendedClient();
    await assert.rejects(
      () =>
        client.$transaction(async (tx) => {
          await tx.$queryRaw(Prisma.sql`SELECT 1`);
        }),
      (err: Error) =>
        !err.message.includes("_createPrismaPromise is not a function") &&
        !err.message.includes("runInChildSpan"),
    );
  });
});

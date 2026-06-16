import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { PrismaClient } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import { Pool } from "pg";
import { auditExtension, setAuditPrismaClient } from "../audit-prisma.extension";

describe("auditExtension", () => {
  it("object-form extension exposes model delegates on extended client", () => {
    process.env.DATABASE_URL ??= "postgresql://user:pass@localhost:5432/db";
    const pool = new Pool({ connectionString: process.env.DATABASE_URL });
    const adapter = new PrismaPg(pool);
    const base = new PrismaClient({ adapter });
    setAuditPrismaClient(base);
    const extended = base.$extends(auditExtension);

    assert.equal(typeof extended.user, "object");
    assert.equal(typeof extended.user.findUnique, "function");
    assert.equal(typeof extended.$connect, "function");
  });
});

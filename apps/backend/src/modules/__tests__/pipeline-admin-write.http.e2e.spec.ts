import "reflect-metadata";

import assert from "node:assert/strict";
import { afterEach, describe, it } from "node:test";
import { Module } from "@nestjs/common";
import { APP_GUARD } from "@nestjs/core";
import { NestFactory } from "@nestjs/core";
import type { LeadStatus, LeadUiStepKey, OrderKanbanGroup, OrderStage } from "@prisma/client";

import { JwtAuthGuard } from "../../auth/jwt-auth.guard";
import { RolesGuard } from "../../auth/roles.guard";
import { signJwt } from "../../auth/jwt";

import { OrdersController } from "../../orders/orders.controller";
import { LeadsController } from "../../leads/leads.controller";
import { OrdersPipelineConfigService } from "../../orders/pipeline/orders-pipeline-config.service";
import { LeadsPipelineConfigService } from "../../leads/pipeline/leads-pipeline-config.service";
import { buildDefaultPipelineRows as buildDefaultOrderPipelineRows } from "../../orders/pipeline/order-pipeline.defaults";
import {
  buildDefaultPipelineRows as buildDefaultLeadPipelineRows,
  deriveUiStepKey,
} from "../../leads/pipeline/lead-pipeline.defaults";

import { PrismaService } from "../../prisma/prisma.service";
import { OrdersService } from "../../orders/orders.service";
import { PaymentsService } from "../../payments/payments.service";
import { PaymentRequestsService } from "../../payment-requests/payment-requests.service";
import { GoogleSheetSendOrderService } from "../../integrations/google-sheet/google-sheet-send-order.service";
import { OrdersDocumentsService } from "../../orders/orders-documents.service";
import { OrderReturnsService } from "../../order-returns/order-returns.service";
import { LeadsService } from "../../leads/leads.service";

type OrderRow = {
  stage: OrderStage;
  sortOrder: number;
  label: string;
  color: string | null;
  kanbanGroup: OrderKanbanGroup;
  allowedNext: unknown;
};

type LeadRow = {
  status: LeadStatus;
  sortOrder: number;
  label: string;
  color: string | null;
  visible: boolean;
  uiStepKey: LeadUiStepKey;
  allowedNext: unknown;
};

class InMemoryPipelinePrisma {
  public orders: OrderRow[] = buildDefaultOrderPipelineRows().map((r) => ({
    stage: r.stage,
    sortOrder: r.sortOrder,
    label: r.label,
    color: r.color,
    kanbanGroup: r.kanbanGroup,
    allowedNext: [...r.allowedNext],
  }));

  public leads: LeadRow[] = buildDefaultLeadPipelineRows().map((r) => ({
    status: r.status,
    sortOrder: r.sortOrder,
    label: r.label,
    color: r.color,
    visible: r.visible,
    uiStepKey: r.uiStepKey,
    allowedNext: [...r.allowedNext],
  }));
  public history: Array<Record<string, unknown>> = [];

  orderPipelineStage = {
    findMany: async ({ orderBy }: { orderBy?: { sortOrder: "asc" | "desc" } } = {}) => {
      const rows = [...this.orders];
      if (orderBy?.sortOrder === "asc") rows.sort((a, b) => a.sortOrder - b.sortOrder);
      return rows;
    },
    update: async (args: {
      where: { stage: OrderStage };
      data: {
        sortOrder: number;
        label: string;
        color: string | null;
        kanbanGroup: OrderKanbanGroup;
        allowedNext: unknown;
      };
    }) => {
      const idx = this.orders.findIndex((r) => r.stage === args.where.stage);
      if (idx < 0) throw new Error(`Unknown order stage: ${args.where.stage}`);
      this.orders[idx] = { ...this.orders[idx]!, ...args.data };
      return this.orders[idx];
    },
  };

  leadPipelineStage = {
    findMany: async ({ orderBy }: { orderBy?: { sortOrder: "asc" | "desc" } } = {}) => {
      const rows = [...this.leads];
      if (orderBy?.sortOrder === "asc") rows.sort((a, b) => a.sortOrder - b.sortOrder);
      return rows;
    },
    update: async (args: {
      where: { status: LeadStatus };
      data: {
        sortOrder: number;
        label: string;
        color: string | null;
        visible: boolean;
        uiStepKey: LeadUiStepKey;
        allowedNext: unknown;
      };
    }) => {
      const idx = this.leads.findIndex((r) => r.status === args.where.status);
      if (idx < 0) throw new Error(`Unknown lead status: ${args.where.status}`);
      this.leads[idx] = { ...this.leads[idx]!, ...args.data };
      return this.leads[idx];
    },
  };

  pipelineConfigHistory = {
    create: async (args: { data: Record<string, unknown> }) => {
      const row = { id: `h_${this.history.length + 1}`, createdAt: new Date(), ...args.data };
      this.history.push(row);
      return row;
    },
    findMany: async () => [...this.history],
    count: async () => this.history.length,
  };

  async $transaction<T>(ops: Array<Promise<T>>): Promise<T[]> {
    return Promise.all(ops);
  }
}

@Module({
  controllers: [OrdersController, LeadsController],
  providers: [
    OrdersPipelineConfigService,
    LeadsPipelineConfigService,
    { provide: PrismaService, useFactory: () => new InMemoryPipelinePrisma() },
    { provide: OrdersService, useValue: {} },
    { provide: PaymentsService, useValue: {} },
    { provide: PaymentRequestsService, useValue: {} },
    { provide: GoogleSheetSendOrderService, useValue: {} },
    { provide: OrdersDocumentsService, useValue: {} },
    { provide: OrderReturnsService, useValue: {} },
    { provide: LeadsService, useValue: {} },
    { provide: APP_GUARD, useClass: JwtAuthGuard },
    { provide: APP_GUARD, useClass: RolesGuard },
  ],
})
class TestPipelineHttpModule {}

async function createApp() {
  const prevSecret = process.env.JWT_SECRET;
  process.env.JWT_SECRET = process.env.JWT_SECRET ?? "test_jwt_secret";

  const app = await NestFactory.create(TestPipelineHttpModule, { logger: false });
  const server = await app.listen(0);
  const addr = server.address();
  assert(addr && typeof addr === "object" && "port" in addr);
  const baseUrl = `http://127.0.0.1:${addr.port}`;

  const adminToken = signJwt(
    { sub: "admin-1", email: "admin@example.com", role: "ADMIN", fullName: "Admin" },
    process.env.JWT_SECRET!,
    { expiresInSeconds: 60 },
  );
  const userToken = signJwt(
    { sub: "user-1", email: "user@example.com", role: "USER", fullName: "User" },
    process.env.JWT_SECRET!,
    { expiresInSeconds: 60 },
  );

  async function close() {
    await app.close();
    if (prevSecret === undefined) delete process.env.JWT_SECRET;
    else process.env.JWT_SECRET = prevSecret;
  }

  return { app, baseUrl, adminToken, userToken, close };
}

async function jsonFetch(url: string, init?: RequestInit) {
  const res = await fetch(url, init);
  const text = await res.text();
  const body = text ? (JSON.parse(text) as unknown) : null;
  return { res, body };
}

describe("pipeline admin write flows (HTTP smoke)", () => {
  let current: Awaited<ReturnType<typeof createApp>> | null = null;

  afterEach(async () => {
    if (current) await current.close();
    current = null;
  });

  it("orders non-admin -> 403", async () => {
    current = await createApp();

    const base = await jsonFetch(`${current.baseUrl}/orders/pipeline`, {
      method: "GET",
      headers: { authorization: `Bearer ${current.adminToken}` },
    });
    assert.equal(base.res.status, 200);

    const put = await jsonFetch(`${current.baseUrl}/orders/pipeline`, {
      method: "PUT",
      headers: {
        authorization: `Bearer ${current.userToken}`,
        "content-type": "application/json",
      },
      body: JSON.stringify(base.body),
    });
    assert.equal(put.res.status, 403);
  });

  it("orders invalid snapshot -> 400", async () => {
    current = await createApp();

    const base = await jsonFetch(`${current.baseUrl}/orders/pipeline`, {
      method: "GET",
      headers: { authorization: `Bearer ${current.adminToken}` },
    });
    assert.equal(base.res.status, 200);
    const payload = base.body as { stages: Array<{ sortOrder: number }> };
    payload.stages[0]!.sortOrder = payload.stages[1]!.sortOrder;

    const put = await jsonFetch(`${current.baseUrl}/orders/pipeline`, {
      method: "PUT",
      headers: {
        authorization: `Bearer ${current.adminToken}`,
        "content-type": "application/json",
      },
      body: JSON.stringify(payload),
    });
    assert.equal(put.res.status, 400);
  });

  it("orders valid snapshot -> 200 and GET reflects change (with baseline restore in finally)", async () => {
    current = await createApp();

    const base = await jsonFetch(`${current.baseUrl}/orders/pipeline`, {
      method: "GET",
      headers: { authorization: `Bearer ${current.adminToken}` },
    });
    assert.equal(base.res.status, 200);
    const baseline = base.body as {
      stages: Array<{
        stage: OrderStage;
        sortOrder: number;
        label: string;
        color: string | null;
        kanbanGroup: OrderKanbanGroup;
        allowedNext: OrderStage[];
      }>;
    };

    const payload = JSON.parse(JSON.stringify(baseline)) as typeof baseline;
    const row = payload.stages.find((s) => s.stage === "NEW");
    assert(row);
    row.label = `${row.label} [e2e]`;

    try {
      const put = await jsonFetch(`${current.baseUrl}/orders/pipeline`, {
        method: "PUT",
        headers: {
          authorization: `Bearer ${current.adminToken}`,
          "content-type": "application/json",
        },
        body: JSON.stringify(payload),
      });
      assert.equal(put.res.status, 200);

      const after = await jsonFetch(`${current.baseUrl}/orders/pipeline`, {
        method: "GET",
        headers: { authorization: `Bearer ${current.adminToken}` },
      });
      assert.equal(after.res.status, 200);
      const out = after.body as typeof baseline;
      assert.equal(out.stages.find((s) => s.stage === "NEW")?.label, row.label);
    } finally {
      const restore = await jsonFetch(`${current.baseUrl}/orders/pipeline`, {
        method: "PUT",
        headers: {
          authorization: `Bearer ${current.adminToken}`,
          "content-type": "application/json",
        },
        body: JSON.stringify(baseline),
      });
      assert.equal(restore.res.status, 200);
    }
  });

  it("leads non-admin -> 403", async () => {
    current = await createApp();

    const base = await jsonFetch(`${current.baseUrl}/leads/pipeline`, {
      method: "GET",
      headers: { authorization: `Bearer ${current.adminToken}` },
    });
    assert.equal(base.res.status, 200);

    const put = await jsonFetch(`${current.baseUrl}/leads/pipeline`, {
      method: "PUT",
      headers: {
        authorization: `Bearer ${current.userToken}`,
        "content-type": "application/json",
      },
      body: JSON.stringify({ stages: (base.body as { stages: unknown[] }).stages }),
    });
    assert.equal(put.res.status, 403);
  });

  it("leads invalid snapshot -> 400", async () => {
    current = await createApp();

    const base = await jsonFetch(`${current.baseUrl}/leads/pipeline`, {
      method: "GET",
      headers: { authorization: `Bearer ${current.adminToken}` },
    });
    assert.equal(base.res.status, 200);

    const payload = {
      stages: [...((base.body as { stages: Array<Record<string, unknown>> }).stages)],
    };
    payload.stages = payload.stages.filter((s) => s.status !== "SPAM");

    const put = await jsonFetch(`${current.baseUrl}/leads/pipeline`, {
      method: "PUT",
      headers: {
        authorization: `Bearer ${current.adminToken}`,
        "content-type": "application/json",
      },
      body: JSON.stringify(payload),
    });
    assert.equal(put.res.status, 400);
  });

  it("leads valid snapshot -> 200, GET reflects change, uiStepKey remains derived (with baseline restore in finally)", async () => {
    current = await createApp();

    const base = await jsonFetch(`${current.baseUrl}/leads/pipeline`, {
      method: "GET",
      headers: { authorization: `Bearer ${current.adminToken}` },
    });
    assert.equal(base.res.status, 200);

    const baseline = {
      stages: ((base.body as { stages: Array<Record<string, unknown>> }).stages).map((s) => ({
        status: s.status as LeadStatus,
        sortOrder: s.sortOrder as number,
        label: s.label as string,
        color: (s.color ?? null) as string | null,
        visible: s.visible as boolean,
        allowedNext: (s.allowedNext as LeadStatus[]) ?? [],
      })),
    };

    const payload = JSON.parse(JSON.stringify(baseline)) as typeof baseline;
    const wonRow = payload.stages.find((s) => s.status === "WON");
    const newRow = payload.stages.find((s) => s.status === "NEW");
    assert(wonRow);
    assert(newRow);
    newRow.label = `${newRow.label} [e2e]`;

    // Should be ignored by write path; uiStepKey is always derived from status on server side.
    (wonRow as Record<string, unknown>).uiStepKey = "NEW";

    try {
      const put = await jsonFetch(`${current.baseUrl}/leads/pipeline`, {
        method: "PUT",
        headers: {
          authorization: `Bearer ${current.adminToken}`,
          "content-type": "application/json",
        },
        body: JSON.stringify(payload),
      });
      assert.equal(put.res.status, 200);

      const after = await jsonFetch(`${current.baseUrl}/leads/pipeline`, {
        method: "GET",
        headers: { authorization: `Bearer ${current.adminToken}` },
      });
      assert.equal(after.res.status, 200);
      const out = after.body as {
        stages: Array<{ status: LeadStatus; label: string; uiStepKey: LeadUiStepKey }>;
      };
      assert.equal(out.stages.find((s) => s.status === "NEW")?.label, newRow.label);

      const expectedMap: Record<LeadStatus, LeadUiStepKey> = {
        NEW: "NEW",
        IN_PROGRESS: "IN_PROGRESS",
        WON: "PROCESSED",
        NOT_TARGET: "PROCESSED",
        LOST: "PROCESSED",
        SPAM: "PROCESSED",
      };
      for (const stage of out.stages) {
        assert.equal(stage.uiStepKey, expectedMap[stage.status]);
        assert.equal(stage.uiStepKey, deriveUiStepKey(stage.status));
      }
    } finally {
      const restore = await jsonFetch(`${current.baseUrl}/leads/pipeline`, {
        method: "PUT",
        headers: {
          authorization: `Bearer ${current.adminToken}`,
          "content-type": "application/json",
        },
        body: JSON.stringify(baseline),
      });
      assert.equal(restore.res.status, 200);
    }
  });
});

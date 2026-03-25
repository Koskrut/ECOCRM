import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { ForbiddenException } from "@nestjs/common";
import { OrderSource, OrderStage, UserRole } from "@prisma/client";
import { ContactsService } from "../contacts.service";
import type { PrismaService } from "../../prisma/prisma.service";
import type { ContactAccessService } from "../contact-access.service";

describe("ContactsService.getCard", () => {
  it("returns KPI, partial-data notice, and split order sections", async () => {
    const logMessages: string[] = [];
    const orderCountCalls: unknown[] = [];
    const orderFindManyCalls: unknown[] = [];
    const prisma = {
      contact: {
        findUnique: async () => ({
          id: "c-1",
          ownerId: "mgr-1",
          companyId: "co-1",
          firstName: "Іван",
          lastName: "Іваненко",
          middleName: null,
          phone: "+380501112233",
          phoneNormalized: "380501112233",
          email: "[email protected]",
          position: "Doctor",
          address: null,
          lat: null,
          lng: null,
          googlePlaceId: null,
          isPrimary: false,
          externalCode: null,
          documentDisplayName: null,
          region: null,
          addressInfo: null,
          city: null,
          clientType: "Врач",
          status: "Клієнт",
          marketingCallOptOut: false,
          createdAt: new Date("2026-03-20T10:00:00.000Z"),
          updatedAt: new Date("2026-03-24T10:00:00.000Z"),
          company: { id: "co-1", name: "Clinic", edrpou: null, taxId: null },
          owner: { id: "mgr-1", fullName: "Manager", email: "[email protected]" },
        }),
      },
      order: {
        count: async (args: { where: unknown }) => {
          orderCountCalls.push(args.where);
          if (orderCountCalls.length === 1) return 3; // canonical total before RBAC
          if (orderCountCalls.length === 2) return 2; // visible canonical
          if (orderCountCalls.length === 3) return 1; // legacy
          return 1; // company
        },
        aggregate: async (args: { where: unknown; _sum?: unknown; _count?: true }) => {
          if ((args.where as { AND?: unknown[] }).AND?.length === 2) {
            return { _count: 2, _sum: { totalAmount: 3500, debtAmount: 900 } };
          }
          return { _sum: { debtAmount: 400 } };
        },
        findFirst: async (args: { select?: { id?: boolean } }) => {
          if (args.select?.id) {
            return {
              id: "ord-last",
              createdAt: new Date("2026-03-23T12:00:00.000Z"),
              orderNumber: "103",
            };
          }
          return null;
        },
        findMany: async (args: { where: unknown }) => {
          orderFindManyCalls.push(args.where);
          if (orderFindManyCalls.length === 1) {
            return [
              {
                id: "ord-1",
                orderNumber: "101",
                totalAmount: 2000,
                currency: "UAH",
                orderStage: OrderStage.NEW,
                debtAmount: 500,
                createdAt: new Date("2026-03-22T10:00:00.000Z"),
                financialStatus: null,
                paymentDueDate: new Date("2026-03-21T00:00:00.000Z"),
              },
              {
                id: "ord-2",
                orderNumber: "102",
                totalAmount: 1500,
                currency: "UAH",
                orderStage: OrderStage.CONFIRMED,
                debtAmount: 400,
                createdAt: new Date("2026-03-21T10:00:00.000Z"),
                financialStatus: null,
                paymentDueDate: null,
              },
            ];
          }
          if (orderFindManyCalls.length === 2) {
            return [
              {
                id: "ord-legacy",
                orderNumber: "090",
                totalAmount: 700,
                currency: "UAH",
                orderStage: OrderStage.SHIPPED,
                debtAmount: 0,
                createdAt: new Date("2026-03-19T10:00:00.000Z"),
                financialStatus: null,
                paymentDueDate: null,
              },
            ];
          }
          return [
            {
              id: "ord-company",
              orderNumber: "080",
              totalAmount: 900,
              currency: "UAH",
              orderStage: OrderStage.READY_TO_SHIP,
              debtAmount: 0,
              createdAt: new Date("2026-03-18T10:00:00.000Z"),
              financialStatus: null,
              paymentDueDate: null,
            },
          ];
        },
      },
      activity: {
        findFirst: async () => ({
          createdAt: new Date("2026-03-24T08:00:00.000Z"),
          occurredAt: new Date("2026-03-24T09:00:00.000Z"),
        }),
      },
    } as unknown as PrismaService;

    const contactAccess = {
      getTeamUserIds: async () => ["mgr-1"],
      orderVisibilityWhere: () => ({ OR: [{ ownerId: "mgr-1" }, { orderSource: OrderSource.STORE }] }),
      activeOrderFilter: () => ({
        OR: [{ orderStage: { notIn: [OrderStage.COMPLETED] } }, { orderStage: null }],
      }),
      assertCanViewContact: async () => undefined,
    } as unknown as ContactAccessService;

    const svc = new ContactsService(prisma, contactAccess);
    (svc as unknown as { logger: { log: (msg: string) => void; warn: (msg: string) => void } }).logger = {
      log: (msg: string) => logMessages.push(msg),
      warn: () => undefined,
    };

    const out = await svc.getCard("c-1", {
      id: "mgr-1",
      email: "[email protected]",
      fullName: "Manager",
      role: UserRole.MANAGER,
    });

    assert.strictEqual(out.kpi.orderCount, 2);
    assert.strictEqual(out.kpi.totalRevenue, 3500);
    assert.strictEqual(out.kpi.totalDebt, 900);
    assert.strictEqual(out.kpi.overdueDebt, 400);
    assert.strictEqual(out.kpi.averageOrderValue, 1750);
    assert.strictEqual(out.kpiAccess.showPartialDataNotice, true);
    assert.match(out.kpiAccess.partialDataNotice, /доступних вам/i);
    assert.strictEqual(out.canonicalOrders.total, 2);
    assert.strictEqual(out.legacyLinkedOrders.total, 1);
    assert.strictEqual(out.companyOrders.total, 1);
    assert.strictEqual(out.canonicalOrders.items[0].id, "ord-1");
    assert.strictEqual(out.legacyLinkedOrders.items[0].id, "ord-legacy");
    assert.strictEqual(out.companyOrders.items[0].id, "ord-company");
    assert.strictEqual(out.kpi.lastOrderAt, "2026-03-23T12:00:00.000Z");
    assert.strictEqual(out.kpi.lastActivityAt, "2026-03-24T09:00:00.000Z");
    assert.strictEqual(logMessages.length, 1);
    const parsed = JSON.parse(logMessages[0]) as {
      event: string;
      outcome: string;
      statusCode: number;
      partialData: boolean;
      canonicalVisibleCount: number;
      legacyTotal: number;
      companyTotal: number;
    };
    assert.strictEqual(parsed.event, "contact_card_get");
    assert.strictEqual(parsed.outcome, "ok");
    assert.strictEqual(parsed.statusCode, 200);
    assert.strictEqual(parsed.partialData, true);
    assert.strictEqual(parsed.canonicalVisibleCount, 2);
    assert.strictEqual(parsed.legacyTotal, 1);
    assert.strictEqual(parsed.companyTotal, 1);
  });

  it("logs structured forbidden outcome for 403 access errors", async () => {
    const warnMessages: string[] = [];
    const prisma = {
      contact: {
        findUnique: async () => ({
          id: "c-1",
          ownerId: "other",
          companyId: null,
          firstName: "Іван",
          lastName: "Іваненко",
          middleName: null,
          phone: "+380501112233",
          phoneNormalized: "380501112233",
          email: null,
          position: null,
          address: null,
          lat: null,
          lng: null,
          googlePlaceId: null,
          isPrimary: false,
          externalCode: null,
          documentDisplayName: null,
          region: null,
          addressInfo: null,
          city: null,
          clientType: null,
          status: null,
          marketingCallOptOut: false,
          createdAt: new Date("2026-03-20T10:00:00.000Z"),
          updatedAt: new Date("2026-03-24T10:00:00.000Z"),
          company: null,
          owner: null,
        }),
      },
    } as unknown as PrismaService;
    const contactAccess = {
      getTeamUserIds: async () => ["mgr-1"],
      orderVisibilityWhere: () => ({}),
      activeOrderFilter: () => ({}),
      assertCanViewContact: async () => {
        throw new ForbiddenException("forbidden");
      },
    } as unknown as ContactAccessService;

    const svc = new ContactsService(prisma, contactAccess);
    (svc as unknown as { logger: { log: (msg: string) => void; warn: (msg: string) => void } }).logger = {
      log: () => undefined,
      warn: (msg: string) => warnMessages.push(msg),
    };

    await assert.rejects(
      () =>
        svc.getCard("c-1", {
          id: "mgr-1",
          email: "[email protected]",
          fullName: "Manager",
          role: UserRole.MANAGER,
        }),
      (err: unknown) => err instanceof ForbiddenException,
    );

    assert.strictEqual(warnMessages.length, 1);
    const parsed = JSON.parse(warnMessages[0]) as {
      event: string;
      outcome: string;
      statusCode: number;
      contactId: string;
    };
    assert.strictEqual(parsed.event, "contact_card_get");
    assert.strictEqual(parsed.outcome, "forbidden");
    assert.strictEqual(parsed.statusCode, 403);
    assert.strictEqual(parsed.contactId, "c-1");
  });
});

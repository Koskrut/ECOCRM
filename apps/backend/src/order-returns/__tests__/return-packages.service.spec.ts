import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { BadRequestException } from "@nestjs/common";
import { ReturnPackagesService } from "../return-packages.service";

type PrismaSvc = import("../../prisma/prisma.service").PrismaService;
type OrderReturnsSvc = import("../order-returns.service").OrderReturnsService;

describe("ReturnPackagesService", () => {
  it("addItems creates order return for new order in package", async () => {
    let createdOrderReturnId: string | null = null;
    const prisma = {
      returnPackage: {
        findUnique: async () => ({
          id: "pkg1",
          status: "RECEIVED_BY_WAREHOUSE",
          returns: [],
        }),
        update: async () => ({}),
      },
      order: {
        findUnique: async () => ({
          id: "o1",
          ownerId: "u1",
          orderStage: "RECEIVED",
          items: [{ id: "i1", qty: 2 }],
        }),
      },
      orderReturnItem: { groupBy: async () => [] },
      $transaction: async (
        cb: (tx: {
          order: {
            findUnique: (args: unknown) => Promise<{ warehouseId: string | null }>;
          };
          orderReturn: {
            create: (args: { data: Record<string, unknown> }) => Promise<{ id: string }>;
            update: (args: unknown) => Promise<unknown>;
          };
          orderReturnItem: {
            create: (args: unknown) => Promise<unknown>;
            findUnique: () => Promise<null>;
          };
        }) => Promise<unknown>,
      ) =>
        cb({
          order: {
            findUnique: async () => ({ warehouseId: null }),
          },
          orderReturn: {
            create: async (args: { data: Record<string, unknown> }) => {
              createdOrderReturnId = "or1";
              return { id: "or1", ...args.data };
            },
            update: async () => ({}),
          },
          orderReturnItem: {
            create: async () => ({}),
            findUnique: async () => null,
          },
        }),
    } as unknown as PrismaSvc;

    const orderReturns = {
      syncOrderStateFromReturns: async () => {},
    } as unknown as OrderReturnsSvc;

    const np = { call: async () => ({ data: [] }) } as never;

    const svc = new ReturnPackagesService(prisma, orderReturns, np);
    await svc.addItems(
      "pkg1",
      { orderId: "o1", items: [{ orderItemId: "i1", qtyReturned: 1 }] },
      { id: "w1", role: "WAREHOUSE" },
    );

    assert.equal(createdOrderReturnId, "or1");
  });

  it("completeInspection rejects when return has no items", async () => {
    const prisma = {
      returnPackage: {
        findUnique: async () => ({
          id: "pkg1",
          status: "RECEIVED_BY_WAREHOUSE",
          returns: [
            {
              id: "r1",
              orderId: "o1",
              status: "RECEIVED_BY_WAREHOUSE",
              itemsPending: true,
              items: [],
            },
          ],
        }),
      },
    } as unknown as PrismaSvc;

    const svc = new ReturnPackagesService(
      prisma,
      { syncOrderStateFromReturns: async () => {} } as unknown as OrderReturnsSvc,
      { call: async () => ({}) } as never,
    );

    await assert.rejects(
      () => svc.completeInspection("pkg1", { id: "w1", role: "WAREHOUSE" }),
      BadRequestException,
    );
  });

  it("list unlinked packages does not require an owned order", async () => {
    let where: unknown;
    const prisma = {
      returnPackage: {
        findMany: async (args: { where: unknown }) => {
          where = args.where;
          return [];
        },
        count: async () => 0,
      },
    } as unknown as PrismaSvc;

    const svc = new ReturnPackagesService(
      prisma,
      { syncOrderStateFromReturns: async () => {} } as unknown as OrderReturnsSvc,
      { call: async () => ({}) } as never,
    );

    await svc.list(
      { unlinked: true, status: "IN_TRANSIT_BACK", q: "2045 0000 1234", page: 1, pageSize: 20 },
      { id: "m1", role: "MANAGER" },
    );

    assert.deepEqual(where, {
      AND: [
        { status: "IN_TRANSIT_BACK" },
        { returns: { none: {} } },
        {
          OR: [
            { ttnNumber: { contains: "204500001234", mode: "insensitive" } },
            { note: { contains: "2045 0000 1234", mode: "insensitive" } },
            {
              contact: {
                is: {
                  OR: [
                    { firstName: { contains: "2045 0000 1234", mode: "insensitive" } },
                    { lastName: { contains: "2045 0000 1234", mode: "insensitive" } },
                    {
                      AND: [
                        {
                          OR: [
                            { firstName: { contains: "2045", mode: "insensitive" } },
                            { lastName: { contains: "2045", mode: "insensitive" } },
                          ],
                        },
                        {
                          OR: [
                            { firstName: { contains: "0000", mode: "insensitive" } },
                            { lastName: { contains: "0000", mode: "insensitive" } },
                          ],
                        },
                        {
                          OR: [
                            { firstName: { contains: "1234", mode: "insensitive" } },
                            { lastName: { contains: "1234", mode: "insensitive" } },
                          ],
                        },
                      ],
                    },
                    { phone: { contains: "2045 0000 1234", mode: "insensitive" } },
                    { phoneNormalized: { contains: "204500001234" } },
                  ],
                },
              },
            },
          ],
        },
      ],
    });
  });

  it("suggestLines prefers contact match and skips fully returned lines", async () => {
    const prisma = {
      returnPackage: {
        findUnique: async () => ({
          id: "pkg1",
          contactId: "c1",
          contact: { id: "c1", companyId: "co1" },
        }),
      },
      orderItem: {
        findMany: async () => [
          {
            id: "oi-other",
            qty: 2,
            productNameSnapshot: "Kit A",
            productId: "p1",
            product: { id: "p1", name: "Kit A", sku: "KIT-A" },
            order: {
              id: "o-other",
              orderNumber: "O-OTHER",
              orderStage: "RECEIVED",
              updatedAt: new Date("2026-01-01"),
              clientId: "c9",
              contactId: null,
              companyId: null,
              client: { id: "c9", firstName: "Other", lastName: "Client" },
              company: null,
            },
          },
          {
            id: "oi-match",
            qty: 3,
            productNameSnapshot: "Kit A",
            productId: "p1",
            product: { id: "p1", name: "Kit A", sku: "KIT-A" },
            order: {
              id: "o-match",
              orderNumber: "O-MATCH",
              orderStage: "RECEIVED",
              updatedAt: new Date("2026-02-01"),
              clientId: "c1",
              contactId: null,
              companyId: "co1",
              client: { id: "c1", firstName: "Ivan", lastName: "Petrenko" },
              company: { id: "co1", name: "Acme" },
            },
          },
          {
            id: "oi-done",
            qty: 1,
            productNameSnapshot: "Kit A",
            productId: "p1",
            product: { id: "p1", name: "Kit A", sku: "KIT-A" },
            order: {
              id: "o-done",
              orderNumber: "O-DONE",
              orderStage: "COMPLETED",
              updatedAt: new Date("2026-03-01"),
              clientId: "c1",
              contactId: null,
              companyId: "co1",
              client: { id: "c1", firstName: "Ivan", lastName: "Petrenko" },
              company: { id: "co1", name: "Acme" },
            },
          },
        ],
      },
      orderReturnItem: {
        groupBy: async () => [
          { orderItemId: "oi-done", _sum: { qtyReturned: 1 } },
          { orderItemId: "oi-match", _sum: { qtyReturned: 1 } },
        ],
      },
    } as unknown as PrismaSvc;

    const svc = new ReturnPackagesService(
      prisma,
      { syncOrderStateFromReturns: async () => {} } as unknown as OrderReturnsSvc,
      { call: async () => ({}) } as never,
    );

    const result = await svc.suggestLines(
      "pkg1",
      { q: "KIT-A" },
      { id: "w1", role: "WAREHOUSE" },
    );

    assert.equal(result.items.length, 2);
    assert.equal(result.items[0]?.orderNumber, "O-MATCH");
    assert.equal(result.items[0]?.returnableQty, 2);
    assert.equal(result.items[0]?.contactMatch, true);
    assert.equal(result.items.some((x) => x.orderItemId === "oi-done"), false);
  });

  it("sync to in-transit does not demote a received package", async () => {
    const updates: Array<Record<string, unknown>> = [];
    const prisma = {
      returnPackage: {
        findUnique: async () => ({
          id: "pkg1",
          status: "RECEIVED_BY_WAREHOUSE",
          returns: [{ id: "r1", orderId: "o1", status: "RECEIVED_BY_WAREHOUSE" }],
        }),
        update: async (args: { data: Record<string, unknown> }) => {
          updates.push(args.data);
          return {};
        },
      },
    } as unknown as PrismaSvc;

    const svc = new ReturnPackagesService(
      prisma,
      { syncOrderStateFromReturns: async () => {} } as unknown as OrderReturnsSvc,
      { call: async () => ({}) } as never,
    );

    await svc.syncLinkedReturnsLogistics("pkg1", "IN_TRANSIT_BACK");

    assert.deepEqual(updates, [{ status: "RECEIVED_BY_WAREHOUSE" }]);
  });
});

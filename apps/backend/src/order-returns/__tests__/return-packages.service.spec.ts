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
});

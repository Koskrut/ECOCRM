import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { ForbiddenException } from "@nestjs/common";
import { OrderSource, OrderStage, UserRole } from "@prisma/client";
import { ContactAccessService, CONTACT_CARD_CLOSED_ORDER_STAGES } from "../contact-access.service";
import type { PrismaService } from "../../prisma/prisma.service";

describe("ContactAccessService", () => {
  it("returns closed-order filter for active KPI orders", () => {
    const prisma = {} as PrismaService;
    const svc = new ContactAccessService(prisma);

    assert.deepStrictEqual(svc.activeOrderFilter(), {
      OR: [{ orderStage: { notIn: CONTACT_CARD_CLOSED_ORDER_STAGES } }, { orderStage: null }],
    });
    assert.deepStrictEqual(CONTACT_CARD_CLOSED_ORDER_STAGES, [
      OrderStage.COMPLETED,
      OrderStage.CANCELED,
      OrderStage.REFUSED,
      OrderStage.RETURN_IN_PROGRESS,
    ]);
  });

  it("builds order visibility by role", () => {
    const prisma = {} as PrismaService;
    const svc = new ContactAccessService(prisma);

    assert.deepStrictEqual(
      svc.orderVisibilityWhere(
        { id: "mgr-1", email: "m@test", fullName: "Mgr", role: UserRole.MANAGER },
        ["mgr-1"],
      ),
      { OR: [{ ownerId: "mgr-1" }, { orderSource: OrderSource.STORE }] },
    );

    assert.deepStrictEqual(
      svc.orderVisibilityWhere(
        { id: "lead-1", email: "l@test", fullName: "Lead", role: UserRole.LEAD },
        ["lead-1", "mgr-1"],
      ),
      { OR: [{ ownerId: { in: ["lead-1", "mgr-1"] } }, { orderSource: OrderSource.STORE }] },
    );

    assert.deepStrictEqual(
      svc.orderVisibilityWhere(
        { id: "admin-1", email: "a@test", fullName: "Admin", role: UserRole.ADMIN },
        ["admin-1"],
      ),
      {},
    );
  });

  it("allows manager to view null-owner contact when linkage exists", async () => {
    const prisma = {
      contact: {
        count: async () => 1,
      },
    } as unknown as PrismaService;
    const svc = new ContactAccessService(prisma);

    await assert.doesNotReject(async () => {
      await svc.assertCanViewContact(
        { id: "c-1", ownerId: null },
        { id: "mgr-1", email: "m@test", fullName: "Mgr", role: UserRole.MANAGER },
      );
    });
  });

  it("rejects manager for null-owner contact without linkage", async () => {
    const prisma = {
      contact: {
        count: async () => 0,
      },
    } as unknown as PrismaService;
    const svc = new ContactAccessService(prisma);

    await assert.rejects(
      () =>
        svc.assertCanViewContact(
          { id: "c-1", ownerId: null },
          { id: "mgr-1", email: "m@test", fullName: "Mgr", role: UserRole.MANAGER },
        ),
      (err: unknown) =>
        err instanceof ForbiddenException &&
        err.message === "You can only access contacts assigned to you",
    );
  });

  it("returns manager contact-list filter with null-owner linkage rules", () => {
    const prisma = {} as PrismaService;
    const svc = new ContactAccessService(prisma);

    assert.deepStrictEqual(svc.managerContactListWhere("mgr-1"), {
      OR: [
        { ownerId: "mgr-1" },
        {
          AND: [
            { ownerId: null },
            {
              OR: [
                {
                  ordersAsClient: {
                    some: { OR: [{ ownerId: "mgr-1" }, { orderSource: OrderSource.STORE }] },
                  },
                },
                {
                  ordersAsContact: {
                    some: { OR: [{ ownerId: "mgr-1" }, { orderSource: OrderSource.STORE }] },
                  },
                },
                { activities: { some: { createdBy: "mgr-1" } } },
                { visits: { some: { ownerId: "mgr-1" } } },
                {
                  tasks: {
                    some: {
                      OR: [{ assigneeId: "mgr-1" }, { createdById: "mgr-1" }],
                    },
                  },
                },
              ],
            },
          ],
        },
      ],
    });
  });

  it("allows lead to assign owner only inside team", async () => {
    const prisma = {
      user: {
        findMany: async () => [{ id: "mgr-1" }, { id: "mgr-2" }],
      },
    } as unknown as PrismaService;
    const svc = new ContactAccessService(prisma);

    await assert.doesNotReject(() => svc.assertLeadCanAssignOwner("mgr-1", "lead-1"));
    await assert.doesNotReject(() => svc.assertLeadCanAssignOwner("lead-1", "lead-1"));
    await assert.rejects(
      () => svc.assertLeadCanAssignOwner("outsider", "lead-1"),
      (err: unknown) =>
        err instanceof ForbiddenException &&
        err.message === "LEAD can only assign owner to users in their team",
    );
  });
});

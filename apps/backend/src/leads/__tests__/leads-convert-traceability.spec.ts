import { describe, it } from "node:test";
import assert from "node:assert";
import { ConflictException } from "@nestjs/common";
import { UserRole } from "@prisma/client";
import { LeadsService } from "../leads.service";
import type { PrismaService } from "../../prisma/prisma.service";
import type { ContactsService } from "../../contacts/contacts.service";
import type { CompaniesService } from "../../companies/companies.service";
import type { OrdersService } from "../../orders/orders.service";
import type { SettingsService } from "../../settings/settings.service";
import type { AuthUser } from "../../auth/auth.types";

const noopSettings = {} as unknown as SettingsService;

const actor: AuthUser = {
  id: "user-1",
  email: "m@example.com",
  fullName: "Manager",
  role: UserRole.MANAGER,
};

describe("LeadsService.convert — lead → order traceability", () => {
  it("writes convertedOrderId on lead update after order create (createDeal)", async () => {
    let updatePayload: { data: Record<string, unknown> } | null = null;

    const baseLead = {
      id: "lead-1",
      companyId: "comp-1",
      ownerId: "user-1",
      phone: "+380501112233",
      name: "Test Lead",
      convertedOrderId: null as string | null,
      items: [] as Array<{ productId: string; qty: number; price: number }>,
    };

    const prisma = {
      lead: {
        findUnique: async () => ({ ...baseLead }),
        update: async (args: { data: Record<string, unknown>; include?: unknown }) => {
          updatePayload = args;
          return {
            ...baseLead,
            contactId: "contact-1",
            status: "WON",
            convertedOrderId: "order-1",
            convertedOrder: { id: "order-1", orderNumber: "7001" },
          };
        },
      },
      activity: { updateMany: async () => ({ count: 0 }) },
      telegramAccount: { updateMany: async () => ({ count: 0 }) },
      conversation: { updateMany: async () => ({ count: 0 }) },
      contact: {
        findUnique: async () => ({
          id: "contact-1",
          firstName: "A",
          lastName: "B",
          phone: "+380501112233",
        }),
      },
    } as unknown as PrismaService;

    const contactsService = {
      create: async () => ({ id: "contact-1" }),
    } as unknown as ContactsService;

    const companiesService = {} as unknown as CompaniesService;

    const ordersService = {
      create: async () => ({ id: "order-1" }),
      addItem: async () => ({}),
    } as unknown as OrdersService;

    const svc = new LeadsService(prisma, noopSettings, contactsService, companiesService, ordersService);

    await svc.convert("lead-1", { contactMode: "create", contact: { phone: "+380501112233" }, createDeal: true }, actor);

    assert.ok(updatePayload);
    const data = updatePayload!.data as { convertedOrder?: { connect: { id: string } } };
    assert.strictEqual(data.convertedOrder?.connect?.id, "order-1");
  });

  it("throws ConflictException when createDeal and lead already has convertedOrderId", async () => {
    const baseLead = {
      id: "lead-2",
      companyId: "comp-1",
      ownerId: "user-1",
      phone: "+380501112233",
      name: "Test",
      convertedOrderId: "order-existing",
      items: [] as Array<{ productId: string; qty: number; price: number }>,
    };

    const prisma = {
      lead: { findUnique: async () => ({ ...baseLead }) },
    } as unknown as PrismaService;

    const svc = new LeadsService(
      prisma,
      noopSettings,
      {} as ContactsService,
      {} as CompaniesService,
      { create: async () => assert.fail("should not create order"), addItem: async () => ({}) } as unknown as OrdersService,
    );

    await assert.rejects(
      () =>
        svc.convert(
          "lead-2",
          { contactMode: "create", contact: { phone: "+380501112233" }, createDeal: true },
          actor,
        ),
      (err: unknown) => err instanceof ConflictException,
    );
  });
});

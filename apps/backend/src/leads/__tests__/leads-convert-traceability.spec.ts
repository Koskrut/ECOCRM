import { describe, it } from "node:test";
import assert from "node:assert";
import { ConflictException, BadRequestException } from "@nestjs/common";
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
      region: "Київська",
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

  it("passes lead region and address to contact create", async () => {
    let contactCreatePayload: Record<string, unknown> | null = null;

    const baseLead = {
      id: "lead-3",
      companyId: "comp-1",
      ownerId: "user-1",
      phone: "+380501112233",
      name: "Test Lead",
      region: "Київська",
      city: "Київ",
      address: "вул. Хрещатик, 1",
      lat: 50.45,
      lng: 30.52,
      googlePlaceId: "place-1",
      convertedOrderId: null as string | null,
      items: [] as Array<{ productId: string; qty: number; price: number }>,
    };

    const prisma = {
      lead: {
        findUnique: async () => ({ ...baseLead }),
        update: async () => ({
          ...baseLead,
          contactId: "contact-1",
          status: "WON",
        }),
      },
      activity: { updateMany: async () => ({ count: 0 }) },
      telegramAccount: { updateMany: async () => ({ count: 0 }) },
      conversation: { updateMany: async () => ({ count: 0 }) },
      contact: {
        findUnique: async () => ({
          id: "contact-1",
          firstName: "Test",
          lastName: "Lead",
          phone: "+380501112233",
        }),
      },
    } as unknown as PrismaService;

    const contactsService = {
      create: async (data: Record<string, unknown>) => {
        contactCreatePayload = data;
        return { id: "contact-1" };
      },
    } as unknown as ContactsService;

    const svc = new LeadsService(
      prisma,
      noopSettings,
      contactsService,
      {} as CompaniesService,
      { create: async () => ({}), addItem: async () => ({}) } as unknown as OrdersService,
    );

    await svc.convert(
      "lead-3",
      { contactMode: "create", contact: { phone: "+380501112233" }, createDeal: false },
      actor,
    );

    assert.ok(contactCreatePayload);
    assert.strictEqual(contactCreatePayload!.region, "Київська");
    assert.strictEqual(contactCreatePayload!.city, "Київ");
    assert.strictEqual(contactCreatePayload!.address, "вул. Хрещатик, 1");
    assert.strictEqual(contactCreatePayload!.lat, 50.45);
    assert.strictEqual(contactCreatePayload!.lng, 30.52);
    assert.strictEqual(contactCreatePayload!.googlePlaceId, "place-1");
  });

  it("falls back to parsed name and company when contact lastName is empty", async () => {
    let contactCreatePayload: Record<string, unknown> | null = null;

    const baseLead = {
      id: "lead-4",
      companyId: "comp-1",
      ownerId: "user-1",
      phone: "+380501112233",
      name: "Іван Петренко",
      region: "Київська",
      convertedOrderId: null as string | null,
      items: [] as Array<{ productId: string; qty: number; price: number }>,
    };

    const prisma = {
      lead: {
        findUnique: async () => ({ ...baseLead }),
        update: async () => ({ ...baseLead, contactId: "contact-1", status: "WON" }),
      },
      activity: { updateMany: async () => ({ count: 0 }) },
      telegramAccount: { updateMany: async () => ({ count: 0 }) },
      conversation: { updateMany: async () => ({ count: 0 }) },
      contact: { findUnique: async () => ({ id: "contact-1" }) },
    } as unknown as PrismaService;

    const contactsService = {
      create: async (data: Record<string, unknown>) => {
        contactCreatePayload = data;
        return { id: "contact-1" };
      },
    } as unknown as ContactsService;

    const svc = new LeadsService(
      prisma,
      noopSettings,
      contactsService,
      {} as CompaniesService,
      { create: async () => ({}), addItem: async () => ({}) } as unknown as OrdersService,
    );

    await svc.convert(
      "lead-4",
      {
        contactMode: "create",
        contact: { phone: "+380501112233", firstName: "Іван Петренко", lastName: "" },
        createDeal: false,
      },
      actor,
    );

    assert.ok(contactCreatePayload);
    assert.strictEqual(contactCreatePayload!.lastName, "Петренко");
  });

  it("throws when region is missing on lead during contact create", async () => {
    const baseLead = {
      id: "lead-5",
      companyId: "comp-1",
      ownerId: "user-1",
      phone: "+380501112233",
      name: "Test",
      region: null as string | null,
      convertedOrderId: null as string | null,
      items: [] as Array<{ productId: string; qty: number; price: number }>,
    };

    const prisma = {
      lead: { findUnique: async () => ({ ...baseLead }) },
    } as unknown as PrismaService;

    const svc = new LeadsService(
      prisma,
      noopSettings,
      { create: async () => assert.fail("should not create contact") } as unknown as ContactsService,
      {} as CompaniesService,
      {} as OrdersService,
    );

    await assert.rejects(
      () =>
        svc.convert(
          "lead-5",
          { contactMode: "create", contact: { phone: "+380501112233", lastName: "Test" }, createDeal: false },
          actor,
        ),
      (err: unknown) =>
        err instanceof BadRequestException &&
        String((err as BadRequestException).message).includes("region"),
    );
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

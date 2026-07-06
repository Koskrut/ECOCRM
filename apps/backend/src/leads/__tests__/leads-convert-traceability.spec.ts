import { describe, it } from "node:test";
import assert from "node:assert";
import { ConflictException, BadRequestException, ForbiddenException } from "@nestjs/common";
import { LeadEventType, UserRole } from "@prisma/client";
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

type Recorder = {
  leadUpdate?: { data: Record<string, unknown> };
  contactUpdate?: { where: unknown; data: Record<string, unknown> };
  orderOwnerUpdate?: { where: unknown; data: Record<string, unknown> };
  leadEvent?: { data: Record<string, unknown> };
  migrations: Record<string, { data?: Record<string, unknown> }>;
};

/**
 * Builds a Prisma mock whose `$transaction` runs the callback with the same
 * client, so all `tx.*` operations resolve against these stubs.
 */
function makePrisma(
  lead: Record<string, unknown>,
  extra: Record<string, unknown> = {},
): { prisma: PrismaService; rec: Recorder } {
  const rec: Recorder = { migrations: {} };
  const migrate = (key: string) => async (args: { data?: Record<string, unknown> }) => {
    rec.migrations[key] = args;
    return { count: 0 };
  };
  const prisma: Record<string, unknown> = {
    lead: {
      findUnique: async () => ({ ...lead }),
      update: async (args: { data: Record<string, unknown> }) => {
        rec.leadUpdate = args;
        const connectId =
          (args.data?.convertedOrder as { connect?: { id: string } } | undefined)?.connect?.id ??
          null;
        return {
          ...lead,
          contactId:
            (args.data?.contact as { connect?: { id: string } } | undefined)?.connect?.id ??
            "contact-1",
          status: "WON",
          convertedOrderId: connectId,
          convertedOrder: connectId ? { id: connectId, orderNumber: "7001" } : null,
        };
      },
    },
    contact: {
      findUnique: async () => ({
        id: "contact-1",
        firstName: "A",
        lastName: "B",
        phone: "+380501112233",
      }),
      update: async (args: { where: unknown; data: Record<string, unknown> }) => {
        rec.contactUpdate = args;
        return {};
      },
    },
    company: {
      findUnique: async () => ({ id: "comp-client", ownerId: "user-1" }),
    },
    order: {
      update: async (args: { where: unknown; data: Record<string, unknown> }) => {
        rec.orderOwnerUpdate = args;
        return {};
      },
    },
    leadEvent: {
      create: async (args: { data: Record<string, unknown> }) => {
        rec.leadEvent = args;
        return {};
      },
    },
    activity: { updateMany: migrate("activity") },
    telegramAccount: { updateMany: migrate("telegramAccount") },
    conversation: { updateMany: migrate("conversation") },
    task: { updateMany: migrate("task") },
    call: { updateMany: migrate("call") },
    callQueueItem: { updateMany: migrate("callQueueItem") },
    manualCallSession: { updateMany: migrate("manualCallSession") },
    materialReservation: { updateMany: migrate("materialReservation") },
    ...extra,
  };
  prisma.$transaction = async (fn: (client: unknown) => unknown) => fn(prisma);
  return { prisma: prisma as unknown as PrismaService, rec };
}

function makeService(
  prisma: PrismaService,
  services: {
    contacts?: Partial<ContactsService>;
    companies?: Partial<CompaniesService>;
    orders?: Partial<OrdersService>;
    workflowEmitter?: unknown;
  } = {},
): LeadsService {
  return new LeadsService(
    prisma,
    noopSettings,
    (services.contacts ?? {}) as unknown as ContactsService,
    (services.companies ?? {}) as unknown as CompaniesService,
    (services.orders ?? {}) as unknown as OrdersService,
    {} as never,
    services.workflowEmitter as never,
  );
}

describe("LeadsService.convert — lead → order traceability", () => {
  it("writes convertedOrderId on lead update after order create (createDeal)", async () => {
    const { prisma, rec } = makePrisma({
      id: "lead-1",
      companyId: "comp-1",
      ownerId: "user-1",
      phone: "+380501112233",
      name: "Test Lead",
      region: "Київська",
      convertedOrderId: null,
      items: [],
    });

    const svc = makeService(prisma, {
      contacts: { create: async () => ({ id: "contact-1" }) as never },
      orders: {
        create: async () => ({ id: "order-1" }) as never,
        addItem: async () => ({}) as never,
      },
    });

    await svc.convert(
      "lead-1",
      { contactMode: "create", contact: { phone: "+380501112233" }, createDeal: true },
      actor,
    );

    assert.ok(rec.leadUpdate);
    const data = rec.leadUpdate.data as { convertedOrder?: { connect: { id: string } } };
    assert.strictEqual(data.convertedOrder?.connect?.id, "order-1");
  });

  it("passes lead region and address to contact create", async () => {
    let contactCreatePayload: Record<string, unknown> | null = null;
    const { prisma } = makePrisma({
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
      convertedOrderId: null,
      items: [],
    });

    const svc = makeService(prisma, {
      contacts: {
        create: async (data: Record<string, unknown>) => {
          contactCreatePayload = data;
          return { id: "contact-1" } as never;
        },
      },
      orders: { create: async () => ({}) as never, addItem: async () => ({}) as never },
    });

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
    const { prisma } = makePrisma({
      id: "lead-4",
      companyId: "comp-1",
      ownerId: "user-1",
      phone: "+380501112233",
      name: "Іван Петренко",
      region: "Київська",
      convertedOrderId: null,
      items: [],
    });

    const svc = makeService(prisma, {
      contacts: {
        create: async (data: Record<string, unknown>) => {
          contactCreatePayload = data;
          return { id: "contact-1" } as never;
        },
      },
      orders: { create: async () => ({}) as never, addItem: async () => ({}) as never },
    });

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
    const { prisma } = makePrisma({
      id: "lead-5",
      companyId: "comp-1",
      ownerId: "user-1",
      phone: "+380501112233",
      name: "Test",
      region: null,
      convertedOrderId: null,
      items: [],
    });

    const svc = makeService(prisma, {
      contacts: { create: async () => assert.fail("should not create contact") },
    });

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
    const { prisma } = makePrisma({
      id: "lead-2",
      companyId: "comp-1",
      ownerId: "user-1",
      phone: "+380501112233",
      name: "Test",
      convertedOrderId: "order-existing",
      items: [],
    });

    const svc = makeService(prisma, {
      orders: {
        create: async () => assert.fail("should not create order"),
        addItem: async () => ({}) as never,
      },
    });

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

  it("uses companyId when linking existing company and contact", async () => {
    let orderCreatePayload: Record<string, unknown> | null = null;
    const { prisma } = makePrisma(
      {
        id: "lead-6",
        companyId: "comp-default",
        ownerId: "user-1",
        phone: "+380501112233",
        name: "Test",
        region: "Київська",
        convertedOrderId: null,
        contactId: null,
        status: "IN_PROGRESS",
        items: [],
      },
      {
        company: { findUnique: async () => ({ id: "comp-client", ownerId: "user-1" }) },
        contact: {
          findUnique: async () => ({ id: "contact-1", ownerId: "user-1", companyId: "comp-client" }),
          update: async () => ({}),
        },
      },
    );

    const svc = makeService(prisma, {
      orders: {
        create: async (data: Record<string, unknown>) => {
          orderCreatePayload = data;
          return { id: "order-1" } as never;
        },
        addItem: async () => ({}) as never,
      },
    });

    await svc.convert(
      "lead-6",
      { companyId: "comp-client", contactMode: "link", contactId: "contact-1", createDeal: true },
      actor,
    );

    assert.ok(orderCreatePayload);
    assert.strictEqual(orderCreatePayload!.companyId, "comp-client");
  });

  it("uses contact companyId when linking without explicit company", async () => {
    let orderCreatePayload: Record<string, unknown> | null = null;
    const { prisma } = makePrisma(
      {
        id: "lead-7",
        companyId: "comp-default",
        ownerId: "user-1",
        phone: "+380501112233",
        name: "Test",
        region: "Київська",
        convertedOrderId: null,
        contactId: null,
        status: "IN_PROGRESS",
        items: [],
      },
      {
        contact: {
          findUnique: async () => ({
            id: "contact-1",
            ownerId: "user-1",
            companyId: "comp-from-contact",
          }),
          update: async () => ({}),
        },
      },
    );

    const svc = makeService(prisma, {
      orders: {
        create: async (data: Record<string, unknown>) => {
          orderCreatePayload = data;
          return { id: "order-1" } as never;
        },
        addItem: async () => ({}) as never,
      },
    });

    await svc.convert(
      "lead-7",
      { contactMode: "link", contactId: "contact-1", createDeal: true },
      actor,
    );

    assert.ok(orderCreatePayload);
    assert.strictEqual(orderCreatePayload!.companyId, "comp-from-contact");
  });

  it("throws when companyId and createCompany are both set", async () => {
    const { prisma } = makePrisma({
      id: "lead-8",
      companyId: "comp-1",
      ownerId: "user-1",
      phone: "+380501112233",
      name: "Test",
      convertedOrderId: null,
      items: [],
    });

    const svc = makeService(prisma);

    await assert.rejects(
      () =>
        svc.convert(
          "lead-8",
          {
            companyId: "comp-client",
            createCompany: { name: "New Co" },
            contactMode: "link",
            contactId: "contact-1",
          },
          actor,
        ),
      (err: unknown) =>
        err instanceof BadRequestException &&
        String((err as BadRequestException).message).includes("companyId and createCompany"),
    );
  });

  it("throws Forbidden when manager links another user's company", async () => {
    const { prisma } = makePrisma(
      {
        id: "lead-9",
        companyId: "comp-1",
        ownerId: "user-1",
        phone: "+380501112233",
        name: "Test",
        convertedOrderId: null,
        items: [],
      },
      { company: { findUnique: async () => ({ id: "comp-other", ownerId: "user-2" }) } },
    );

    const svc = makeService(prisma);

    await assert.rejects(
      () =>
        svc.convert(
          "lead-9",
          { companyId: "comp-other", contactMode: "link", contactId: "contact-1" },
          actor,
        ),
      (err: unknown) => err instanceof ForbiddenException,
    );
  });

  it("throws Forbidden when manager links another user's contact", async () => {
    const { prisma } = makePrisma(
      {
        id: "lead-10",
        companyId: "comp-1",
        ownerId: "user-1",
        phone: "+380501112233",
        name: "Test",
        convertedOrderId: null,
        items: [],
      },
      {
        contact: {
          findUnique: async () => ({ id: "contact-1", ownerId: "user-2", companyId: null }),
          update: async () => ({}),
        },
      },
    );

    const svc = makeService(prisma);

    await assert.rejects(
      () => svc.convert("lead-10", { contactMode: "link", contactId: "contact-1" }, actor),
      (err: unknown) => err instanceof ForbiddenException,
    );
  });

  it("adds a manual order line from deal.amount when the lead has no items", async () => {
    let manualLine: { name: string; qty: number; price: number } | null = null;
    let addItemCalled = false;
    const { prisma } = makePrisma({
      id: "lead-amt",
      companyId: "comp-1",
      ownerId: "user-1",
      phone: "+380501112233",
      name: "Test",
      region: "Київська",
      convertedOrderId: null,
      items: [],
    });

    const svc = makeService(prisma, {
      contacts: { create: async () => ({ id: "contact-1" }) as never },
      orders: {
        create: async () => ({ id: "order-1" }) as never,
        addItem: async () => {
          addItemCalled = true;
          return {} as never;
        },
        addManualLine: async (
          _orderId: string,
          dto: { name: string; qty: number; price: number },
        ) => {
          manualLine = dto;
          return {} as never;
        },
      },
    });

    await svc.convert(
      "lead-amt",
      {
        contactMode: "create",
        contact: { phone: "+380501112233" },
        createDeal: true,
        deal: { title: "Консультація", amount: 1500 },
      },
      actor,
    );

    assert.ok(manualLine);
    assert.strictEqual(manualLine!.price, 1500);
    assert.strictEqual(manualLine!.name, "Консультація");
    assert.strictEqual(addItemCalled, false);
  });

  it("ignores deal.amount when the lead has product items", async () => {
    let addItemCalled = false;
    let manualLineCalled = false;
    const { prisma } = makePrisma({
      id: "lead-items",
      companyId: "comp-1",
      ownerId: "user-1",
      phone: "+380501112233",
      name: "Test",
      region: "Київська",
      convertedOrderId: null,
      items: [{ productId: "p1", qty: 2, price: 100 }],
    });

    const svc = makeService(prisma, {
      contacts: { create: async () => ({ id: "contact-1" }) as never },
      orders: {
        create: async () => ({ id: "order-1" }) as never,
        addItem: async () => {
          addItemCalled = true;
          return {} as never;
        },
        addManualLine: async () => {
          manualLineCalled = true;
          return {} as never;
        },
      },
    });

    await svc.convert(
      "lead-items",
      {
        contactMode: "create",
        contact: { phone: "+380501112233" },
        createDeal: true,
        deal: { amount: 9999 },
      },
      actor,
    );

    assert.strictEqual(addItemCalled, true);
    assert.strictEqual(manualLineCalled, false);
  });

  it("attaches a newly created company to a linked contact without one", async () => {
    const { prisma, rec } = makePrisma(
      {
        id: "lead-link-co",
        companyId: "comp-1",
        ownerId: "user-1",
        phone: "+380501112233",
        name: "Test",
        region: "Київська",
        convertedOrderId: null,
        contactId: null,
        status: "IN_PROGRESS",
        items: [],
      },
      {
        contact: {
          findUnique: async () => ({ id: "contact-1", ownerId: "user-1", companyId: null }),
          update: async (args: { where: unknown; data: Record<string, unknown> }) => {
            rec.contactUpdate = args;
            return {};
          },
        },
      },
    );

    const svc = makeService(prisma, {
      companies: { create: async () => ({ id: "comp-new" }) as never },
    });

    await svc.convert(
      "lead-link-co",
      {
        contactMode: "link",
        contactId: "contact-1",
        createCompany: { name: "Нова компанія" },
        createDeal: false,
      },
      actor,
    );

    assert.ok(rec.contactUpdate);
    assert.strictEqual(rec.contactUpdate!.data.companyId, "comp-new");
  });

  it("rejects create mode when the lead already has a contact", async () => {
    const { prisma } = makePrisma({
      id: "lead-dup",
      companyId: "comp-1",
      ownerId: "user-1",
      phone: "+380501112233",
      name: "Test",
      region: "Київська",
      convertedOrderId: null,
      contactId: "contact-existing",
      status: "WON",
      items: [],
    });

    const svc = makeService(prisma, {
      contacts: { create: async () => assert.fail("should not create contact") },
    });

    await assert.rejects(
      () =>
        svc.convert(
          "lead-dup",
          { contactMode: "create", contact: { phone: "+380501112233" }, createDeal: false },
          actor,
        ),
      (err: unknown) =>
        err instanceof BadRequestException &&
        String((err as BadRequestException).message).includes("already has a contact"),
    );
  });

  it("rejects re-conversion of a fully converted lead", async () => {
    const { prisma } = makePrisma({
      id: "lead-done",
      companyId: "comp-1",
      ownerId: "user-1",
      phone: "+380501112233",
      name: "Test",
      convertedOrderId: "order-existing",
      contactId: "contact-existing",
      status: "WON",
      items: [],
    });

    const svc = makeService(prisma);

    await assert.rejects(
      () => svc.convert("lead-done", { contactMode: "link", contactId: "contact-existing", createDeal: false }, actor),
      (err: unknown) => err instanceof ConflictException,
    );
  });

  it("allows an additional order on a WON lead with a linked contact (reorder)", async () => {
    let orderCreated = false;
    let contactCreated = false;
    const { prisma } = makePrisma(
      {
        id: "lead-reorder",
        companyId: "comp-1",
        ownerId: "user-1",
        phone: "+380501112233",
        name: "Test",
        region: "Київська",
        convertedOrderId: null,
        contactId: "contact-existing",
        status: "WON",
        items: [],
      },
      {
        contact: {
          findUnique: async () => ({
            id: "contact-existing",
            ownerId: "user-1",
            companyId: "comp-client",
          }),
          update: async () => ({}),
        },
      },
    );

    const svc = makeService(prisma, {
      contacts: {
        create: async () => {
          contactCreated = true;
          return { id: "x" } as never;
        },
      },
      orders: {
        create: async () => {
          orderCreated = true;
          return { id: "order-2" } as never;
        },
        addItem: async () => ({}) as never,
      },
    });

    await svc.convert(
      "lead-reorder",
      { contactMode: "link", contactId: "contact-existing", createDeal: true },
      actor,
    );

    assert.strictEqual(orderCreated, true);
    assert.strictEqual(contactCreated, false);
  });

  it("migrates tasks and calls to the contact and writes a CONVERTED event", async () => {
    const { prisma, rec } = makePrisma({
      id: "lead-mig",
      companyId: "comp-1",
      ownerId: "user-1",
      phone: "+380501112233",
      name: "Test",
      region: "Київська",
      convertedOrderId: null,
      items: [],
    });

    const emitted: { updated: unknown[][] } = { updated: [] };
    const svc = makeService(prisma, {
      contacts: { create: async () => ({ id: "contact-1" }) as never },
      workflowEmitter: {
        emitRecordCreated: () => {},
        emitRecordUpdated: (...args: unknown[]) => emitted.updated.push(args),
      },
    });

    await svc.convert(
      "lead-mig",
      { contactMode: "create", contact: { phone: "+380501112233" }, createDeal: false },
      actor,
    );

    assert.strictEqual(rec.migrations.task?.data?.contactId, "contact-1");
    assert.strictEqual(rec.migrations.call?.data?.contactId, "contact-1");
    assert.strictEqual(rec.migrations.callQueueItem?.data?.contactId, "contact-1");
    assert.strictEqual(rec.migrations.manualCallSession?.data?.contactId, "contact-1");
    assert.strictEqual(rec.migrations.materialReservation?.data?.leadId, null);
    assert.ok(rec.leadEvent);
    assert.strictEqual(rec.leadEvent!.data.type, LeadEventType.CONVERTED);
    assert.strictEqual(emitted.updated.length, 1);
  });
});

describe("LeadsService.suggestContact", () => {
  it("matches candidates by normalized phone and additional phones", async () => {
    let capturedWhere: { AND?: Array<{ OR?: Array<Record<string, unknown>> }> } | null = null;
    const prisma = {
      lead: {
        findUnique: async () => ({
          id: "lead-1",
          ownerId: "user-1",
          phone: "+38 (050) 111-22-33",
          email: null,
        }),
      },
      contact: {
        findMany: async (args: { where: { AND?: Array<{ OR?: Array<Record<string, unknown>> }> } }) => {
          capturedWhere = args.where;
          return [];
        },
      },
    } as unknown as PrismaService;

    const svc = makeService(prisma);
    await svc.suggestContact("lead-1", actor);

    assert.ok(capturedWhere);
    const matchOr = capturedWhere!.AND?.[0]?.OR ?? [];
    assert.ok(
      matchOr.some(
        (clause) => "phoneNormalized" in clause && clause.phoneNormalized === "380501112233",
      ),
      "should search by normalized phone digits",
    );
    assert.ok(
      matchOr.some(
        (clause) =>
          "phones" in clause &&
          (clause.phones as { some?: { phoneNormalized?: string } })?.some?.phoneNormalized ===
            "380501112233",
      ),
      "should search additional phones",
    );
  });

  it("filters by companyId when provided", async () => {
    let capturedWhere: { AND?: Array<Record<string, unknown>> } | null = null;
    const prisma = {
      lead: {
        findUnique: async () => ({
          id: "lead-1",
          ownerId: "user-1",
          phone: "+380501112233",
          email: null,
        }),
      },
      contact: {
        findMany: async (args: { where: { AND?: Array<Record<string, unknown>> } }) => {
          capturedWhere = args.where;
          return [];
        },
      },
    } as unknown as PrismaService;

    const svc = makeService(prisma);
    await svc.suggestContact("lead-1", actor, { companyId: "comp-client" });

    assert.ok(capturedWhere);
    assert.ok(
      capturedWhere!.AND?.some((part) => part.companyId === "comp-client"),
      "should filter contacts by company",
    );
  });
});

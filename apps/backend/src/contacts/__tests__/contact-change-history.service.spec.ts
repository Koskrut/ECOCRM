import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { UserRole } from "@prisma/client";
import { ContactsService } from "../contacts.service";
import type { PrismaService } from "../../prisma/prisma.service";
import type { ContactAccessService } from "../contact-access.service";

describe("ContactsService change history", () => {
  it("writes CREATED history with readable owner and company values", async () => {
    const historyCreates: unknown[] = [];
    const prisma = {
      contact: {
        findUnique: async () => null,
        create: async () => ({
          id: "contact-1",
          ownerId: "mgr-1",
          companyId: "company-1",
          firstName: "Іван",
          lastName: "Петренко",
          middleName: null,
          phone: "+380501111111",
          phoneNormalized: "380501111111",
          email: "[email protected]",
          position: "Procurement",
          address: null,
          lat: null,
          lng: null,
          googlePlaceId: null,
          isPrimary: false,
          externalCode: null,
          documentDisplayName: null,
          region: null,
          addressInfo: null,
          city: "Київ",
          clientType: "Doctor",
          status: "Активний",
          marketingCallOptOut: false,
          createdAt: new Date("2026-03-24T10:00:00.000Z"),
          updatedAt: new Date("2026-03-24T10:00:00.000Z"),
          company: { id: "company-1", name: "Demo Clinic", edrpou: null, taxId: null },
          owner: { id: "mgr-1", fullName: "Manager One", email: "[email protected]" },
        }),
      },
      contactPhone: {
        findFirst: async () => null,
      },
      contactChangeHistory: {
        create: async (args: unknown) => {
          historyCreates.push(args);
          return { id: "h-1" };
        },
      },
    } as unknown as PrismaService;

    const contactAccess = {
      assertLeadCanAssignOwner: async () => undefined,
    } as unknown as ContactAccessService;

    const svc = new ContactsService(prisma, contactAccess);
    await svc.create(
      {
        companyId: "company-1",
        ownerId: "mgr-1",
        firstName: "Іван",
        lastName: "Петренко",
        phone: "+380501111111",
        email: "[email protected]",
        position: "Procurement",
        city: "Київ",
        clientType: "Doctor",
        status: "Активний",
      },
      { id: "admin-1", email: "[email protected]", fullName: "Admin", role: UserRole.ADMIN },
    );

    assert.strictEqual(historyCreates.length, 1);
    const payload = (historyCreates[0] as { data: { action: string; payload: { field: string; newValue: string | null }[] } })
      .data;
    assert.strictEqual(payload.action, "CREATED");
    assert.ok(payload.payload.some((item) => item.field === "companyId" && item.newValue === "Demo Clinic"));
    assert.ok(payload.payload.some((item) => item.field === "ownerId" && item.newValue === "Manager One"));
    assert.ok(payload.payload.some((item) => item.field === "firstName" && item.newValue === "Іван"));
  });

  it("splits sensitive owner/company updates into dedicated history events", async () => {
    const historyCreates: unknown[] = [];
    const prisma = {
      contact: {
        findUnique: async () => ({
          id: "contact-1",
          ownerId: "mgr-1",
          companyId: "company-1",
          firstName: "Іван",
          lastName: "Петренко",
          middleName: null,
          phone: "+380501111111",
          phoneNormalized: "380501111111",
          email: "[email protected]",
          position: "Procurement",
          address: null,
          lat: null,
          lng: null,
          googlePlaceId: null,
          isPrimary: false,
          externalCode: null,
          documentDisplayName: null,
          region: null,
          addressInfo: null,
          city: "Київ",
          clientType: null,
          status: "Активний",
          marketingCallOptOut: false,
          createdAt: new Date("2026-03-24T10:00:00.000Z"),
          updatedAt: new Date("2026-03-24T10:00:00.000Z"),
          company: { id: "company-1", name: "Demo Clinic", edrpou: null, taxId: null },
          owner: { id: "mgr-1", fullName: "Manager One", email: "[email protected]" },
        }),
        update: async () => ({
          id: "contact-1",
          ownerId: "mgr-2",
          companyId: "company-2",
          firstName: "Іван",
          lastName: "Петренко",
          middleName: null,
          phone: "+380501111111",
          phoneNormalized: "380501111111",
          email: "[email protected]",
          position: "Head of Procurement",
          address: null,
          lat: null,
          lng: null,
          googlePlaceId: null,
          isPrimary: false,
          externalCode: null,
          documentDisplayName: null,
          region: null,
          addressInfo: null,
          city: "Львів",
          clientType: null,
          status: "Активний",
          marketingCallOptOut: false,
          createdAt: new Date("2026-03-24T10:00:00.000Z"),
          updatedAt: new Date("2026-03-24T11:00:00.000Z"),
          company: { id: "company-2", name: "North Clinic", edrpou: null, taxId: null },
          owner: { id: "mgr-2", fullName: "Manager Two", email: "[email protected]" },
        }),
      },
      contactChangeHistory: {
        create: async (args: unknown) => {
          historyCreates.push(args);
          return { id: "h-2" };
        },
      },
    } as unknown as PrismaService;

    const contactAccess = {
      assertCanViewContact: async () => undefined,
      assertLeadCanAssignOwner: async () => undefined,
    } as unknown as ContactAccessService;

    const svc = new ContactsService(prisma, contactAccess);
    await svc.update(
      "contact-1",
      {
        ownerId: "mgr-2",
        companyId: "company-2",
        position: "Head of Procurement",
        city: "Львів",
      },
      { id: "lead-1", email: "[email protected]", fullName: "Lead", role: UserRole.LEAD },
    );

    assert.strictEqual(historyCreates.length, 3);
    const payload = (historyCreates[0] as {
      data: { action: string; payload: { field: string; oldValue: string | null; newValue: string | null }[] };
    }).data;
    assert.strictEqual(payload.action, "UPDATED");
    assert.deepStrictEqual(payload.payload, [
      { field: "position", oldValue: "Procurement", newValue: "Head of Procurement" },
      { field: "city", oldValue: "Київ", newValue: "Львів" },
    ]);

    const ownerEvent = (historyCreates[1] as {
      data: { action: string; payload: { field: string; oldValue: string | null; newValue: string | null }[] };
    }).data;
    assert.strictEqual(ownerEvent.action, "OWNER_CHANGED");
    assert.deepStrictEqual(ownerEvent.payload, [
      { field: "ownerId", oldValue: "Manager One", newValue: "Manager Two" },
    ]);

    const companyEvent = (historyCreates[2] as {
      data: { action: string; payload: { field: string; oldValue: string | null; newValue: string | null }[] };
    }).data;
    assert.strictEqual(companyEvent.action, "COMPANY_RELINKED");
    assert.deepStrictEqual(companyEvent.payload, [
      { field: "companyId", oldValue: "Demo Clinic", newValue: "North Clinic" },
    ]);
  });

  it("writes reset password audit without exposing secrets", async () => {
    const historyCreates: unknown[] = [];
    const prisma = {
      contact: {
        findUnique: async () => ({ id: "contact-1", ownerId: "mgr-1" }),
      },
      customer: {
        findUnique: async () => ({ id: "customer-1", contactId: "contact-1" }),
        update: async () => ({ id: "customer-1" }),
      },
      contactChangeHistory: {
        create: async (args: unknown) => {
          historyCreates.push(args);
          return { id: "h-reset" };
        },
      },
    } as unknown as PrismaService;

    const contactAccess = {
      assertCanViewContact: async () => undefined,
    } as unknown as ContactAccessService;

    process.env.JWT_SECRET = "test-secret";
    const svc = new ContactsService(prisma, contactAccess);
    const out = await svc.resetStorePassword("contact-1", {
      id: "admin-1",
      email: "[email protected]",
      fullName: "Admin",
      role: UserRole.ADMIN,
    });

    assert.match(out.tempPassword, /^\d{6}$/);
    assert.ok(out.setPasswordToken.length > 10);
    assert.strictEqual(historyCreates.length, 1);
    const payload = (historyCreates[0] as {
      data: { action: string; payload: { field: string; oldValue: string | null; newValue: string | null }[] };
    }).data;
    assert.strictEqual(payload.action, "RESET_STORE_PASSWORD");
    assert.deepStrictEqual(payload.payload, [
      { field: "storePasswordReset", oldValue: null, newValue: "issued" },
    ]);
  });

  it("audits default delivery profile changes", async () => {
    const historyCreates: unknown[] = [];
    const prisma = {
      contact: {
        findUnique: async () => ({ id: "contact-1", ownerId: "mgr-1" }),
      },
      contactShippingProfile: {
        findFirst: async (args?: { where?: { id?: string; isDefault?: boolean; contactId?: string } }) => {
          if (args?.where?.id === "profile-1") {
            return { id: "profile-1", contactId: "contact-1", label: "Old profile", isDefault: false };
          }
          if (args?.where?.isDefault) {
            return { id: "profile-0", contactId: "contact-1", label: "Current default", isDefault: true };
          }
          return null;
        },
        updateMany: async () => ({ count: 1 }),
        update: async () => ({ id: "profile-1", label: "New default", isDefault: true }),
        create: async () => ({ id: "profile-2", label: "Created default", isDefault: true }),
        delete: async () => ({ id: "profile-1" }),
      },
      $transaction: async (cb: (tx: PrismaService) => unknown) => cb(prisma as unknown as PrismaService),
      contactChangeHistory: {
        create: async (args: unknown) => {
          historyCreates.push(args);
          return { id: "h-delivery" };
        },
      },
    } as unknown as PrismaService;

    const contactAccess = {
      assertCanViewContact: async () => undefined,
    } as unknown as ContactAccessService;

    const svc = new ContactsService(prisma, contactAccess);
    await svc.updateShippingProfile(
      "contact-1",
      "profile-1",
      { label: "New default", isDefault: true },
      { id: "lead-1", email: "[email protected]", fullName: "Lead", role: UserRole.LEAD },
    );

    assert.strictEqual(historyCreates.length, 1);
    const payload = (historyCreates[0] as {
      data: { action: string; payload: { field: string; oldValue: string | null; newValue: string | null }[] };
    }).data;
    assert.strictEqual(payload.action, "DELIVERY_DEFAULT_CHANGED");
    assert.deepStrictEqual(payload.payload, [
      { field: "deliveryDefault", oldValue: "Current default", newValue: "New default" },
    ]);
  });

  it("returns change history with actor metadata", async () => {
    const prisma = {
      contact: {
        findUnique: async () => ({ id: "contact-1", ownerId: "mgr-1" }),
      },
      contactChangeHistory: {
        findMany: async () => [
          {
            id: "h-1",
            contactId: "contact-1",
            changedBy: "admin-1",
            action: "UPDATED",
            payload: [{ field: "status", oldValue: "Новий", newValue: "Активний" }],
            createdAt: new Date("2026-03-24T12:00:00.000Z"),
          },
        ],
      },
      user: {
        findMany: async () => [
          { id: "admin-1", fullName: "Admin User", email: "[email protected]" },
        ],
      },
    } as unknown as PrismaService;

    const contactAccess = {
      assertCanViewContact: async () => undefined,
    } as unknown as ContactAccessService;

    const svc = new ContactsService(prisma, contactAccess);
    const out = await svc.getChangeHistory("contact-1", {
      id: "mgr-1",
      email: "[email protected]",
      fullName: "Manager",
      role: UserRole.MANAGER,
    });

    assert.strictEqual(out.length, 1);
    assert.deepStrictEqual(out[0], {
      id: "h-1",
      contactId: "contact-1",
      changedBy: "admin-1",
      changedByUser: {
        id: "admin-1",
        fullName: "Admin User",
        email: "[email protected]",
      },
      action: "UPDATED",
      payload: [{ field: "status", oldValue: "Новий", newValue: "Активний" }],
      createdAt: "2026-03-24T12:00:00.000Z",
    });
  });
});

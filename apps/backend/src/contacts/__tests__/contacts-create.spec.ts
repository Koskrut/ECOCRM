import test from "node:test";
import assert from "node:assert/strict";
import { BadRequestException } from "@nestjs/common";
import { UserRole } from "@prisma/client";
import { ContactsService } from "../contacts.service";
import { validateCreateCompanyDto } from "../../companies/dto/create-company.dto";
import { validateCreateContactDto } from "../dto/create-contact.dto";

type AnyFn = (...args: any[]) => any;

function mockFn(impl?: AnyFn) {
  const fn = ((...args: any[]) => {
    fn.calls.push(args);
    if (impl) return impl(...args);
    return undefined;
  }) as AnyFn & { calls: any[][] };
  fn.calls = [];
  return fn;
}

function createContactsService() {
  const createdPayloads: any[] = [];
  const prisma = {
    contact: {
      findUnique: mockFn(async () => null),
      create: mockFn(async (args: any) => {
        createdPayloads.push(args.data);
        return {
          id: "contact-1",
          ...args.data,
          createdAt: new Date("2026-08-05T10:00:00.000Z"),
          updatedAt: new Date("2026-08-05T10:00:00.000Z"),
          company: null,
          owner: { id: "mgr-1", fullName: "Manager", email: "m@test.local" },
        };
      }),
    },
    contactPhone: {
      findFirst: mockFn(async () => null),
    },
  };
  const workflowEmitter = {
    emitRecordCreated: mockFn(),
  };
  const service = new ContactsService(prisma as any, workflowEmitter as any);
  return { service, createdPayloads };
}

test("validateCreateContactDto: region is required", () => {
  const errors = validateCreateContactDto({
    firstName: "Ivan",
    lastName: "Petrov",
    phone: "+380501112233",
    region: "",
  });
  assert.ok(errors.some((e) => e.field === "region"));
});

test("validateCreateContactDto: valid payload passes", () => {
  const errors = validateCreateContactDto({
    firstName: "Ivan",
    lastName: "Petrov",
    phone: "+380501112233",
    region: "Київська",
  });
  assert.equal(errors.length, 0);
});

test("contacts.create: rejects missing region", async () => {
  const { service } = createContactsService();
  await assert.rejects(
    () =>
      service.create(
        {
          firstName: "Ivan",
          lastName: "Petrov",
          phone: "+380501112233",
        },
        { id: "mgr-1", role: UserRole.MANAGER, email: "m@test.local", fullName: "Manager" },
      ),
    (err: unknown) => {
      assert.ok(err instanceof BadRequestException);
      assert.match(String(err.message), /region required/i);
      return true;
    },
  );
});

test("contacts.create: succeeds with region (mobile payload shape)", async () => {
  const { service, createdPayloads } = createContactsService();
  const result = await service.create(
    {
      firstName: "Ivan",
      lastName: "Petrov",
      phone: "+380501112233",
      region: "Київська",
      email: null,
      city: "Київ",
      address: "вул. Хрещатик, 1",
      companyId: null,
    },
    { id: "mgr-1", role: UserRole.MANAGER, email: "m@test.local", fullName: "Manager" },
  );

  assert.equal(result.id, "contact-1");
  assert.equal(createdPayloads[0]?.region, "Київська");
  assert.equal(createdPayloads[0]?.city, "Київ");
});

test("validateCreateCompanyDto: name, phone and region are required", () => {
  const missingPhone = validateCreateCompanyDto({
    name: "ТОВ Тест",
    region: "Київська",
  });
  assert.ok(missingPhone.some((e) => e.field === "phone"));

  const missingRegion = validateCreateCompanyDto({
    name: "ТОВ Тест",
    phone: "+380501112233",
  });
  assert.ok(missingRegion.some((e) => e.field === "region"));

  const valid = validateCreateCompanyDto({
    name: "ТОВ Тест",
    phone: "+380501112233",
    region: "Київська",
  });
  assert.equal(valid.length, 0);
});

test("validateCreateCompanyDto: empty name fails", () => {
  const errors = validateCreateCompanyDto({
    name: "",
    phone: "+380501112233",
    region: "Київська",
  });
  assert.ok(errors.some((e) => e.field === "name"));
});

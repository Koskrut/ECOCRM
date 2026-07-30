import assert from "node:assert/strict";
import { afterEach, describe, it } from "node:test";
import { BadRequestException } from "@nestjs/common";
import type { PrismaService } from "../../prisma/prisma.service";
import { StoreLeadsService } from "../store-leads.service";
import type { CreateStoreLeadDto } from "../dto/create-store-lead.dto";

const PREV_STORE_COMPANY = process.env.STORE_LEAD_COMPANY_ID;
const PREV_META_COMPANY = process.env.META_LEAD_COMPANY_ID;

afterEach(() => {
  if (PREV_STORE_COMPANY === undefined) delete process.env.STORE_LEAD_COMPANY_ID;
  else process.env.STORE_LEAD_COMPANY_ID = PREV_STORE_COMPANY;
  if (PREV_META_COMPANY === undefined) delete process.env.META_LEAD_COMPANY_ID;
  else process.env.META_LEAD_COMPANY_ID = PREV_META_COMPANY;
});

function makeService() {
  process.env.STORE_LEAD_COMPANY_ID = "company-store-1";
  const created: { data?: Record<string, unknown> } = {};
  const prisma = {
    company: { findFirst: async () => ({ id: "company-fallback" }) },
    lead: {
      create: async ({ data }: { data: Record<string, unknown> }) => {
        created.data = data;
        return { id: "lead-1", createdAt: new Date("2026-07-29T00:00:00.000Z") };
      },
    },
    leadEvent: { create: async () => ({}) },
  } as unknown as PrismaService;
  return { service: new StoreLeadsService(prisma), created };
}

function dto(overrides: Partial<CreateStoreLeadDto> = {}): CreateStoreLeadDto {
  return {
    name: "Ігор",
    phone: "+380501234567",
    formType: "short_lead",
    consent: true,
    ...overrides,
  } as CreateStoreLeadDto;
}

describe("StoreLeadsService.createLead phone required", () => {
  it("rejects email-only lead (no phone)", async () => {
    const { service } = makeService();
    await assert.rejects(
      () => service.createLead(dto({ phone: undefined as unknown as string, email: "malyarchykigor@gmail.com" })),
      (err: unknown) =>
        err instanceof BadRequestException && String(err.message).includes("Вкажіть телефон"),
    );
  });

  it("rejects empty phone", async () => {
    const { service } = makeService();
    await assert.rejects(
      () => service.createLead(dto({ phone: "   ", email: "a@b.com" })),
      (err: unknown) =>
        err instanceof BadRequestException && String(err.message).includes("Вкажіть телефон"),
    );
  });

  it("rejects invalid phone even with email", async () => {
    const { service } = makeService();
    await assert.rejects(
      () => service.createLead(dto({ phone: "123", email: "a@b.com" })),
      (err: unknown) =>
        err instanceof BadRequestException && String(err.message).includes("Вкажіть телефон"),
    );
  });

  it("accepts phone without email and normalizes to E.164", async () => {
    const { service, created } = makeService();
    const result = await service.createLead(dto({ phone: "050 123 45 67", email: undefined }));
    assert.equal(result.ok, true);
    assert.equal(result.leadId, "lead-1");
    assert.equal(created.data?.phone, "+380501234567");
    assert.equal(created.data?.phoneNormalized, "380501234567");
    assert.equal(created.data?.email, null);
  });
});

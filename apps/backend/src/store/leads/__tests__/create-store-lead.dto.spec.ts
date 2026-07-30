import assert from "node:assert/strict";
import test from "node:test";
import { plainToInstance } from "class-transformer";
import { validateSync } from "class-validator";
import { CreateStoreLeadDto } from "../dto/create-store-lead.dto";

function basePayload(overrides: Record<string, unknown> = {}) {
  return {
    name: "Ігор",
    phone: "+380501234567",
    formType: "short_lead",
    consent: true,
    ...overrides,
  };
}

test("CreateStoreLeadDto: accepts phone without email", () => {
  const dto = plainToInstance(CreateStoreLeadDto, basePayload({ email: undefined }));
  const errors = validateSync(dto, { forbidUnknownValues: false });
  assert.equal(errors.length, 0);
});

test("CreateStoreLeadDto: rejects missing phone even with email", () => {
  const dto = plainToInstance(
    CreateStoreLeadDto,
    basePayload({ phone: undefined, email: "malyarchykigor@gmail.com" }),
  );
  const errors = validateSync(dto, { forbidUnknownValues: false });
  assert.ok(errors.some((e) => e.property === "phone"));
});

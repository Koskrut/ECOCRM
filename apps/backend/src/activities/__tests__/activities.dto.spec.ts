import assert from "node:assert/strict";
import test from "node:test";
import { plainToInstance } from "class-transformer";
import { validateSync } from "class-validator";
import { ActivityType } from "@prisma/client";
import { CreateActivityDto } from "../dto/create-activity.dto";
import { UpdateActivityDto } from "../dto/update-activity.dto";

test("CreateActivityDto: rejects empty body", () => {
  const dto = plainToInstance(CreateActivityDto, {
    type: ActivityType.COMMENT,
    body: "   ",
  });
  const errors = validateSync(dto, { forbidUnknownValues: false });
  assert.ok(errors.length > 0);
});

test("CreateActivityDto: accepts valid payload", () => {
  const dto = plainToInstance(CreateActivityDto, {
    type: ActivityType.COMMENT,
    body: "hello",
    occurredAt: "2024-01-15T10:00:00.000Z",
  });
  const errors = validateSync(dto, { forbidUnknownValues: false });
  assert.equal(errors.length, 0);
});

test("UpdateActivityDto: allows pinnedAt null", () => {
  const dto = plainToInstance(UpdateActivityDto, { pinnedAt: null });
  const errors = validateSync(dto, { forbidUnknownValues: false });
  assert.equal(errors.length, 0);
});

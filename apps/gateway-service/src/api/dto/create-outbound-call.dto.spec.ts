import "reflect-metadata";
import { describe, it } from "node:test";
import assert from "node:assert";
import { plainToInstance } from "class-transformer";
import { validate } from "class-validator";
import { CreateOutboundCallDto } from "./create-outbound-call.dto";

describe("CreateOutboundCallDto validation", () => {
  it("accepts minimal valid CRM-shaped body", async () => {
    const dto = plainToInstance(CreateOutboundCallDto, {
      attemptId: "a",
      campaignId: "c",
      scenarioCode: "S",
      scenarioVersion: "1",
      scenarioKey: "S@1",
      phone: "+380501112233",
      context: {},
      crmContext: {},
      callback: {
        webhookUrl: "https://x/w",
        webhookSecretHeader: "x-outbound-voice-secret",
      },
    });
    const errs = await validate(dto);
    assert.strictEqual(errs.length, 0);
  });

  it("rejects missing phone", async () => {
    const dto = plainToInstance(CreateOutboundCallDto, {
      attemptId: "a",
      campaignId: "c",
      scenarioCode: "S",
      scenarioVersion: "1",
      scenarioKey: "S@1",
      context: {},
      crmContext: {},
    });
    const errs = await validate(dto);
    assert.ok(errs.length > 0);
  });
});

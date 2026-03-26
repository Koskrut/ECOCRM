import { describe, it } from "node:test";
import assert from "node:assert";
import {
  digitsOnly,
  normalizeCreateOutboundCallDto,
  normalizePhoneE164Safety,
} from "./normalize-create-outbound-call";
import type { CreateOutboundCallDto } from "./dto/create-outbound-call.dto";

describe("normalizeCreateOutboundCallDto", () => {
  it("trims strings and empty optional ids to null", () => {
    const raw = {
      attemptId: "  a1  ",
      campaignId: "c1",
      scenarioCode: "S",
      scenarioVersion: "1",
      scenarioKey: "S@1",
      phone: "  +380 50 111 2233  ",
      phoneNormalized: "   ",
      leadId: "",
      contactId: null,
      companyId: "  ",
      context: {},
      crmContext: {},
      callback: {
        webhookUrl: " https://x/w ",
        webhookSecretHeader: " x-outbound-voice-secret ",
        publicBaseUrl: "",
      },
    } as CreateOutboundCallDto;
    const n = normalizeCreateOutboundCallDto(raw);
    assert.strictEqual(n.attemptId, "a1");
    assert.strictEqual(n.phone, "+380501112233");
    assert.strictEqual(n.phoneNormalized, "380501112233");
    assert.strictEqual(n.leadId, null);
    assert.strictEqual(n.companyId, null);
    assert.strictEqual(n.callback?.webhookUrl, "https://x/w");
  });

  it("normalizePhoneE164Safety strips spaces", () => {
    assert.strictEqual(normalizePhoneE164Safety("+1 234 567 8901"), "+12345678901");
  });

  it("digitsOnly returns digits only", () => {
    assert.strictEqual(digitsOnly("+1-abc"), "1");
  });
});

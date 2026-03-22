import { describe, it, afterEach } from "node:test";
import assert from "node:assert";
import { HttpOutboundVoiceAdapter } from "../http-outbound-voice.adapter";
import type { SettingsService } from "../../../settings/settings.service";

describe("HttpOutboundVoiceAdapter", () => {
  const originalFetch = globalThis.fetch;

  afterEach(() => {
    globalThis.fetch = originalFetch;
  });

  it("POSTs JSON and reads provider session id from configured response key", async () => {
    let capturedUrl = "";
    let capturedInit: RequestInit | undefined;

    globalThis.fetch = async (url: RequestInfo | URL, init?: RequestInit) => {
      capturedUrl = String(url);
      capturedInit = init;
      return new Response(JSON.stringify({ session_id: "abc-123" }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      });
    };

    const settings = {
      getOutboundVoiceRuntimeSecrets: async () => ({
        apiBaseUrl: "https://voice.example/api/",
        apiToken: "secret-token",
        createCallPath: "/calls",
        responseSessionIdKeys: ["session_id"],
      }),
    } as unknown as SettingsService;

    const adapter = new HttpOutboundVoiceAdapter(settings);
    const result = await adapter.initiateOutboundCall(
      {
        id: "att-1",
        phoneNormalized: "380501234567",
        scenarioCode: "LEAD_QUALIFICATION",
        scenarioVersion: "1",
        campaign: {} as never,
      } as never,
      { foo: "bar" },
    );

    assert.strictEqual(capturedUrl, "https://voice.example/api/calls");
    assert.ok(capturedInit?.method === "POST");
    const hdrs = capturedInit?.headers as Record<string, string>;
    assert.strictEqual(hdrs.Authorization, "Bearer secret-token");
    const body = JSON.parse((capturedInit?.body as string) ?? "{}");
    assert.strictEqual(body.attemptId, "att-1");
    assert.strictEqual(body.phone, "+380501234567");
    assert.strictEqual(result.provider, "HTTP_OUTBOUND_VOICE");
    assert.strictEqual(result.providerSessionId, "abc-123");
  });
});

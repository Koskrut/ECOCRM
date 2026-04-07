import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { fetchRingostatCallsList } from "../ringostat-calls-list";

describe("ringostat-calls-list", () => {
  it("uses expanded fields when API accepts them", async () => {
    const originalFetch = globalThis.fetch;
    let requestedUrl = "";
    globalThis.fetch = (async (input: string | URL) => {
      requestedUrl = String(input);
      return {
        ok: true,
        status: 200,
        text: async () => "[]",
      } as Response;
    }) as typeof fetch;

    try {
      const res = await fetchRingostatCallsList(
        { apiToken: "token", apiBaseUrl: "https://api.ringostat.net" },
        new Date("2026-04-01T00:00:00.000Z"),
        new Date("2026-04-01T01:00:00.000Z"),
      );
      assert.equal(res.ok, true);
      if (!res.ok) return;
      assert.equal(res.fieldsMode, "expanded");
      assert.match(requestedUrl, /fields=.*uniqueid/);
      assert.match(requestedUrl, /fields=.*recording_wav/);
      assert.match(requestedUrl, /fields=.*call_type/);
    } finally {
      globalThis.fetch = originalFetch;
    }
  });

  it("falls back to minimal fields on 400", async () => {
    const originalFetch = globalThis.fetch;
    const requestedUrls: string[] = [];
    let call = 0;
    globalThis.fetch = (async (input: string | URL) => {
      call += 1;
      requestedUrls.push(String(input));
      if (call === 1) {
        return {
          ok: false,
          status: 400,
          text: async () => "bad fields",
        } as Response;
      }
      return {
        ok: true,
        status: 200,
        text: async () => "[]",
      } as Response;
    }) as typeof fetch;

    try {
      const res = await fetchRingostatCallsList(
        { apiToken: "token", apiBaseUrl: "https://api.ringostat.net" },
        new Date("2026-04-01T00:00:00.000Z"),
        new Date("2026-04-01T01:00:00.000Z"),
      );
      assert.equal(call, 2);
      assert.equal(res.ok, true);
      if (!res.ok) return;
      assert.equal(res.fieldsMode, "fallback");
      assert.match(requestedUrls[0] ?? "", /fields=.*uniqueid/);
      assert.equal((requestedUrls[1] ?? "").includes("uniqueid"), false);
      assert.match(requestedUrls[1] ?? "", /fields=.*calldate/);
    } finally {
      globalThis.fetch = originalFetch;
    }
  });

  it("falls back to minimal fields on 200 non-JSON body", async () => {
    const originalFetch = globalThis.fetch;
    const requestedUrls: string[] = [];
    let call = 0;
    globalThis.fetch = (async (input: string | URL) => {
      call += 1;
      requestedUrls.push(String(input));
      if (call === 1) {
        return {
          ok: true,
          status: 200,
          text: async () => "<html><body>Error: bad fields</body></html>",
        } as Response;
      }
      return {
        ok: true,
        status: 200,
        text: async () => "[]",
      } as Response;
    }) as typeof fetch;

    try {
      const res = await fetchRingostatCallsList(
        { apiToken: "token", apiBaseUrl: "https://api.ringostat.net" },
        new Date("2026-04-01T00:00:00.000Z"),
        new Date("2026-04-01T01:00:00.000Z"),
      );
      assert.equal(call, 2);
      assert.equal(res.ok, true);
      if (!res.ok) return;
      assert.equal(res.fieldsMode, "fallback");
      assert.match(requestedUrls[0] ?? "", /fields=.*uniqueid/);
      assert.equal((requestedUrls[1] ?? "").includes("uniqueid"), false);
    } finally {
      globalThis.fetch = originalFetch;
    }
  });
});


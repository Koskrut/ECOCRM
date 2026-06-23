import assert from "node:assert/strict";
import { afterEach, describe, it } from "node:test";
import { SystemUpdateService } from "../system-update.service";

const envKeys = [
  "UPDATER_AGENT_URL",
  "UPDATER_AGENT_TOKEN",
  "CONTROL_PLANE_UPDATE_STATUS_URL",
  "CONTROL_PLANE_URL",
  "CONTROL_PLANE_TOKEN",
  "CONTROL_PLANE_INSTALLATION_TOKEN",
  "CONTROL_PLANE_INSTALLATION_ID",
  "CRM_RELEASE_VERSION",
  "AUTO_UPDATE_ENABLED",
] as const;

describe("SystemUpdateService auto-update", () => {
  const prev: Partial<Record<(typeof envKeys)[number], string | undefined>> = {};
  const prevFetch = global.fetch;

  afterEach(() => {
    for (const k of envKeys) {
      const p = prev[k];
      if (p === undefined) delete process.env[k];
      else process.env[k] = p;
    }
    global.fetch = prevFetch;
  });

  it("tryAutoApply returns null when auto-update is disabled", async () => {
    for (const k of envKeys) prev[k] = process.env[k];
    delete process.env.AUTO_UPDATE_ENABLED;
    const svc = new SystemUpdateService();
    const job = await svc.tryAutoApply();
    assert.equal(job, null);
  });

  it("tryAutoApply starts update when CP target differs and preflight passes", async () => {
    for (const k of envKeys) prev[k] = process.env[k];
    process.env.AUTO_UPDATE_ENABLED = "true";
    process.env.UPDATER_AGENT_URL = "http://updater.local";
    process.env.CONTROL_PLANE_UPDATE_STATUS_URL = "http://cp.local/status";
    process.env.CRM_RELEASE_VERSION = "0.1.19";

    global.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      if (url.includes("cp.local")) {
        return new Response(JSON.stringify({ latestVersion: "0.1.20", targetVersion: "0.1.20" }), { status: 200 });
      }
      if (url.includes("/status")) {
        return new Response(JSON.stringify({ ok: true, activeJobId: null }), { status: 200 });
      }
      if (url.includes("/preflight") && init?.method === "POST") {
        return new Response(JSON.stringify({ ok: true, message: "Preflight passed." }), { status: 200 });
      }
      if (url.includes("/apply") && init?.method === "POST") {
        return new Response(JSON.stringify({ id: "upd-auto", status: "queued", message: "Update queued" }), {
          status: 202,
        });
      }
      return new Response("not-found", { status: 404 });
    }) as typeof fetch;

    const svc = new SystemUpdateService();
    const job = await svc.tryAutoApply();
    assert.ok(job);
    assert.equal(job?.toVersion, "0.1.20");
    assert.equal(job?.requestedBy, "auto-update");
  });
});

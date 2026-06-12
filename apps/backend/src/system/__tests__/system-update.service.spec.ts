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
] as const;

describe("SystemUpdateService", () => {
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

  it("returns operator_only when updater is not configured", async () => {
    for (const k of envKeys) prev[k] = process.env[k];
    delete process.env.UPDATER_AGENT_URL;
    const svc = new SystemUpdateService();
    const status = await svc.getStatus();
    assert.equal(status.mode, "operator_only");
    assert.equal(status.canUpdate, false);
  });

  it("reports update_available when CP target differs and agent is reachable", async () => {
    for (const k of envKeys) prev[k] = process.env[k];
    process.env.UPDATER_AGENT_URL = "http://updater.local";
    process.env.CONTROL_PLANE_UPDATE_STATUS_URL = "http://cp.local/status";
    process.env.CRM_RELEASE_VERSION = "0.1.19";

    global.fetch = (async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url.includes("cp.local")) {
        return new Response(JSON.stringify({ latestVersion: "0.1.20", targetVersion: "0.1.20" }), { status: 200 });
      }
      if (url.includes("/status")) {
        return new Response(JSON.stringify({ ok: true, activeJobId: null }), { status: 200 });
      }
      return new Response("not-found", { status: 404 });
    }) as typeof fetch;

    const svc = new SystemUpdateService();
    const status = await svc.getStatus();
    assert.equal(status.mode, "agent_available");
    assert.equal(status.state, "update_available");
    assert.equal(status.canUpdate, true);
    assert.equal(status.targetVersion, "0.1.20");
  });

  it("syncs activeJobId from updater agent status", async () => {
    for (const k of envKeys) prev[k] = process.env[k];
    process.env.UPDATER_AGENT_URL = "http://updater.local";
    process.env.CONTROL_PLANE_UPDATE_STATUS_URL = "http://cp.local/status";
    process.env.CRM_RELEASE_VERSION = "0.1.19";

    global.fetch = (async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url.includes("cp.local")) {
        return new Response(JSON.stringify({ latestVersion: "0.1.20", targetVersion: "0.1.20" }), { status: 200 });
      }
      if (url.includes("/status")) {
        return new Response(JSON.stringify({ ok: true, activeJobId: "upd-123" }), { status: 200 });
      }
      return new Response("not-found", { status: 404 });
    }) as typeof fetch;

    const svc = new SystemUpdateService();
    const status = await svc.getStatus();
    assert.equal(status.activeJobId, "upd-123");
    assert.equal(status.state, "updating");
    assert.equal(status.canUpdate, false);
  });

  it("reports updating when agent has active job even if CP is offline", async () => {
    for (const k of envKeys) prev[k] = process.env[k];
    process.env.UPDATER_AGENT_URL = "http://updater.local";
    process.env.CONTROL_PLANE_UPDATE_STATUS_URL = "http://cp.local/status";
    process.env.CRM_RELEASE_VERSION = "0.1.19";

    global.fetch = (async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url.includes("cp.local")) {
        return new Response("offline", { status: 503 });
      }
      if (url.includes("/status")) {
        return new Response(JSON.stringify({ ok: true, activeJobId: "upd-456" }), { status: 200 });
      }
      return new Response("not-found", { status: 404 });
    }) as typeof fetch;

    const svc = new SystemUpdateService();
    const status = await svc.getStatus();
    assert.equal(status.activeJobId, "upd-456");
    assert.equal(status.state, "updating");
    assert.equal(status.cpReachable, false);
  });
});

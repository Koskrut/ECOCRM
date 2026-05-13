import assert from "node:assert/strict";
import { afterEach, describe, it } from "node:test";
import { SystemReleaseService } from "../system-release.service";

describe("SystemReleaseService", () => {
  const keys = ["CRM_RELEASE_VERSION", "GIT_SHA", "BUILD_TIME", "IMAGE_TAG", "UPDATER_AGENT_URL"] as const;
  const prev: Partial<Record<(typeof keys)[number], string | undefined>> = {};

  afterEach(() => {
    for (const k of keys) {
      const p = prev[k];
      if (p === undefined) delete process.env[k];
      else process.env[k] = p;
    }
  });

  it("maps env to release DTO", () => {
    for (const k of keys) prev[k] = process.env[k];
    process.env.CRM_RELEASE_VERSION = " 1.2.3 ";
    process.env.GIT_SHA = "abc1234";
    process.env.BUILD_TIME = "2026-04-10T12:00:00Z";
    process.env.IMAGE_TAG = "crm-backend:1.2.3";

    const svc = new SystemReleaseService();
    const r = svc.getRelease();

    assert.equal(r.version, "1.2.3");
    assert.equal(r.gitSha, "abc1234");
    assert.equal(r.builtAt, "2026-04-10T12:00:00Z");
    assert.equal(r.imageTag, "crm-backend:1.2.3");
    assert.equal(r.update.mode, "operator_only");
    assert.equal(r.update.state, "idle");
    assert.equal(r.update.canUpdate, false);
    assert.match(r.update.reason, /operator/);
    assert.match(r.update.message, /manually/);
  });

  it("returns nulls for missing or blank env without throwing", () => {
    for (const k of keys) {
      prev[k] = process.env[k];
      delete process.env[k];
    }

    const svc = new SystemReleaseService();
    const r = svc.getRelease();

    assert.equal(r.version, null);
    assert.equal(r.gitSha, null);
    assert.equal(r.builtAt, null);
    assert.equal(r.imageTag, null);
    assert.equal(r.update.mode, "operator_only");
  });

  it("treats whitespace-only env as null", () => {
    for (const k of keys) prev[k] = process.env[k];
    process.env.CRM_RELEASE_VERSION = "   ";

    const svc = new SystemReleaseService();
    const r = svc.getRelease();

    assert.equal(r.version, null);
  });

  it("marks update mode as agent_available when updater is configured", () => {
    for (const k of keys) prev[k] = process.env[k];
    process.env.UPDATER_AGENT_URL = "http://127.0.0.1:7788";

    const svc = new SystemReleaseService();
    const r = svc.getRelease();

    assert.equal(r.update.mode, "agent_available");
    assert.match(r.update.message, /updater agent/i);
  });
});

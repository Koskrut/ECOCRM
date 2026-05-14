import test from "node:test";
import assert from "node:assert/strict";
import * as fs from "node:fs";
import * as path from "path";
import { WORKER_VARIANT_INSTALLED } from "../module-state.service";
import { MODULE_UPSTREAM_ENV } from "../module-health.service";
import {
  MODULE_UPSTREAM_REGEX_MOUNTS,
  MODULE_UPSTREAM_STATIC_MOUNTS,
} from "../../proxy/module-upstream-proxy.setup";
import { BitrixWebhookModule } from "../../integrations/bitrix-webhook/bitrix-webhook.module";
import { BitrixSyncModule } from "../../integrations/bitrix-sync/bitrix.module";

const backendRoot = path.resolve(__dirname, "../../..");
const dockerfilePath = path.join(backendRoot, "Dockerfile");

/** Every `BACKEND_VARIANT` worker must have a `src/*-main.ts` and a matching Dockerfile stage. */
const WORKER_EXPECT: Record<string, { mainFile: string; dockerStage: string }> = {
  outbound_worker: { mainFile: "outbound-main.ts", dockerStage: "outbound-runner" },
  finance_worker: { mainFile: "finance-main.ts", dockerStage: "finance-runner" },
  planning_worker: { mainFile: "planning-main.ts", dockerStage: "planning-runner" },
  np_worker: { mainFile: "np-main.ts", dockerStage: "np-runner" },
  google_sheet_worker: { mainFile: "google-sheet-main.ts", dockerStage: "google-sheet-runner" },
  bitrix_worker: { mainFile: "bitrix-main.ts", dockerStage: "bitrix-runner" },
  ringostat_worker: { mainFile: "ringostat-main.ts", dockerStage: "ringostat-runner" },
};

test("WORKER_VARIANT_INSTALLED ↔ *-main.ts ↔ Dockerfile stages", () => {
  const variants = Object.keys(WORKER_VARIANT_INSTALLED).sort();
  const expectedKeys = Object.keys(WORKER_EXPECT).sort();
  assert.deepEqual(variants, expectedKeys, "Add new worker variant to WORKER_EXPECT in this spec");

  const dockerfile = fs.readFileSync(dockerfilePath, "utf8");
  const srcRoot = path.join(backendRoot, "src");

  for (const [variant, expect] of Object.entries(WORKER_EXPECT)) {
    assert.ok(
      WORKER_VARIANT_INSTALLED[variant]?.length,
      `WORKER_VARIANT_INSTALLED[${variant}] must be non-empty`,
    );
    const mainPath = path.join(srcRoot, expect.mainFile);
    assert.ok(fs.existsSync(mainPath), `Missing entrypoint ${expect.mainFile} for ${variant}`);

    assert.match(dockerfile, new RegExp(`AS ${expect.dockerStage}\\b`), `Dockerfile missing stage ${expect.dockerStage}`);
    const base = expect.mainFile.replace(/\.ts$/, "");
    assert.match(dockerfile, new RegExp(`dist/${base}\\.js`), `Dockerfile must reference dist/${base}.js for ${variant}`);
  }
});

test("MODULE_UPSTREAM_ENV keys are covered by module upstream proxy (or absent)", () => {
  const proxied = new Set<string>();
  for (const m of MODULE_UPSTREAM_STATIC_MOUNTS) proxied.add(m.envVar);
  for (const m of MODULE_UPSTREAM_REGEX_MOUNTS) proxied.add(m.envVar);

  const upstreamEntries = Object.entries(MODULE_UPSTREAM_ENV) as [string, string][];
  for (const [, envVar] of upstreamEntries) {
    assert.ok(
      proxied.has(envVar),
      `MODULE_UPSTREAM_ENV uses ${envVar} but no MODULE_UPSTREAM_* mount references it (health-only sidecars are forbidden unless proxied)`,
    );
  }
});

test("BitrixWebhookModule nests BitrixSyncModule for delta sync on bitrix_worker", () => {
  const imports = Reflect.getMetadata("imports", BitrixWebhookModule) as unknown[] | undefined;
  assert.ok(Array.isArray(imports));
  const hasSync = imports.some((mod) => mod === BitrixSyncModule);
  assert.equal(hasSync, true, "BitrixWebhookModule must import BitrixSyncModule so delta sync runs in worker");
});

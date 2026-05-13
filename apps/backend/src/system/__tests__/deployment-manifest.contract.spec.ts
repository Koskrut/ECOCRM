import test from "node:test";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

const digest = "sha256:" + "a".repeat(64);

test("Control Plane deployment manifest shape matches validate-deployment-manifest.mjs", () => {
  const repoRoot = path.resolve(__dirname, "../../../../..");
  const script = path.join(repoRoot, "scripts", "validate-deployment-manifest.mjs");
  assert.ok(fs.existsSync(script), `validator script missing: ${script}`);

  const sample = {
    version: "0.0.0-contract",
    channel: "stable",
    status: "published",
    registryProvider: "ghcr",
    registryHost: "ghcr.io",
    sourceRepo: "https://github.com/example/crm",
    gitSha: "abc1234",
    ciRunUrl: "https://github.com/example/crm/actions/runs/1",
    builtAt: "2026-05-02T00:00:00.000Z",
    composeFiles: ["compose.base.yml", "compose.client.yml", "compose.modules.store.yml"],
    composeFileUrls: {
      "compose.base.yml": "https://raw.githubusercontent.com/example/crm/abc1234/compose.base.yml",
      "compose.client.yml": "https://raw.githubusercontent.com/example/crm/abc1234/compose.client.yml",
      "compose.modules.store.yml": "https://raw.githubusercontent.com/example/crm/abc1234/compose.modules.store.yml",
    },
    moduleCodes: ["core.crm"],
    compatibility: { line: "0.1.x" },
    images: [
      {
        role: "backend_core",
        serviceName: "backend",
        imageRepository: "ghcr.io/example/crm-backend-core",
        imageTag: "0.0.0-contract",
        imageDigest: digest,
      },
      {
        role: "other",
        serviceName: "crm-core-api",
        imageRepository: "ghcr.io/example/crm-core-api",
        imageTag: "0.0.0-contract",
        imageDigest: digest,
      },
      {
        role: "web",
        serviceName: "web",
        imageRepository: "ghcr.io/example/crm-web",
        imageTag: "0.0.0-contract",
        imageDigest: digest,
      },
      {
        role: "store",
        serviceName: "store",
        imageRepository: "ghcr.io/example/crm-store",
        imageTag: "0.0.0-contract",
        imageDigest: digest,
      },
    ],
  };

  const tmp = path.join(os.tmpdir(), `crm-deployment-manifest-${Date.now()}.json`);
  fs.writeFileSync(tmp, `${JSON.stringify(sample, null, 2)}\n`);
  try {
    execFileSync(process.execPath, [script, tmp], { stdio: "pipe", encoding: "utf8" });
  } finally {
    fs.unlinkSync(tmp);
  }
});

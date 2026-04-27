import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { generateKeyPairSync, sign } from "node:crypto";
import { FileLicenseStateProvider } from "../file-license-state.provider";
import { ModuleIds } from "../../module-ids";

type LicensePayload = {
  licenseId: string;
  customer: string;
  issuedAt: string;
  expiresAt: string;
  modules: string[];
  instance?: string | null;
};

type LicenseFile = {
  version: number;
  alg: "Ed25519";
  payload: LicensePayload;
  signature: string;
};

function sortedJson(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map((v) => sortedJson(v)).join(",")}]`;
  if (value && typeof value === "object") {
    const obj = value as Record<string, unknown>;
    const keys = Object.keys(obj).sort();
    return `{${keys.map((k) => `${JSON.stringify(k)}:${sortedJson(obj[k])}`).join(",")}}`;
  }
  return JSON.stringify(value);
}

async function withTempLicense(
  payload: LicensePayload,
  opts: { invalidSignature?: boolean } = {},
): Promise<{ cleanup: () => Promise<void>; filePath: string; publicKeyPem: string }> {
  const dir = await mkdtemp(join(tmpdir(), "crm-license-test-"));
  const filePath = join(dir, "license.json");
  const { publicKey, privateKey } = generateKeyPairSync("ed25519");
  const publicKeyPem = publicKey.export({ type: "spki", format: "pem" }).toString();
  const payloadToSign = opts.invalidSignature ? { ...payload, customer: `${payload.customer}-tampered` } : payload;
  const signature = sign(null, Buffer.from(sortedJson(payloadToSign), "utf8"), privateKey).toString("base64");
  const license: LicenseFile = {
    version: 1,
    alg: "Ed25519",
    payload,
    signature,
  };
  await writeFile(filePath, JSON.stringify(license), "utf8");
  return {
    filePath,
    publicKeyPem,
    cleanup: async () => {
      await rm(dir, { recursive: true, force: true });
    },
  };
}

function plusHours(hours: number): string {
  return new Date(Date.now() + hours * 60 * 60 * 1000).toISOString();
}

async function withLicenseEnv(
  env: { filePath?: string; publicKey?: string },
  run: () => Promise<void>,
): Promise<void> {
  const prevPath = process.env.LICENSE_FILE_PATH;
  const prevKey = process.env.LICENSE_PUBLIC_KEY;
  if (env.filePath === undefined) delete process.env.LICENSE_FILE_PATH;
  else process.env.LICENSE_FILE_PATH = env.filePath;
  if (env.publicKey === undefined) delete process.env.LICENSE_PUBLIC_KEY;
  else process.env.LICENSE_PUBLIC_KEY = env.publicKey;
  try {
    await run();
  } finally {
    if (prevPath === undefined) delete process.env.LICENSE_FILE_PATH;
    else process.env.LICENSE_FILE_PATH = prevPath;
    if (prevKey === undefined) delete process.env.LICENSE_PUBLIC_KEY;
    else process.env.LICENSE_PUBLIC_KEY = prevKey;
  }
}

test("FileLicenseStateProvider: valid license populates entitled modules and core", async () => {
  const payload: LicensePayload = {
    licenseId: "lic_test_valid_123456",
    customer: "ACME",
    issuedAt: plusHours(-1),
    expiresAt: plusHours(24),
    modules: [ModuleIds.Finance, ModuleIds.IntegrationsTelegram],
    instance: null,
  };
  const temp = await withTempLicense(payload);
  let state!: Awaited<ReturnType<FileLicenseStateProvider["getLicenseState"]>>;
  await withLicenseEnv({ filePath: temp.filePath, publicKey: temp.publicKeyPem }, async () => {
    const provider = new FileLicenseStateProvider();
    state = await provider.getLicenseState();
  });
  await temp.cleanup();

  assert.equal(state.isValid, true);
  assert.equal(state.status, "valid");
  assert.equal(state.licensedModules.has(ModuleIds.CoreCrm), true);
  assert.equal(state.licensedModules.has(ModuleIds.Finance), true);
  assert.equal(state.licensedModules.has(ModuleIds.IntegrationsTelegram), true);
  assert.equal(state.licensedModules.has(ModuleIds.VoiceOutbound), false);
});

test("FileLicenseStateProvider: missing file -> fail-closed extensions, core remains licensed", async () => {
  let state!: Awaited<ReturnType<FileLicenseStateProvider["getLicenseState"]>>;
  await withLicenseEnv({ filePath: undefined, publicKey: "test" }, async () => {
    const provider = new FileLicenseStateProvider();
    state = await provider.getLicenseState();
  });

  assert.equal(state.isValid, false);
  assert.equal(state.status, "missing");
  assert.equal(state.licensedModules.has(ModuleIds.CoreCrm), true);
  assert.equal(state.licensedModules.has(ModuleIds.Finance), false);
});

test("FileLicenseStateProvider: invalid signature -> fail-closed extensions", async () => {
  const payload: LicensePayload = {
    licenseId: "lic_test_invalid_sig",
    customer: "ACME",
    issuedAt: plusHours(-1),
    expiresAt: plusHours(24),
    modules: [ModuleIds.Finance, ModuleIds.VoiceOutbound, ModuleIds.NovaPoshta],
  };
  const temp = await withTempLicense(payload, { invalidSignature: true });
  let state!: Awaited<ReturnType<FileLicenseStateProvider["getLicenseState"]>>;
  await withLicenseEnv({ filePath: temp.filePath, publicKey: temp.publicKeyPem }, async () => {
    const provider = new FileLicenseStateProvider();
    state = await provider.getLicenseState();
  });
  await temp.cleanup();

  assert.equal(state.isValid, false);
  assert.equal(state.status, "invalid");
  assert.equal(state.licensedModules.has(ModuleIds.CoreCrm), true);
  assert.equal(state.licensedModules.has(ModuleIds.Finance), false);
});

test("FileLicenseStateProvider: expired license -> fail-closed extensions", async () => {
  const payload: LicensePayload = {
    licenseId: "lic_test_expired",
    customer: "ACME",
    issuedAt: plusHours(-48),
    expiresAt: plusHours(-1),
    modules: [ModuleIds.Finance],
  };
  const temp = await withTempLicense(payload);
  let state!: Awaited<ReturnType<FileLicenseStateProvider["getLicenseState"]>>;
  await withLicenseEnv({ filePath: temp.filePath, publicKey: temp.publicKeyPem }, async () => {
    const provider = new FileLicenseStateProvider();
    state = await provider.getLicenseState();
  });
  await temp.cleanup();

  assert.equal(state.isValid, false);
  assert.equal(state.status, "expired");
  assert.equal(state.licensedModules.has(ModuleIds.CoreCrm), true);
  assert.equal(state.licensedModules.has(ModuleIds.Finance), false);
});

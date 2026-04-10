/**
 * Stack smoke: FileLicenseStateProvider + ModuleStateService + license-status DTO shape.
 * Mirrors pre-merge manual checks for PR #12 (valid / missing / invalid / expired).
 */
import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { generateKeyPairSync, sign } from "node:crypto";
import { FileLicenseStateProvider } from "../file-license-state.provider";
import { ModuleIds, type ModuleId } from "../../module-ids";
import { ModuleStateService } from "../../module-state.service";
import { EnabledModulesProvider } from "../../enabled/enabled-modules.provider";
import type { LicenseState } from "../license-state.provider";

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
  const dir = await mkdtemp(join(tmpdir(), "crm-license-smoke-"));
  const filePath = join(dir, "license.json");
  const { publicKey, privateKey } = generateKeyPairSync("ed25519");
  const publicKeyPem = publicKey.export({ type: "spki", format: "pem" }).toString();
  const payloadToSign = opts.invalidSignature ? { ...payload, customer: `${payload.customer}-tampered` } : payload;
  const signature = sign(null, Buffer.from(sortedJson(payloadToSign), "utf8"), privateKey).toString("base64");
  const license: LicenseFile = { version: 1, alg: "Ed25519", payload, signature };
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

/** Same shape as GET /system/license-status (SystemController.licenseStatus). */
function toLicenseStatusDto(state: LicenseState) {
  return {
    status: state.status,
    expiresAt: state.expiresAt,
    customer: state.customer,
    licenseId: state.shortLicenseId,
  };
}

class EnabledAllPilots extends EnabledModulesProvider {
  private readonly pilots: ModuleId[] = [
    ModuleIds.CoreCrm,
    ModuleIds.Finance,
    ModuleIds.VoiceOutbound,
    ModuleIds.IntegrationsTelegram,
  ];
  async getEnabledModules() {
    return { enabledModules: new Set(this.pilots), source: "system_setting" as const };
  }
}

test("smoke: valid license → status valid; Finance licensed+effective; outbound not in license → not licensed", async () => {
  const payload: LicensePayload = {
    licenseId: "lic_smoke_valid",
    customer: "ACME",
    issuedAt: plusHours(-1),
    expiresAt: plusHours(24),
    modules: [ModuleIds.Finance],
  };
  const temp = await withTempLicense(payload);
  await withLicenseEnv({ filePath: temp.filePath, publicKey: temp.publicKeyPem }, async () => {
    const lic = new FileLicenseStateProvider();
    const state = await lic.getLicenseState();
    const dto = toLicenseStatusDto(state);
    assert.equal(dto.status, "valid");
    assert.equal(state.isValid, true);

    const svc = new ModuleStateService(new EnabledAllPilots(), lic);
    const rows = await svc.listStates();
    const fin = rows.find((m) => m.id === ModuleIds.Finance);
    const voice = rows.find((m) => m.id === ModuleIds.VoiceOutbound);
    const core = rows.find((m) => m.id === ModuleIds.CoreCrm);
    assert.equal(core?.licensed, true);
    assert.equal(core?.effective, true);
    assert.equal(fin?.licensed, true);
    assert.equal(fin?.effective, true);
    assert.equal(voice?.licensed, false);
    assert.equal(voice?.effective, false);
  });
  await temp.cleanup();
});

test("smoke: missing file → status missing; extensions unlicensed; core licensed", async () => {
  await withLicenseEnv({ filePath: undefined, publicKey: "unused" }, async () => {
    const lic = new FileLicenseStateProvider();
    const state = await lic.getLicenseState();
    assert.equal(toLicenseStatusDto(state).status, "missing");
    assert.equal(state.isValid, false);

    const svc = new ModuleStateService(new EnabledAllPilots(), lic);
    const rows = await svc.listStates();
    const core = rows.find((m) => m.id === ModuleIds.CoreCrm);
    const fin = rows.find((m) => m.id === ModuleIds.Finance);
    assert.equal(core?.licensed, true);
    assert.equal(fin?.licensed, false);
    assert.equal(fin?.effective, false);
  });
});

test("smoke: invalid signature → status invalid; extensions fail-closed; core licensed", async () => {
  const payload: LicensePayload = {
    licenseId: "lic_smoke_inv",
    customer: "ACME",
    issuedAt: plusHours(-1),
    expiresAt: plusHours(24),
    modules: [ModuleIds.Finance, ModuleIds.VoiceOutbound],
  };
  const temp = await withTempLicense(payload, { invalidSignature: true });
  await withLicenseEnv({ filePath: temp.filePath, publicKey: temp.publicKeyPem }, async () => {
    const lic = new FileLicenseStateProvider();
    const state = await lic.getLicenseState();
    assert.equal(toLicenseStatusDto(state).status, "invalid");
    assert.equal(state.isValid, false);

    const svc = new ModuleStateService(new EnabledAllPilots(), lic);
    const rows = await svc.listStates();
    const core = rows.find((m) => m.id === ModuleIds.CoreCrm);
    const fin = rows.find((m) => m.id === ModuleIds.Finance);
    assert.equal(core?.licensed, true);
    assert.equal(fin?.licensed, false);
  });
  await temp.cleanup();
});

test("smoke: expired license → status expired; extensions unlicensed; core licensed", async () => {
  const payload: LicensePayload = {
    licenseId: "lic_smoke_exp",
    customer: "ACME",
    issuedAt: plusHours(-48),
    expiresAt: plusHours(-1),
    modules: [ModuleIds.Finance],
  };
  const temp = await withTempLicense(payload);
  await withLicenseEnv({ filePath: temp.filePath, publicKey: temp.publicKeyPem }, async () => {
    const lic = new FileLicenseStateProvider();
    const state = await lic.getLicenseState();
    assert.equal(toLicenseStatusDto(state).status, "expired");
    assert.equal(state.isValid, false);

    const svc = new ModuleStateService(new EnabledAllPilots(), lic);
    const rows = await svc.listStates();
    const core = rows.find((m) => m.id === ModuleIds.CoreCrm);
    const fin = rows.find((m) => m.id === ModuleIds.Finance);
    assert.equal(core?.licensed, true);
    assert.equal(fin?.licensed, false);
  });
  await temp.cleanup();
});

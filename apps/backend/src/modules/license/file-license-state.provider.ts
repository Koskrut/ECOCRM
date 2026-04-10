import { Injectable } from "@nestjs/common";
import { readFile } from "node:fs/promises";
import { createPublicKey, verify } from "node:crypto";
import { MODULE_REGISTRY } from "../module-registry";
import type { ModuleId } from "../module-ids";
import {
  LicenseStateProvider,
  type LicenseState,
  type LicenseValidationStatus,
} from "./license-state.provider";

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
  keyId?: string;
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

function shortLicenseId(licenseId: string | null): string | null {
  if (!licenseId) return null;
  return licenseId.length <= 8 ? licenseId : `${licenseId.slice(0, 8)}...`;
}

function coreModuleIds(): Set<ModuleId> {
  const ids = Object.keys(MODULE_REGISTRY) as ModuleId[];
  const out = new Set<ModuleId>();
  for (const id of ids) {
    if (MODULE_REGISTRY[id]?.kind === "core") out.add(id);
  }
  return out;
}

function knownExtensionModuleIds(): Set<ModuleId> {
  const ids = Object.keys(MODULE_REGISTRY) as ModuleId[];
  const out = new Set<ModuleId>();
  for (const id of ids) {
    if (MODULE_REGISTRY[id]?.kind === "extension") out.add(id);
  }
  return out;
}

@Injectable()
export class FileLicenseStateProvider extends LicenseStateProvider {
  private readonly filePath = process.env.LICENSE_FILE_PATH;
  private readonly publicKeyPem = process.env.LICENSE_PUBLIC_KEY;
  private readonly coreModules = coreModuleIds();
  private readonly extensionModules = knownExtensionModuleIds();

  async getLicenseState(): Promise<LicenseState> {
    if (!this.filePath) {
      return this.fallback("missing");
    }

    const parsed = await this.readLicenseFile();
    if (!parsed) return this.fallback("missing");
    if (!this.isLicenseFileShapeValid(parsed)) return this.fallback("invalid");

    const { payload, signature } = parsed;
    if (!this.isPayloadShapeValid(payload)) {
      return this.fallback("invalid");
    }
    if (!this.publicKeyPem || !this.verifySignature(payload, signature)) {
      return this.fallback("invalid", payload.expiresAt, payload.customer, payload.licenseId);
    }
    if (this.isExpired(payload.expiresAt)) {
      return this.fallback("expired", payload.expiresAt, payload.customer, payload.licenseId);
    }

    const licensedModules = new Set<ModuleId>(this.coreModules);
    for (const id of payload.modules) {
      const moduleId = id as ModuleId;
      if (this.extensionModules.has(moduleId)) licensedModules.add(moduleId);
    }

    return {
      isValid: true,
      licensedModules,
      status: "valid",
      expiresAt: payload.expiresAt,
      customer: payload.customer,
      shortLicenseId: shortLicenseId(payload.licenseId),
    };
  }

  private fallback(
    status: Exclude<LicenseValidationStatus, "valid">,
    expiresAt: string | null = null,
    customer: string | null = null,
    licenseId: string | null = null,
  ): LicenseState {
    return {
      isValid: false,
      licensedModules: new Set<ModuleId>(this.coreModules),
      status,
      expiresAt,
      customer,
      shortLicenseId: shortLicenseId(licenseId),
    };
  }

  private async readLicenseFile(): Promise<LicenseFile | null> {
    try {
      const raw = await readFile(this.filePath!, "utf8");
      return JSON.parse(raw) as LicenseFile;
    } catch {
      return null;
    }
  }

  private isLicenseFileShapeValid(file: unknown): file is LicenseFile {
    if (!file || typeof file !== "object") return false;
    const f = file as Partial<LicenseFile>;
    return (
      typeof f.version === "number" &&
      f.version >= 1 &&
      f.alg === "Ed25519" &&
      typeof f.signature === "string" &&
      f.signature.length > 0 &&
      !!f.payload &&
      typeof f.payload === "object"
    );
  }

  private verifySignature(payload: LicensePayload, signature: string): boolean {
    try {
      const key = createPublicKey(this.publicKeyPem!);
      const data = Buffer.from(sortedJson(payload), "utf8");
      const sig = Buffer.from(signature, "base64");
      return verify(null, data, key, sig);
    } catch {
      return false;
    }
  }

  private isExpired(expiresAt: string): boolean {
    const ts = Date.parse(expiresAt);
    if (!Number.isFinite(ts)) return true;
    return ts <= Date.now();
  }

  private isPayloadShapeValid(payload: unknown): payload is LicensePayload {
    if (!payload || typeof payload !== "object") return false;
    const p = payload as Partial<LicensePayload>;
    return (
      typeof p.licenseId === "string" &&
      p.licenseId.length > 0 &&
      typeof p.customer === "string" &&
      p.customer.length > 0 &&
      typeof p.issuedAt === "string" &&
      typeof p.expiresAt === "string" &&
      Array.isArray(p.modules) &&
      p.modules.every((m) => typeof m === "string")
    );
  }
}

#!/usr/bin/env node
/**
 * Issue a signed license.json compatible with FileLicenseStateProvider (Ed25519 + sorted JSON payload).
 *
 * Usage:
 *   node scripts/issue-file-license.mjs gen-keys --out-prefix ./crm-license
 *   node scripts/issue-file-license.mjs sign \
 *     --private-key ./crm-license-private.pem \
 *     --out ./license.json \
 *     --customer "ClientName" \
 *     --modules ext.finance,int.nova_poshta \
 *     --days 365
 *
 * Then set on the server:
 *   LICENSE_FILE_PATH_HOST=/path/to/license.json (host path)
 *   LICENSE_PUBLIC_KEY=-----BEGIN PUBLIC KEY-----\n...\\n-----END PUBLIC KEY-----
 * (one line with \n escapes, as in .env.production.example)
 *
 * Control Plane phone-home (entitlement written by CP from subscription, not from body alone):
 *   Copy scripts/phone-home-body.example.json → host path (e.g. /opt/crm/phone_home_body.json),
 *   replace placeholders; installedModules/enabledModules should mirror CRM + CP subscription.
 */
import {
  generateKeyPairSync,
  sign,
  createPrivateKey,
  createPublicKey,
} from "node:crypto";
import { writeFileSync, readFileSync, mkdirSync } from "node:fs";
import { dirname, resolve } from "node:path";

function sortedJson(value) {
  if (Array.isArray(value)) return `[${value.map((v) => sortedJson(v)).join(",")}]`;
  if (value && typeof value === "object") {
    const obj = value;
    const keys = Object.keys(obj).sort();
    return `{${keys.map((k) => `${JSON.stringify(k)}:${sortedJson(obj[k])}`).join(",")}}`;
  }
  return JSON.stringify(value);
}

function pemPublicKeyOneLine(pem) {
  return pem
    .trim()
    .replace(/\r\n/g, "\n")
    .split("\n")
    .join("\\n");
}

function parseArgs(argv) {
  const out = {};
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a.startsWith("--")) {
      const key = a.slice(2);
      const val = argv[i + 1] && !argv[i + 1].startsWith("--") ? argv[++i] : true;
      out[key] = val;
    }
  }
  return out;
}

function cmdGenKeys(args) {
  const prefix = resolve(String(args["out-prefix"] || "./crm-license"));
  const pubPath = `${prefix}-public.pem`;
  const prvPath = `${prefix}-private.pem`;
  mkdirSync(dirname(pubPath), { recursive: true });
  const { publicKey, privateKey } = generateKeyPairSync("ed25519");
  const pubPem = publicKey.export({ type: "spki", format: "pem" }).toString();
  const prvPem = privateKey.export({ type: "pkcs8", format: "pem" }).toString();
  writeFileSync(pubPath, pubPem, "utf8");
  writeFileSync(prvPath, prvPem, { encoding: "utf8", mode: 0o600 });
  console.error(`Wrote ${pubPath}`);
  console.error(`Wrote ${prvPath} (keep secret; chmod 600)`);
  console.log("LICENSE_PUBLIC_KEY=" + pemPublicKeyOneLine(pubPem));
}

function cmdSign(args) {
  const keyPath = resolve(String(args["private-key"] || ""));
  const outPath = resolve(String(args.out || "./license.json"));
  const customer = String(args.customer || "customer");
  const licenseId = String(args["license-id"] || `lic_${Date.now()}`);
  const days = Number(args.days || 365);
  if (!Number.isFinite(days) || days < 1) {
    console.error("Invalid --days");
    process.exit(1);
  }
  const modulesRaw = String(args.modules || "ext.finance")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
  const issuedAt = new Date().toISOString();
  const expiresAt =
    args.expires != null && String(args.expires)
      ? new Date(String(args.expires)).toISOString()
      : new Date(Date.now() + days * 86400_000).toISOString();

  const payload = {
    licenseId,
    customer,
    issuedAt,
    expiresAt,
    modules: modulesRaw,
  };
  if (args.instance != null && String(args.instance).trim() !== "") {
    payload.instance = String(args.instance).trim();
  }

  const prvPem = readFileSync(keyPath, "utf8");
  const privateKey = createPrivateKey(prvPem);
  const signature = sign(null, Buffer.from(sortedJson(payload), "utf8"), privateKey).toString(
    "base64",
  );

  const license = {
    version: 1,
    alg: "Ed25519",
    payload,
    signature,
  };
  mkdirSync(dirname(outPath), { recursive: true });
  writeFileSync(outPath, JSON.stringify(license, null, 2) + "\n", "utf8");
  console.error(`Wrote ${outPath}`);
  const pubPem = createPublicKey(privateKey).export({ type: "spki", format: "pem" }).toString();
  console.log("LICENSE_PUBLIC_KEY=" + pemPublicKeyOneLine(pubPem));
}

function main() {
  const [, , cmd, ...rest] = process.argv;
  const args = parseArgs(rest);
  if (cmd === "gen-keys") {
    cmdGenKeys(args);
    return;
  }
  if (cmd === "sign") {
    cmdSign(args);
    return;
  }
  console.error(`Usage:
  node scripts/issue-file-license.mjs gen-keys --out-prefix ./crm-license
  node scripts/issue-file-license.mjs sign --private-key ./crm-license-private.pem \\
    --out ./license.json --customer "Name" --modules ext.finance,int.nova_poshta --days 365`);
  process.exit(1);
}

main();

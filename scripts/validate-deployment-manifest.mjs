#!/usr/bin/env node
/**
 * Validates DeploymentManifest JSON shape (CRM CI / dry-run / CP handoff).
 * Usage: node scripts/validate-deployment-manifest.mjs path/to/deployment-manifest.json
 */
import fs from "node:fs";

function fail(msg) {
  console.error(msg);
  process.exit(1);
}

const path = process.argv[2];
if (!path) {
  fail("usage: node scripts/validate-deployment-manifest.mjs <deployment-manifest.json>");
}

let raw;
try {
  raw = fs.readFileSync(path, "utf8");
} catch (e) {
  fail(`cannot read file: ${path} (${e instanceof Error ? e.message : String(e)})`);
}

let doc;
try {
  doc = JSON.parse(raw);
} catch (e) {
  fail(`invalid JSON: ${e instanceof Error ? e.message : String(e)}`);
}

const requiredTop = [
  "version",
  "channel",
  "status",
  "registryProvider",
  "registryHost",
  "sourceRepo",
  "gitSha",
  "ciRunUrl",
  "builtAt",
  "composeFiles",
  "moduleCodes",
  "compatibility",
  "images",
];
for (const k of requiredTop) {
  if (!(k in doc)) fail(`missing top-level field: ${k}`);
}
if (!Array.isArray(doc.composeFiles) || doc.composeFiles.length === 0) {
  fail("composeFiles must be a non-empty array");
}
const composeFileRe = /^compose\.[a-z0-9_.-]+\.yml$/;
for (let i = 0; i < doc.composeFiles.length; i++) {
  const cf = doc.composeFiles[i];
  if (typeof cf !== "string" || !composeFileRe.test(cf)) {
    fail(`composeFiles[${i}] must match ${composeFileRe}: got ${JSON.stringify(cf)}`);
  }
}
if (!Array.isArray(doc.moduleCodes) || doc.moduleCodes.length === 0) {
  fail("moduleCodes must be a non-empty array");
}
if (!doc.compatibility || typeof doc.compatibility.line !== "string") {
  fail("compatibility.line must be a string");
}
if (!Array.isArray(doc.images) || doc.images.length === 0) {
  fail("images must be a non-empty array");
}

const digestRe = /^sha256:[a-fA-F0-9]{64}$/;
const knownRoles = new Set([
  "backend_core",
  "backend_core_only",
  "web",
  "store",
  "module_outbound",
  "client_extension",
]);
function isValidRole(role) {
  if (knownRoles.has(role)) return true;
  if (role.startsWith("module_")) return true;
  return false;
}

for (let i = 0; i < doc.images.length; i++) {
  const im = doc.images[i];
  const p = `images[${i}]`;
  for (const f of ["role", "serviceName", "imageRepository", "imageTag", "imageDigest"]) {
    if (typeof im[f] !== "string" || !im[f]) {
      fail(`${p}: missing or invalid string field ${f}`);
    }
  }
  if (!isValidRole(im.role)) {
    fail(`${p}: unknown role ${JSON.stringify(im.role)} (expected known role or module_*)`);
  }
  if (im.moduleCode !== undefined) {
    if (typeof im.moduleCode !== "string" || !im.moduleCode) {
      fail(`${p}: moduleCode must be a non-empty string when set`);
    }
  }
  if (im.clientCode !== undefined) {
    if (typeof im.clientCode !== "string" || !im.clientCode) {
      fail(`${p}: clientCode must be a non-empty string when set`);
    }
  }
  if (im.role === "client_extension") {
    if (typeof im.clientCode !== "string" || !im.clientCode) {
      fail(`${p}: client_extension images require clientCode`);
    }
  }
  if (typeof im.role === "string" && im.role.startsWith("module_")) {
    if (typeof im.moduleCode !== "string" || !im.moduleCode) {
      fail(`${p}: moduleCode is required for role ${JSON.stringify(im.role)}`);
    }
  }
  if (!digestRe.test(im.imageDigest)) {
    fail(`${p}: imageDigest must be sha256:... (64 hex)`);
  }
  if (im.imageRepository !== im.imageRepository.toLowerCase()) {
    fail(`${p}: imageRepository must be lowercase`);
  }
}

console.log(`OK: deployment manifest valid (${doc.images.length} image(s))`);

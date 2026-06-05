#!/usr/bin/env node
/**
 * Adds int.privat24 to license.json when ext.finance is present (backward compat).
 * Usage: node scripts/migrate-finance-license-add-privat24.mjs [path/to/license.json]
 */
import { readFileSync, writeFileSync } from "node:fs";

const FINANCE = "ext.finance";
const PRIVAT24 = "int.privat24";

const path = process.argv[2] ?? ".dev-license/license.json";
const raw = readFileSync(path, "utf8");
const doc = JSON.parse(raw);
const modules = doc?.payload?.modules;
if (!Array.isArray(modules)) {
  console.error("Invalid license: payload.modules must be an array");
  process.exit(1);
}

if (!modules.includes(FINANCE)) {
  console.log("No ext.finance in license — nothing to migrate");
  process.exit(0);
}

if (modules.includes(PRIVAT24)) {
  console.log("int.privat24 already present");
  process.exit(0);
}

modules.push(PRIVAT24);
modules.sort();
writeFileSync(path, `${JSON.stringify(doc, null, 2)}\n`, "utf8");
console.log(`Added ${PRIVAT24} to ${path}`);

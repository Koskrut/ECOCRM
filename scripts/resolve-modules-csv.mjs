#!/usr/bin/env node
/**
 * Normalizes publish `modules` CSV for CI / manifest (single source of truth).
 * Usage: node scripts/resolve-modules-csv.mjs "<csv>" [legacy-outbound-true]
 * Prints one line: comma-separated slugs (no spaces), or empty line.
 */
const csv = process.argv[2] ?? "";
const legacyOutbound = (process.argv[3] ?? "").toLowerCase() === "true";

const ALIASES = {
  googlesheet: "google-sheet",
  google_sheet: "google-sheet",
  voice_outbound: "outbound",
  nova_poshta: "np",
  novaposhta: "np",
};

function norm(s) {
  return String(s ?? "")
    .trim()
    .toLowerCase()
    .replace(/_/g, "-");
}

const KNOWN = new Set([
  "outbound",
  "google-sheet",
  "ringostat",
  "bitrix",
  "np",
  "finance",
  "planning",
]);

let parts = csv
  .split(/[,;\s]+/)
  .map(norm)
  .filter(Boolean)
  .map((p) => ALIASES[p] ?? p);

if (!parts.length && legacyOutbound) {
  parts = ["outbound"];
}

const out = [];
for (const p of parts) {
  if (!KNOWN.has(p)) {
    console.error(`Unknown module slug in CSV: ${p} (known: ${[...KNOWN].sort().join(", ")})`);
    process.exit(1);
  }
  if (!out.includes(p)) out.push(p);
}

process.stdout.write(out.join(","));

import test from "node:test";
import assert from "node:assert/strict";

/** Mirrors apps/web/src/app/planning/page.tsx legacy tab routing. */
const LEGACY_TAB_MAP: Record<string, "overview" | "requests" | "data"> = {
  today: "overview",
  kits: "overview",
  dashboard: "overview",
  mrp: "overview",
  mrpCritical: "overview",
  pack: "requests",
  make: "requests",
  mrpPack: "requests",
  mrpProduction: "requests",
  mrpSemi: "requests",
  factory: "requests",
  packing: "requests",
  inventory: "data",
  snapshots: "data",
  bom: "data",
  forecast: "data",
  settings: "data",
  batches: "data",
  queues: "data",
};

const PLANNING_SCREENS = ["overview", "requests", "data"] as const;

function resolveScreen(tab: string | null): (typeof PLANNING_SCREENS)[number] {
  if (!tab) return "overview";
  if (tab in LEGACY_TAB_MAP) return LEGACY_TAB_MAP[tab]!;
  if (PLANNING_SCREENS.includes(tab as (typeof PLANNING_SCREENS)[number])) {
    return tab as (typeof PLANNING_SCREENS)[number];
  }
  return "overview";
}

function legacyKind(tab: string): "pack" | "factory" | null {
  if (tab === "make" || tab === "factory" || tab === "mrpProduction" || tab === "mrpSemi") {
    return "factory";
  }
  if (
    tab === "pack" ||
    tab === "packing" ||
    tab === "mrpPack"
  ) {
    return "pack";
  }
  return null;
}

test("resolveScreen defaults to overview", () => {
  assert.equal(resolveScreen(null), "overview");
  assert.equal(resolveScreen("unknown"), "overview");
});

test("resolveScreen maps legacy tabs to new IA", () => {
  assert.equal(resolveScreen("today"), "overview");
  assert.equal(resolveScreen("kits"), "overview");
  assert.equal(resolveScreen("pack"), "requests");
  assert.equal(resolveScreen("make"), "requests");
  assert.equal(resolveScreen("snapshots"), "data");
});

test("resolveScreen keeps new tab keys", () => {
  assert.equal(resolveScreen("overview"), "overview");
  assert.equal(resolveScreen("requests"), "requests");
  assert.equal(resolveScreen("data"), "data");
});

test("legacyKind for requests deep links", () => {
  assert.equal(legacyKind("make"), "factory");
  assert.equal(legacyKind("pack"), "pack");
  assert.equal(legacyKind("today"), null);
});

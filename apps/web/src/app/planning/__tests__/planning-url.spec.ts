import test from "node:test";
import assert from "node:assert/strict";

/** Mirrors apps/web/src/app/planning/page.tsx workplace tab routing. */
type PlanningScreen = "overview" | "factory" | "kits" | "risks" | "data";

const LEGACY_TAB_MAP: Record<string, PlanningScreen> = {
  today: "overview",
  dashboard: "overview",
  requests: "overview",
  pack: "overview",
  packing: "overview",
  mrp: "risks",
  mrpCritical: "risks",
  mrpPack: "risks",
  mrpProduction: "risks",
  mrpSemi: "risks",
  make: "factory",
  factory: "factory",
  inventory: "data",
  snapshots: "data",
  bom: "kits",
  forecast: "data",
  settings: "data",
  batches: "data",
  queues: "data",
};

const PLANNING_SCREENS: PlanningScreen[] = ["overview", "factory", "kits", "risks", "data"];

function resolveScreen(tab: string | null): PlanningScreen {
  if (!tab) return "overview";
  if (tab in LEGACY_TAB_MAP) return LEGACY_TAB_MAP[tab]!;
  if (PLANNING_SCREENS.includes(tab as PlanningScreen)) return tab as PlanningScreen;
  return "overview";
}

test("resolveScreen defaults to overview", () => {
  assert.equal(resolveScreen(null), "overview");
  assert.equal(resolveScreen("unknown"), "overview");
});

test("resolveScreen maps legacy tabs to workplace IA", () => {
  assert.equal(resolveScreen("today"), "overview");
  assert.equal(resolveScreen("pack"), "overview");
  assert.equal(resolveScreen("make"), "factory");
  assert.equal(resolveScreen("factory"), "factory");
  assert.equal(resolveScreen("mrp"), "risks");
  assert.equal(resolveScreen("snapshots"), "data");
  assert.equal(resolveScreen("bom"), "kits");
});

test("resolveScreen keeps workplace tab keys", () => {
  assert.equal(resolveScreen("overview"), "overview");
  assert.equal(resolveScreen("factory"), "factory");
  assert.equal(resolveScreen("kits"), "kits");
  assert.equal(resolveScreen("risks"), "risks");
  assert.equal(resolveScreen("data"), "data");
});

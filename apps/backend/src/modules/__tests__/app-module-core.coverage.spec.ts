import test from "node:test";
import assert from "node:assert/strict";
import type { Type } from "@nestjs/common";
import { AppModule } from "../../app.module";
import { AppModuleCore } from "../../app.module.core";
import {
  MODULE_UPSTREAM_REGEX_MOUNTS,
  MODULE_UPSTREAM_STATIC_MOUNTS,
} from "../../proxy/module-upstream-proxy.setup";

/** Nest modules in full AppModule that may be omitted from AppModuleCore when proxied to a sidecar. */
const SIDEcar_PROXY_ENV_BY_MODULE: Record<string, string> = {
  FinanceIdempotencyModule: "FINANCE_UPSTREAM_URL",
  BankModule: "FINANCE_UPSTREAM_URL",
  PaymentsModule: "FINANCE_UPSTREAM_URL",
  Privat24Module: "FINANCE_UPSTREAM_URL",
  UpcModule: "FINANCE_UPSTREAM_URL",
  NpModule: "NP_UPSTREAM_URL",
  GoogleSheetModule: "GOOGLE_SHEET_UPSTREAM_URL",
  BitrixSyncModule: "BITRIX_UPSTREAM_URL",
  BitrixWebhookModule: "BITRIX_UPSTREAM_URL",
  RingostatModule: "RINGOSTAT_UPSTREAM_URL",
  KyivstarFmcModule: "KYIVSTAR_FMC_UPSTREAM_URL",
  OutboundModule: "OUTBOUND_UPSTREAM_URL",
  CallsModule: "OUTBOUND_UPSTREAM_URL",
  ManualCallingModule: "OUTBOUND_UPSTREAM_URL",
  ProductionPlanningModule: "PLANNING_UPSTREAM_URL",
};

function moduleImports(root: Type<unknown>): Type<unknown>[] {
  const imports = Reflect.getMetadata("imports", root) as unknown[] | undefined;
  assert.ok(Array.isArray(imports), `${root.name} must declare @Module imports`);
  return imports as Type<unknown>[];
}

function proxiedEnvVars(): Set<string> {
  const env = new Set<string>();
  for (const m of MODULE_UPSTREAM_STATIC_MOUNTS) env.add(m.envVar);
  for (const m of MODULE_UPSTREAM_REGEX_MOUNTS) env.add(m.envVar);
  return env;
}

test("AppModuleCore includes every in-process Nest module without a sidecar upstream proxy", () => {
  const fullOnly = moduleImports(AppModule).filter(
    (mod) => !moduleImports(AppModuleCore).includes(mod),
  );

  const knownProxies = proxiedEnvVars();

  for (const mod of fullOnly) {
    const name = mod.name ?? String(mod);
    const envVar = SIDEcar_PROXY_ENV_BY_MODULE[name];
    assert.ok(
      envVar && knownProxies.has(envVar),
      `${name} is in AppModule but missing from AppModuleCore and has no registered sidecar proxy ` +
        `(add to AppModuleCore or map SIDEcar_PROXY_ENV_BY_MODULE + MODULE_UPSTREAM_* mount)`,
    );
  }
});

import type { INestApplication } from "@nestjs/common";
import { Logger } from "@nestjs/common";
import { createProxyMiddleware } from "http-proxy-middleware";
import type { Request, Response } from "express";
import type { ModuleId } from "../modules/module-ids";
import {
  restorePathAfterExpressMount,
  rewriteNovaPoshtaUpstreamPath,
} from "./module-upstream-path-rewrite";

const log = new Logger("ModuleUpstreamProxy");

export type ModuleUpstreamMount = {
  /** For logs only */
  moduleId: ModuleId;
  envVar: string;
  /** Path prefixes (longer / more specific paths first — register in this order). */
  pathPrefixes: string[];
};

/** Static mounts: one Express prefix → upstream (same path on upstream). */
export const MODULE_UPSTREAM_STATIC_MOUNTS: ModuleUpstreamMount[] = [
  {
    moduleId: "ext.voice_outbound" as ModuleId,
    envVar: "OUTBOUND_UPSTREAM_URL",
    pathPrefixes: [
      "/integrations/outbound-voice",
      "/outbound",
      "/manual-calling",
      "/calls",
    ],
  },
  {
    moduleId: "int.google_sheet" as ModuleId,
    envVar: "GOOGLE_SHEET_UPSTREAM_URL",
    pathPrefixes: ["/integrations/google-sheet"],
  },
  {
    moduleId: "int.bitrix" as ModuleId,
    envVar: "BITRIX_UPSTREAM_URL",
    pathPrefixes: ["/integrations/bitrix"],
  },
  {
    moduleId: "int.nova_poshta" as ModuleId,
    envVar: "NP_UPSTREAM_URL",
    pathPrefixes: ["/store/np", "/np"],
  },
  {
    moduleId: "ext.finance" as ModuleId,
    envVar: "FINANCE_UPSTREAM_URL",
    pathPrefixes: [
      "/public/payment-requests",
      "/payment-requests",
      "/payments",
      "/client-balances",
      "/bank",
      "/integrations/privat24",
      "/integrations/upc",
    ],
  },
  {
    moduleId: "ext.production_planning" as ModuleId,
    envVar: "PLANNING_UPSTREAM_URL",
    pathPrefixes: ["/planning"],
  },
];

/** Regex mounts: first match wins (finance / orders send-to-sheet / np under orders if ever added). */
export const MODULE_UPSTREAM_REGEX_MOUNTS: Array<{
  moduleId: ModuleId;
  envVar: string;
  test: (pathname: string) => boolean;
}> = [
  {
    moduleId: "ext.finance" as ModuleId,
    envVar: "FINANCE_UPSTREAM_URL",
    test: (p) => /^\/orders\/[^/]+\/payment-requests(\/|$)/.test(p),
  },
  {
    moduleId: "int.google_sheet" as ModuleId,
    envVar: "GOOGLE_SHEET_UPSTREAM_URL",
    test: (p) => /^\/orders\/[^/]+\/send-to-sheet(\/|$)/.test(p),
  },
  {
    moduleId: "int.google_sheet" as ModuleId,
    envVar: "GOOGLE_SHEET_UPSTREAM_URL",
    test: (p) => /^\/settings\/google-sheet(\/|$)/.test(p),
  },
  {
    moduleId: "int.ringostat" as ModuleId,
    envVar: "RINGOSTAT_UPSTREAM_URL",
    test: (p) => /^\/integrations\/ringostat(\/|$)/.test(p),
  },
  {
    moduleId: "int.ringostat" as ModuleId,
    envVar: "RINGOSTAT_UPSTREAM_URL",
    test: (p) => /^\/settings\/ringostat(\/|$)/.test(p),
  },
  {
    moduleId: "int.kyivstar_fmc" as ModuleId,
    envVar: "KYIVSTAR_FMC_UPSTREAM_URL",
    test: (p) => /^\/integrations\/kyivstar-fmc(\/|$)/.test(p),
  },
  {
    moduleId: "int.kyivstar_fmc" as ModuleId,
    envVar: "KYIVSTAR_FMC_UPSTREAM_URL",
    test: (p) => /^\/settings\/kyivstar-fmc(\/|$)/.test(p),
  },
  {
    moduleId: "int.nova_poshta" as ModuleId,
    envVar: "NP_UPSTREAM_URL",
    test: (p) => /^\/orders\/[^/]+\/np\/ttn(\/|$)/.test(p),
  },
  {
    moduleId: "int.nova_poshta" as ModuleId,
    envVar: "NP_UPSTREAM_URL",
    test: (p) => /^\/orders\/[^/]+\/ttn(\/|$)/.test(p),
  },
  {
    moduleId: "int.nova_poshta" as ModuleId,
    envVar: "NP_UPSTREAM_URL",
    test: (p) => /^\/shipments\/[^/]+\/np\/ttn(\/|$)/.test(p),
  },
];

function buildProxyMiddleware(target: string, secret: string | undefined, mountPrefix?: string) {
  const pathRewrite = mountPrefix
    ? (pathname: string) => restorePathAfterExpressMount(mountPrefix, pathname)
    : undefined;

  return createProxyMiddleware<Request, Response>({
    target,
    changeOrigin: true,
    xfwd: true,
    ...(pathRewrite ? { pathRewrite } : {}),
    on: {
      proxyReq: (proxyReq) => {
        if (secret) {
          proxyReq.setHeader("x-crm-module-internal", secret);
        }
      },
      error: (err, _req, res) => {
        log.warn(`proxy error: ${err instanceof Error ? err.message : String(err)}`);
        const r = res as Response | undefined;
        if (r && typeof r.headersSent === "boolean" && !r.headersSent && typeof r.status === "function") {
          r.status(502).json({ statusCode: 502, message: "Module upstream unavailable" });
        }
      },
    },
  });
}

/**
 * Mount reverse proxies for module sidecars (shared DB, single browser origin).
 * Call after `enableCors`, before `listen`.
 */
export function mountModuleUpstreamProxies(app: INestApplication): void {
  const secret = process.env.MODULE_INTERNAL_SECRET?.trim();

  for (const spec of MODULE_UPSTREAM_STATIC_MOUNTS) {
    const raw = process.env[spec.envVar]?.trim();
    if (!raw) continue;
    const target = raw.replace(/\/$/, "");
    const sorted = [...spec.pathPrefixes].sort((a, b) => b.length - a.length);
    for (const mountPrefix of sorted) {
      app.use(mountPrefix, buildProxyMiddleware(target, secret, mountPrefix));
      log.log(`${spec.moduleId}: mounted ${mountPrefix} -> ${target}`);
    }
  }

  const regexByEnv = new Map<
    string,
    { target: string; tests: Array<(pathname: string) => boolean>; logId: ModuleId }
  >();
  for (const spec of MODULE_UPSTREAM_REGEX_MOUNTS) {
    const raw = process.env[spec.envVar]?.trim();
    if (!raw) continue;
    const target = raw.replace(/\/$/, "");
    const cur = regexByEnv.get(spec.envVar);
    if (cur) {
      cur.tests.push(spec.test);
    } else {
      regexByEnv.set(spec.envVar, { target, tests: [spec.test], logId: spec.moduleId });
    }
  }
  for (const [envVar, { target, tests, logId }] of regexByEnv) {
    const pathRewrite = envVar === "NP_UPSTREAM_URL" ? rewriteNovaPoshtaUpstreamPath : undefined;

    const proxy = createProxyMiddleware<Request, Response>({
      target,
      changeOrigin: true,
      xfwd: true,
      pathFilter: (pathname) => tests.some((t) => t(pathname)),
      ...(pathRewrite ? { pathRewrite } : {}),
      on: {
        proxyReq: (proxyReq) => {
          if (secret) {
            proxyReq.setHeader("x-crm-module-internal", secret);
          }
        },
        error: (err, _req, res) => {
          log.warn(`proxy regex error: ${err instanceof Error ? err.message : String(err)}`);
          const r = res as Response | undefined;
          if (r && typeof r.headersSent === "boolean" && !r.headersSent && typeof r.status === "function") {
            r.status(502).json({ statusCode: 502, message: "Module upstream unavailable" });
          }
        },
      },
    });
    app.use(proxy);
    log.log(`${logId}: mounted regex proxy (${envVar}) -> ${target}`);
  }
}

/** @deprecated use mountModuleUpstreamProxies */
export function mountOutboundUpstreamProxy(app: INestApplication): void {
  mountModuleUpstreamProxies(app);
}

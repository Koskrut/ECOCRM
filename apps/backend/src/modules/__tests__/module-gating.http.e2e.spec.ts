import "reflect-metadata";

import assert from "node:assert/strict";
import { afterEach, describe, it } from "node:test";
import { Module } from "@nestjs/common";
import { APP_GUARD } from "@nestjs/core";
import { NestFactory } from "@nestjs/core";

import { JwtAuthGuard } from "../../auth/jwt-auth.guard";
import { RolesGuard } from "../../auth/roles.guard";
import { signJwt } from "../../auth/jwt";

import { ModuleAccessGuard } from "../gating/module-access.guard";
import { EnabledModulesProvider } from "../enabled/enabled-modules.provider";
import { LicenseStateProvider } from "../license/license-state.provider";
import { ModuleIds, type ModuleId } from "../module-ids";
import { MODULE_REGISTRY } from "../module-registry";
import { ModuleStateService } from "../module-state.service";

import { SystemController } from "../../system/system.controller";
import { PaymentsController } from "../../payments/payments.controller";
import { OutboundVoiceWebhookController } from "../../outbound/outbound-voice-webhook.controller";

import { PaymentsService } from "../../payments/payments.service";
import { OutboundVoiceWebhookService } from "../../outbound/outbound-voice-webhook.service";

let enabledForTest = new Set<ModuleId>();

class TestEnabledModulesProvider extends EnabledModulesProvider {
  constructor(private readonly enabled: Set<ModuleId>) {
    super();
  }
  async getEnabledModules() {
    return { enabledModules: this.enabled, source: "system_setting" as const };
  }
}

class TestLicenseStateProvider extends LicenseStateProvider {
  async getLicenseState() {
    const all = new Set(Object.keys(MODULE_REGISTRY) as ModuleId[]);
    return { isValid: true, licensedModules: all };
  }
}

@Module({
  controllers: [SystemController, PaymentsController, OutboundVoiceWebhookController],
  providers: [
    ModuleStateService,
    {
      provide: EnabledModulesProvider,
      useFactory: () => new TestEnabledModulesProvider(enabledForTest),
    },
    { provide: LicenseStateProvider, useClass: TestLicenseStateProvider },
    { provide: PaymentsService, useValue: { list: async () => ({ items: [], total: 0 }) } },
    { provide: OutboundVoiceWebhookService, useValue: { handleWebhook: async () => ({ ok: true }) } },
    { provide: APP_GUARD, useClass: JwtAuthGuard },
    { provide: APP_GUARD, useClass: RolesGuard },
    { provide: APP_GUARD, useClass: ModuleAccessGuard },
  ],
})
class TestHttpModule {}

async function createApp(params: { gatingEnabled: boolean; enabledModules: ModuleId[] }) {
  const prevGating = process.env.MODULE_GATING_ENABLED;
  const prevJwtSecret = process.env.JWT_SECRET;

  process.env.MODULE_GATING_ENABLED = params.gatingEnabled ? "true" : "false";
  process.env.JWT_SECRET = process.env.JWT_SECRET ?? "test_jwt_secret";

  enabledForTest = new Set<ModuleId>(params.enabledModules);
  const app = await NestFactory.create(TestHttpModule, { logger: false });
  const server = await app.listen(0);
  const addr = server.address();
  assert(addr && typeof addr === "object" && "port" in addr);
  const baseUrl = `http://127.0.0.1:${addr.port}`;

  const token = signJwt(
    { sub: "test-user", email: "test@example.com", role: "ADMIN", fullName: "Test Admin" },
    process.env.JWT_SECRET!,
    { expiresInSeconds: 60 },
  );

  async function close() {
    await app.close();
    if (prevGating === undefined) delete process.env.MODULE_GATING_ENABLED;
    else process.env.MODULE_GATING_ENABLED = prevGating;
    if (prevJwtSecret === undefined) delete process.env.JWT_SECRET;
    else process.env.JWT_SECRET = prevJwtSecret;
  }

  return { app, baseUrl, token, close };
}

async function jsonFetch(url: string, init?: RequestInit) {
  const res = await fetch(url, init);
  const text = await res.text();
  const body = text ? (JSON.parse(text) as unknown) : null;
  return { res, body };
}

describe("pilot module gating (HTTP smoke)", () => {
  let current: Awaited<ReturnType<typeof createApp>> | null = null;

  afterEach(async () => {
    if (current) await current.close();
    current = null;
  });

  it("guard off: pilot endpoints are not blocked by gating", async () => {
    current = await createApp({
      gatingEnabled: false,
      enabledModules: [ModuleIds.VoiceOutbound, ModuleIds.Finance, ModuleIds.IntegrationsTelegram, ModuleIds.CoreCrm],
    });

    // Outbound webhook is public; should not 404 due to gating
    const out = await jsonFetch(`${current.baseUrl}/integrations/outbound-voice/webhook`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({}),
    });
    assert.notEqual(out.res.status, 404);

    // Payments requires auth; use JWT
    const pay = await jsonFetch(`${current.baseUrl}/payments`, {
      method: "GET",
      headers: { authorization: `Bearer ${current.token}` },
    });
    assert.notEqual(pay.res.status, 404);
  });

  it("guard on: ineffective module => 404 on tagged endpoint (outbound)", async () => {
    current = await createApp({
      gatingEnabled: true,
      enabledModules: [ModuleIds.CoreCrm, ModuleIds.Finance, ModuleIds.IntegrationsTelegram], // VoiceOutbound disabled
    });

    const out = await jsonFetch(`${current.baseUrl}/integrations/outbound-voice/webhook`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({}),
    });
    assert.equal(out.res.status, 404);
  });

  it("guard on: ineffective module => 404 on tagged endpoint (payments)", async () => {
    current = await createApp({
      gatingEnabled: true,
      enabledModules: [ModuleIds.CoreCrm, ModuleIds.VoiceOutbound, ModuleIds.IntegrationsTelegram], // Finance disabled
    });

    const pay = await jsonFetch(`${current.baseUrl}/payments`, {
      method: "GET",
      headers: { authorization: `Bearer ${current.token}` },
    });
    assert.equal(pay.res.status, 404);
  });

  it("GET /system/modules reflects effective=false for disabled module (smoke)", async () => {
    current = await createApp({
      gatingEnabled: true,
      enabledModules: [ModuleIds.CoreCrm, ModuleIds.Finance, ModuleIds.IntegrationsTelegram], // VoiceOutbound disabled
    });

    const sys = await jsonFetch(`${current.baseUrl}/system/modules`, {
      method: "GET",
      headers: { authorization: `Bearer ${current.token}` },
    });
    assert.equal(sys.res.status, 200);
    assert(sys.body && typeof sys.body === "object" && "modules" in (sys.body as any));

    const modules = (sys.body as { modules: Array<{ id: ModuleId; enabled: boolean; effective: boolean }> }).modules;
    const voice = modules.find((m) => m.id === ModuleIds.VoiceOutbound);
    assert(voice, "voice outbound module should be present");
    assert.equal(voice.enabled, false);
    assert.equal(voice.effective, false);
  });
});


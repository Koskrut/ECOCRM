import { Inject, Injectable, Logger, OnApplicationBootstrap } from "@nestjs/common";
import { Cron } from "@nestjs/schedule";
import { createHash } from "node:crypto";
import { hostname, networkInterfaces } from "node:os";
import backendPackageJson from "../../package.json";
import type { ModuleId } from "../modules/module-ids";
import { MODULE_REGISTRY } from "../modules/module-registry";
import { EnabledModulesProvider } from "../modules/enabled/enabled-modules.provider";
import { VERSION } from "../version";
import type { SystemControlPlaneDto } from "./dto/system-control-plane.dto";

const PHONE_HOME_CRON = "*/2 * * * *";
const REQUEST_TIMEOUT_MS = 5000;
const BOOTED_AT_ISO = new Date(Date.now() - process.uptime() * 1000).toISOString();

@Injectable()
export class ControlPlanePhoneHomeService implements OnApplicationBootstrap {
  private readonly logger = new Logger(ControlPlanePhoneHomeService.name);
  private readonly controlPlaneUrl = process.env.CONTROL_PLANE_URL;
  private readonly controlPlaneToken =
    process.env.CONTROL_PLANE_TOKEN ?? process.env.CONTROL_PLANE_INSTALLATION_TOKEN;
  private readonly installationId = process.env.CONTROL_PLANE_INSTALLATION_ID;
  private lastAttemptAtMs: number | null = null;
  private lastSuccessAtMs: number | null = null;
  private lastHttpStatus: number | null = null;
  private lastError: string | null = null;

  constructor(
    @Inject(EnabledModulesProvider) private readonly enabledProvider: EnabledModulesProvider,
  ) {}

  getTelemetry(): SystemControlPlaneDto {
    const url = Boolean(this.controlPlaneUrl?.trim());
    const token = Boolean(this.controlPlaneToken?.trim());
    const id = this.installationId?.trim() ?? null;
    return {
      controlPlaneMode: url && token && Boolean(id),
      installationId: id,
      controlPlaneUrlConfigured: url,
      tokenConfigured: token,
      lastAttemptAt: this.lastAttemptAtMs ? new Date(this.lastAttemptAtMs).toISOString() : null,
      lastSuccessAt: this.lastSuccessAtMs ? new Date(this.lastSuccessAtMs).toISOString() : null,
      lastHttpStatus: this.lastHttpStatus,
      lastError: this.lastError,
    };
  }

  async onApplicationBootstrap(): Promise<void> {
    await this.sendPhoneHome("startup");
  }

  @Cron(PHONE_HOME_CRON)
  async sendPhoneHomeByCron(): Promise<void> {
    await this.sendPhoneHome("cron");
  }

  private async sendPhoneHome(reason: "startup" | "cron"): Promise<void> {
    if (!this.controlPlaneUrl || !this.controlPlaneToken || !this.installationId) return;
    if (reason === "cron" && this.lastSuccessAtMs && Date.now() - this.lastSuccessAtMs < 30_000) return;

    this.lastAttemptAtMs = Date.now();
    this.lastError = null;
    this.lastHttpStatus = null;

    try {
      const payload = await this.buildPhoneHomePayload();
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
      const response = await fetch(`${this.controlPlaneUrl.replace(/\/+$/, "")}/api/v1/phone-home`, {
        method: "POST",
        headers: {
          "content-type": "application/json",
          authorization: `Bearer ${this.controlPlaneToken}`,
        },
        body: JSON.stringify(payload),
        signal: controller.signal,
      });
      clearTimeout(timer);

      this.lastHttpStatus = response.status;

      if (!response.ok) {
        const text = await response.text().catch(() => "");
        this.lastError = text ? text.slice(0, 500) : `HTTP ${response.status}`;
        this.logger.warn(
          `Control Plane phone-home rejected: status=${response.status}; reason=${reason}; body=${this.lastError}`,
        );
        return;
      }
      this.lastSuccessAtMs = Date.now();
      this.logger.log(`Control Plane phone-home accepted; reason=${reason}`);
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      this.lastError = msg;
      this.logger.warn(`Control Plane phone-home failed; reason=${reason}; error=${msg}`);
    }
  }

  private async buildPhoneHomePayload() {
    const enabledState = await this.enabledProvider.getEnabledModules();
    const enabledModules = Array.from(enabledState.enabledModules.values()).sort();
    const releaseVersion =
      process.env.CRM_RELEASE_VERSION ??
      String((backendPackageJson as { version?: string }).version ?? VERSION ?? "0.0.0");
    const installedModules = (Object.keys(MODULE_REGISTRY) as ModuleId[]).sort().map((code) => ({
      code,
      version: releaseVersion,
    }));
    return {
      installationId: this.installationId!,
      productVersion: releaseVersion,
      installedModules,
      enabledModules,
      hardwareFingerprint: this.buildHardwareFingerprint(),
      lastBootAt: BOOTED_AT_ISO,
    };
  }

  private buildHardwareFingerprint(): string {
    const interfaces = networkInterfaces();
    const firstMac =
      Object.values(interfaces)
        .flat()
        .find((entry) => entry && !entry.internal && entry.mac && entry.mac !== "00:00:00:00:00:00")?.mac ??
      "unknown";
    const raw = `${hostname()}|${firstMac}`;
    return `sha256:${createHash("sha256").update(raw, "utf8").digest("hex")}`;
  }
}

import { Inject, Injectable, Logger, OnApplicationBootstrap } from "@nestjs/common";
import { Cron } from "@nestjs/schedule";
import { createHash } from "node:crypto";
import { hostname, networkInterfaces } from "node:os";
import backendPackageJson from "../../package.json";
import type { ModuleId } from "../modules/module-ids";
import { MODULE_REGISTRY } from "../modules/module-registry";
import { EnabledModulesProvider } from "../modules/enabled/enabled-modules.provider";
import { VERSION } from "../version";

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
  private lastSentAtMs: number | null = null;

  constructor(
    @Inject(EnabledModulesProvider) private readonly enabledProvider: EnabledModulesProvider,
  ) {}

  async onApplicationBootstrap(): Promise<void> {
    await this.sendPhoneHome("startup");
  }

  @Cron(PHONE_HOME_CRON)
  async sendPhoneHomeByCron(): Promise<void> {
    await this.sendPhoneHome("cron");
  }

  private async sendPhoneHome(reason: "startup" | "cron"): Promise<void> {
    if (!this.controlPlaneUrl || !this.controlPlaneToken || !this.installationId) return;
    if (reason === "cron" && this.lastSentAtMs && Date.now() - this.lastSentAtMs < 30_000) return;

    try {
      const payload = await this.buildPhoneHomePayload();
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
      const response = await fetch(`${this.controlPlaneUrl}/api/v1/phone-home`, {
        method: "POST",
        headers: {
          "content-type": "application/json",
          authorization: `Bearer ${this.controlPlaneToken}`,
        },
        body: JSON.stringify(payload),
        signal: controller.signal,
      });
      clearTimeout(timer);

      if (!response.ok) {
        this.logger.warn(`Control Plane phone-home rejected: status=${response.status}; reason=${reason}`);
        return;
      }
      this.lastSentAtMs = Date.now();
      this.logger.log(`Control Plane phone-home accepted; reason=${reason}`);
    } catch {
      this.logger.warn(`Control Plane phone-home failed; reason=${reason}`);
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

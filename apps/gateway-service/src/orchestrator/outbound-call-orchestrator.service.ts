import { Injectable } from "@nestjs/common";
import type { GatewayProviderLabel, SessionEntity } from "../contracts/gateway.types";
import { SessionRegistryService } from "../sessions/session-registry.service";
import { LifecycleRunnerService } from "./lifecycle-runner.service";
import { Inject } from "@nestjs/common";
import type { AppConfig } from "../config/configuration";
import { CONFIG } from "../config/config.module";
import { StructuredLogger } from "../common/structured-logger";

@Injectable()
export class OutboundCallOrchestratorService {
  constructor(
    private readonly registry: SessionRegistryService,
    private readonly lifecycle: LifecycleRunnerService,
    @Inject(CONFIG) private readonly config: AppConfig,
    private readonly log: StructuredLogger,
  ) {}

  providerLabel(): GatewayProviderLabel {
    return this.config.gatewayProviderMode === "kyivstar_openai" ? "kyivstar_openai" : "mock";
  }

  enqueueFlow(session: SessionEntity, fetchImpl?: typeof fetch): void {
    setImmediate(() => {
      const runReal = this.shouldRunRealForSession(session);
      const run = runReal
        ? this.lifecycle.runRealLifecycle(session, fetchImpl)
        : this.lifecycle.runMockLifecycle(session, fetchImpl);
      run.catch((e) => {
        this.log.error("Lifecycle failed", {
          externalSessionId: session.externalSessionId,
          attemptId: session.attemptId,
        });
        this.log.error(e instanceof Error ? e.message : String(e), {});
        void this.registry.transition(session.externalSessionId, "failed", "fail");
      });
    });
  }

  private shouldRunRealForSession(session: SessionEntity): boolean {
    if (this.config.gatewayProviderMode !== "kyivstar_openai") return false;
    if (!this.config.realModeEnabled) return false;
    if (this.config.realModePercent >= 100) return true;
    const hash = simpleHash(`${session.attemptId}:${session.externalSessionId}`) % 100;
    return hash < this.config.realModePercent;
  }
}

function simpleHash(value: string): number {
  let h = 0;
  for (let i = 0; i < value.length; i++) {
    h = (h * 31 + value.charCodeAt(i)) >>> 0;
  }
  return h;
}

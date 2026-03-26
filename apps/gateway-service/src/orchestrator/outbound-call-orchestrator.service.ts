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

  enqueueMockFlow(session: SessionEntity, fetchImpl?: typeof fetch): void {
    setImmediate(() => {
      this.lifecycle.runMockLifecycle(session, fetchImpl).catch((e) => {
        this.log.error("Lifecycle failed", {
          externalSessionId: session.externalSessionId,
          attemptId: session.attemptId,
        });
        this.log.error(e instanceof Error ? e.message : String(e), {});
        void this.registry.transition(session.externalSessionId, "failed", "fail");
      });
    });
  }
}

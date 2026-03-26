import { Inject, Injectable } from "@nestjs/common";
import type { SessionStore } from "../storage/session-store.interface";
import type {
  GatewayProviderLabel,
  MockOutcome,
  SessionEntity,
  SessionLifecycleStatus,
  SessionSubStatuses,
} from "../contracts/gateway.types";
import { assertTransition, type TransitionReason } from "./session-state-machine";
import { CorrelationIdService } from "./correlation-id.service";
import { StructuredLogger } from "../common/structured-logger";

function timestampKeyForLifecycle(
  to: SessionLifecycleStatus,
): keyof SessionEntity["timestamps"] | undefined {
  switch (to) {
    case "starting":
      return "enteredStartingAt";
    case "ringing":
      return "enteredRingingAt";
    case "answered":
      return "enteredAnsweredAt";
    case "ai_active":
      return "enteredAiActiveAt";
    case "transfer_requested":
      return "enteredTransferRequestedAt";
    case "transferred":
      return "enteredTransferredAt";
    case "completed":
      return "enteredCompletedAt";
    case "failed":
      return "enteredFailedAt";
    default:
      return undefined;
  }
}

const defaultSubStatuses = (): SessionSubStatuses => ({
  transcriptStatus: "pending",
  summaryStatus: "pending",
  classificationStatus: "pending",
  catalogIntentStatus: "pending",
  callbackIntentStatus: "pending",
  transferStatus: "pending",
});

@Injectable()
export class SessionRegistryService {
  constructor(
    @Inject("SessionStore") private readonly store: SessionStore,
    private readonly ids: CorrelationIdService,
    private readonly log: StructuredLogger,
  ) {}

  createSession(input: {
    attemptId: string;
    campaignId: string;
    scenarioCode: string;
    scenarioVersion: string;
    scenarioKey: string;
    phone: string;
    phoneNormalized: string | null;
    leadId: string | null;
    contactId: string | null;
    companyId: string | null;
    mockOutcome: MockOutcome;
    providerLabel: GatewayProviderLabel;
    webhookUrl: string | null;
    webhookSecretHeader: string;
    context: Record<string, unknown>;
  }): SessionEntity {
    const externalSessionId = this.ids.newExternalSessionId();
    const now = new Date().toISOString();
    const session: SessionEntity = {
      externalSessionId,
      attemptId: input.attemptId,
      campaignId: input.campaignId,
      scenarioCode: input.scenarioCode,
      scenarioVersion: input.scenarioVersion,
      scenarioKey: input.scenarioKey,
      phone: input.phone,
      phoneNormalized: input.phoneNormalized,
      leadId: input.leadId,
      contactId: input.contactId,
      companyId: input.companyId,
      mockOutcome: input.mockOutcome,
      lifecycleStatus: "queued",
      subStatuses: defaultSubStatuses(),
      correlationIds: {
        externalSessionId,
        providerCallId: null,
        openaiCallId: null,
        recordingId: null,
        transcriptId: null,
      },
      providerSessionId: null,
      providerLabel: input.providerLabel,
      webhookUrl: input.webhookUrl,
      webhookSecretHeader: input.webhookSecretHeader,
      context: input.context,
      timestamps: {
        createdAt: now,
        updatedAt: now,
        enteredQueuedAt: now,
      },
    };
    this.store.save(session);
    return session;
  }

  get(externalSessionId: string): SessionEntity | undefined {
    return this.store.getByExternalId(externalSessionId);
  }

  transition(externalSessionId: string, to: SessionLifecycleStatus, reason: TransitionReason): SessionEntity | undefined {
    const cur = this.store.getByExternalId(externalSessionId);
    if (!cur) return undefined;
    const fromState = cur.lifecycleStatus;
    assertTransition(fromState, to, reason);
    const now = new Date().toISOString();
    if (fromState !== to) {
      this.log.log("fsm_transition", {
        fromState,
        toState: to,
        externalSessionId,
        attemptId: cur.attemptId,
        timestamp: now,
        reason: String(reason),
      });
    }
    const tsKey = timestampKeyForLifecycle(to);
    const timestamps = { ...cur.timestamps, updatedAt: now };
    if (tsKey) {
      (timestamps as Record<string, string>)[tsKey] = now;
    }
    return this.store.update(externalSessionId, {
      lifecycleStatus: to,
      timestamps,
    });
  }

  patch(externalSessionId: string, patch: Partial<SessionEntity>): SessionEntity | undefined {
    return this.store.update(externalSessionId, patch);
  }
}

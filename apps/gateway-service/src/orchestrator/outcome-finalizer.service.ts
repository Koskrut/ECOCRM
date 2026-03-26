import { Injectable } from "@nestjs/common";
import type { FinalOutcomePayload, MockOutcome, SessionEntity } from "../contracts/gateway.types";
import { buildFinalOutcome } from "../tools/finalize-outcome.tool";

@Injectable()
export class OutcomeFinalizerService {
  finalize(session: SessionEntity, mockOutcome: MockOutcome): FinalOutcomePayload {
    void session;
    return buildFinalOutcome(mockOutcome);
  }
}

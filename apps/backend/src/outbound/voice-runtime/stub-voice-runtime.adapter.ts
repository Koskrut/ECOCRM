import { Injectable } from "@nestjs/common";
import { randomUUID } from "node:crypto";
import type { OutboundAttemptForDial, VoiceInitiateResult, VoiceRuntimeAdapter } from "./voice-runtime.types";
import { VOICE_PROVIDER_STUB } from "./voice-runtime.types";

@Injectable()
export class StubVoiceRuntimeAdapter implements VoiceRuntimeAdapter {
  async initiateOutboundCall(
    _attempt: OutboundAttemptForDial,
    _contextPack: Record<string, unknown>,
  ): Promise<VoiceInitiateResult> {
    return {
      provider: VOICE_PROVIDER_STUB,
      providerSessionId: `stub_${randomUUID()}`,
    };
  }
}

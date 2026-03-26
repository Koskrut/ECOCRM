import { Injectable } from "@nestjs/common";
import { randomUUID } from "crypto";
import type { TelephonyCallHandle, TelephonyProvider } from "./telephony-provider.interface";

/**
 * Simulated telephony for mock mode — no real PSTN/SIP.
 */
@Injectable()
export class MockTelephonyProvider implements TelephonyProvider {
  async createOutboundLeg(input: {
    externalSessionId: string;
    e164Phone: string;
    attemptId: string;
  }): Promise<TelephonyCallHandle> {
    void input;
    return { providerCallId: `mock-tel-${randomUUID()}` };
  }

  async getCallStatus(providerCallId: string): Promise<{ status: string }> {
    void providerCallId;
    return { status: "mock_active" };
  }

  async transferCall(providerCallId: string, target: string): Promise<void> {
    void providerCallId;
    void target;
  }

  async hangupCall(providerCallId: string): Promise<void> {
    void providerCallId;
  }
}

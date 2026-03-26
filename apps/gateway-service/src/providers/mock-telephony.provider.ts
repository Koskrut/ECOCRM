import { Injectable } from "@nestjs/common";
import { randomUUID } from "crypto";
import type { TelephonyCallHandle, TelephonyEvent, TelephonyProvider } from "./telephony-provider.interface";

/**
 * Simulated telephony for mock mode — no real PSTN/SIP.
 */
@Injectable()
export class MockTelephonyProvider implements TelephonyProvider {
  private readonly listeners = new Set<(event: TelephonyEvent) => void>();

  async createOutboundLeg(input: {
    externalSessionId: string;
    e164Phone: string;
    attemptId: string;
  }): Promise<TelephonyCallHandle> {
    const handle = { providerCallId: `mock-tel-${randomUUID()}`, providerSessionId: `mock-sip-${randomUUID()}` };
    queueMicrotask(() => {
      this.emit({
        externalSessionId: input.externalSessionId,
        providerCallId: handle.providerCallId,
        providerSessionId: handle.providerSessionId,
        state: "ringing",
        occurredAt: new Date().toISOString(),
      });
    });
    return handle;
  }

  async getCallStatus(providerCallId: string): Promise<{ status: "dialing" | "ringing" | "answered" | "completed" | "failed"; reason?: string }> {
    void providerCallId;
    return { status: "answered" };
  }

  async transferCall(providerCallId: string, target: string): Promise<void> {
    void providerCallId;
    void target;
  }

  async hangupCall(providerCallId: string): Promise<void> {
    void providerCallId;
  }

  subscribe(listener: (event: TelephonyEvent) => void): () => void {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  }

  private emit(event: TelephonyEvent): void {
    for (const listener of this.listeners) {
      listener(event);
    }
  }
}

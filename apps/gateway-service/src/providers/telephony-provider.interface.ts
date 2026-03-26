export type TelephonyCallHandle = {
  providerCallId: string;
  providerSessionId?: string | null;
};

export type TelephonyCallState = "dialing" | "ringing" | "answered" | "completed" | "failed";

export type TelephonyEvent = {
  externalSessionId: string;
  providerCallId: string;
  providerSessionId?: string | null;
  state: TelephonyCallState;
  reason?: string;
  occurredAt: string;
};

export interface TelephonyProvider {
  createOutboundLeg(input: {
    externalSessionId: string;
    e164Phone: string;
    attemptId: string;
  }): Promise<TelephonyCallHandle>;

  getCallStatus(providerCallId: string): Promise<{ status: TelephonyCallState; reason?: string }>;

  transferCall(providerCallId: string, target: string): Promise<void>;

  hangupCall(providerCallId: string): Promise<void>;

  /**
   * Provider may emit asynchronous call state updates.
   * Return unsubscribe function.
   */
  subscribe(listener: (event: TelephonyEvent) => void): () => void;
}

export type TelephonyCallHandle = {
  providerCallId: string;
};

export interface TelephonyProvider {
  createOutboundLeg(input: {
    externalSessionId: string;
    e164Phone: string;
    attemptId: string;
  }): Promise<TelephonyCallHandle>;

  getCallStatus(providerCallId: string): Promise<{ status: string }>;

  transferCall(providerCallId: string, target: string): Promise<void>;

  hangupCall(providerCallId: string): Promise<void>;
}

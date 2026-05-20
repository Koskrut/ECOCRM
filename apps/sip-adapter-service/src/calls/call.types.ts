export type CallStatus = "dialing" | "ringing" | "answered" | "completed" | "failed";

export type CallRecord = {
  callId: string;
  externalSessionId: string;
  attemptId: string;
  destination: string;
  status: CallStatus;
  fsUuid: string | null;
  bridgeUuid: string | null;
  mediaAttached: boolean;
  symmetricRtp: boolean;
  rtpRemoteAddress: string | null;
  rtpRemotePort: number | null;
  codec: "alaw" | "mulaw";
  failureReason: string | null;
  createdAt: string;
  updatedAt: string;
};

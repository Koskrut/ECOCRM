import { apiGet } from "../client";
import type { ManualCallOutcome } from "./manual-calling";

export type CallsHistoryRowKind = "CALL" | "MANUAL_ORPHAN";

export type CallsHistoryTarget = {
  kind: "LEAD" | "CONTACT";
  id: string;
  displayName: string;
  phone: string | null;
  companyName: string | null;
};

export type CallsHistoryItem = {
  rowKind: CallsHistoryRowKind;
  id: string;
  sortAt: string;
  provider: string | null;
  direction: string | null;
  startedAt: string | null;
  endedAt: string | null;
  durationSec: number | null;
  talkSec: number | null;
  waitingSec: number | null;
  status: string | null;
  recordingUrl: string | null;
  recordingStatus: string | null;
  fromDisplay: string | null;
  toDisplay: string | null;
  manager: { id: string; fullName: string | null } | null;
  isInternalCall: boolean;
  target: CallsHistoryTarget | null;
  manualOutcome: ManualCallOutcome | null;
  manualNote: string | null;
  manualCompletedAt: string | null;
  manualUser: { id: string; fullName: string | null } | null;
};

export type ListCallsHistoryParams = {
  page?: number;
  pageSize?: number;
  outcome?: ManualCallOutcome;
  from?: string;
  to?: string;
  recording?: "yes" | "no" | "any";
  direction?: "INBOUND" | "OUTBOUND" | "UNKNOWN";
  manualOnly?: boolean;
  userId?: string;
  provider?: string;
  q?: string;
};

export const callsApi = {
  listHistory: (params?: ListCallsHistoryParams) =>
    apiGet<{ items: CallsHistoryItem[]; total: number; page: number; pageSize: number }>(
      "/calls/history",
      params as Record<string, unknown>,
    ),
};

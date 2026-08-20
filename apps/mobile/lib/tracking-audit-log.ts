import AsyncStorage from "@react-native-async-storage/async-storage";

const TRACKING_AUDIT_LOG_KEY = "tracking_audit_log_v1";
const MAX_ENTRIES = 300;

export type FlushReason = "interval" | "app_resume" | "manual" | "watchdog";
export type SampleSource = "live_callback" | "replay_buffer" | "retry_flush";

export type TrackingSampleAuditEntry = {
  kind: "sample";
  at: string;
  sampleId: string;
  shiftId: string | null;
  deviceId: string | null;
  clientRecordedAt: string;
  lat: number;
  lng: number;
  accuracyM: number | null;
  source: SampleSource;
  batchId: string;
  attempt: number;
};

export type TrackingBatchAuditEntry = {
  kind: "batch";
  at: string;
  batchId: string;
  shiftId: string | null;
  count: number;
  sampleIdsHead: string[];
  sampleIdsTail: string[];
  reason: FlushReason;
};

export type TrackingAuditEntry = TrackingSampleAuditEntry | TrackingBatchAuditEntry;

function summarizeSampleIds(ids: string[]): { head: string[]; tail: string[] } {
  if (ids.length <= 10) return { head: ids, tail: [] };
  return { head: ids.slice(0, 5), tail: ids.slice(-5) };
}

export function buildBatchSamplesSummary(ids: string[]): string {
  const { head, tail } = summarizeSampleIds(ids);
  const tailPart = tail.length > 0 ? ` tail=${tail.join(",")}` : "";
  return `head=${head.join(",")}${tailPart}`;
}

async function readAuditEntries(): Promise<TrackingAuditEntry[]> {
  const raw = await AsyncStorage.getItem(TRACKING_AUDIT_LOG_KEY);
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw) as TrackingAuditEntry[];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

async function writeAuditEntries(entries: TrackingAuditEntry[]): Promise<void> {
  await AsyncStorage.setItem(
    TRACKING_AUDIT_LOG_KEY,
    JSON.stringify(entries.slice(0, MAX_ENTRIES)),
  );
}

export async function appendTrackingAudit(entry: TrackingAuditEntry): Promise<void> {
  const rows = await readAuditEntries();
  rows.unshift(entry);
  await writeAuditEntries(rows);
}

export async function logBatchAudit(input: {
  batchId: string;
  shiftId: string | null;
  sampleIds: string[];
  reason: FlushReason;
}): Promise<void> {
  const summary = summarizeSampleIds(input.sampleIds);
  await appendTrackingAudit({
    kind: "batch",
    at: new Date().toISOString(),
    batchId: input.batchId,
    shiftId: input.shiftId,
    count: input.sampleIds.length,
    sampleIdsHead: summary.head,
    sampleIdsTail: summary.tail,
    reason: input.reason,
  });
}

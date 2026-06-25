import AsyncStorage from "@react-native-async-storage/async-storage";

import { apiFetch, ApiError } from "@/lib/api";

export type OfflineJobKind =
  | "visitStart"
  | "visitComplete"
  | "taskComplete"
  | "taskUpdate";

export type OfflineJob = {
  id: string;
  kind: OfflineJobKind;
  createdAt: string;
  attempts: number;
  lastError?: string | null;
  payload: Record<string, unknown>;
};

const STORAGE_KEY = "offline_jobs_v1";

function nowIso(): string {
  return new Date().toISOString();
}

function newId(): string {
  return `${Date.now()}_${Math.random().toString(16).slice(2)}`;
}

export function isOfflineLikeError(e: unknown): boolean {
  if (!e) return false;
  if (e instanceof ApiError) return false;
  const msg = e instanceof Error ? e.message : String(e);
  return /Network request failed|Failed to fetch|NetworkError|timeout/i.test(msg);
}

async function readJobs(): Promise<OfflineJob[]> {
  const raw = await AsyncStorage.getItem(STORAGE_KEY);
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw) as OfflineJob[];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

async function writeJobs(jobs: OfflineJob[]): Promise<void> {
  if (jobs.length === 0) {
    await AsyncStorage.removeItem(STORAGE_KEY);
    return;
  }
  await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(jobs));
}

export async function listOfflineJobs(): Promise<OfflineJob[]> {
  return await readJobs();
}

export async function enqueueOfflineJob(
  kind: OfflineJobKind,
  payload: Record<string, unknown>,
): Promise<OfflineJob> {
  const jobs = await readJobs();
  const job: OfflineJob = {
    id: newId(),
    kind,
    createdAt: nowIso(),
    attempts: 0,
    lastError: null,
    payload,
  };
  jobs.push(job);
  await writeJobs(jobs);
  return job;
}

async function runJob(job: OfflineJob, token: string): Promise<void> {
  switch (job.kind) {
    case "visitStart": {
      const visitId = String(job.payload.visitId ?? "");
      const body = (job.payload.body ?? {}) as Record<string, unknown>;
      await apiFetch(`/visits/${encodeURIComponent(visitId)}/start`, {
        method: "POST",
        body: JSON.stringify(body),
        token,
      });
      return;
    }
    case "visitComplete": {
      const visitId = String(job.payload.visitId ?? "");
      const body = (job.payload.body ?? {}) as Record<string, unknown>;
      await apiFetch(`/visits/${encodeURIComponent(visitId)}/complete`, {
        method: "POST",
        body: JSON.stringify(body),
        token,
      });
      return;
    }
    case "taskComplete": {
      const taskId = String(job.payload.taskId ?? "");
      await apiFetch(`/tasks/${encodeURIComponent(taskId)}/complete`, {
        method: "POST",
        token,
      });
      return;
    }
    case "taskUpdate": {
      const taskId = String(job.payload.taskId ?? "");
      const body = (job.payload.body ?? {}) as Record<string, unknown>;
      await apiFetch(`/tasks/${encodeURIComponent(taskId)}`, {
        method: "PATCH",
        body: JSON.stringify(body),
        token,
      });
      return;
    }
  }
}

export async function flushOfflineJobs(opts: {
  token: string;
  max?: number;
}): Promise<{ sent: number; remaining: number; lastError: string | null }> {
  const max = typeof opts.max === "number" && opts.max > 0 ? opts.max : 50;
  const jobs = await readJobs();
  if (jobs.length === 0) return { sent: 0, remaining: 0, lastError: null };

  let sent = 0;
  let lastError: string | null = null;
  const next: OfflineJob[] = [];

  for (const job of jobs) {
    if (sent >= max) {
      next.push(job);
      continue;
    }
    try {
      await runJob(job, opts.token);
      sent += 1;
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      lastError = msg;
      next.push({
        ...job,
        attempts: job.attempts + 1,
        lastError: msg,
      });
    }
  }

  await writeJobs(next);
  return { sent, remaining: next.length, lastError };
}


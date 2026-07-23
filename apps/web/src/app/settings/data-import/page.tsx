"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { apiHttp } from "@/lib/api/client";
import { HelpHint } from "@/components/help/HelpHint";

export default function DataImportSettingsPage() {
  const [role, setRole] = useState<string | null>(null);
  const [csv, setCsv] = useState(
    "phone,first_name,last_name\n+380501112233,Test,Import\n",
  );
  const [busy, setBusy] = useState(false);
  const [jobId, setJobId] = useState<string | null>(null);
  const [result, setResult] = useState<unknown>(null);
  const [jobs, setJobs] = useState<unknown[]>([]);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    apiHttp
      .get<{ user?: { role?: string } }>("/auth/me")
      .then((r) => setRole(r.data?.user?.role ?? null))
      .catch(() => setRole(null));
  }, []);

  const refreshJobs = async () => {
    const r = await apiHttp.get<{ items?: unknown[] }>("/data-import/jobs?limit=20");
    setJobs(r.data?.items ?? []);
  };

  useEffect(() => {
    if (role !== "ADMIN") return;
    void refreshJobs().catch(() => {});
  }, [role]);

  const upload = async () => {
    setBusy(true);
    setErr(null);
    setResult(null);
    try {
      const r = await apiHttp.post<{ jobId: string }>("/data-import/jobs/contacts", {
        csvText: csv,
        fileName: "contacts.csv",
      });
      setJobId(r.data.jobId);
      setResult(r.data);
      await refreshJobs();
    } catch (e: unknown) {
      const msg =
        e && typeof e === "object" && "message" in e ? String((e as { message?: string }).message) : "Upload failed";
      setErr(msg);
    } finally {
      setBusy(false);
    }
  };

  const validate = async () => {
    if (!jobId) return;
    setBusy(true);
    setErr(null);
    try {
      const r = await apiHttp.post(`/data-import/jobs/${jobId}/validate`, {});
      setResult(r.data);
      await refreshJobs();
    } catch (e: unknown) {
      const msg =
        e && typeof e === "object" && "message" in e ? String((e as { message?: string }).message) : "Validate failed";
      setErr(msg);
    } finally {
      setBusy(false);
    }
  };

  const commit = async () => {
    if (!jobId) return;
    setBusy(true);
    setErr(null);
    try {
      const r = await apiHttp.post(`/data-import/jobs/${jobId}/commit`, {});
      setResult(r.data);
      await refreshJobs();
    } catch (e: unknown) {
      const msg =
        e && typeof e === "object" && "message" in e ? String((e as { message?: string }).message) : "Commit failed";
      setErr(msg);
    } finally {
      setBusy(false);
    }
  };

  const runLegacy = async () => {
    setBusy(true);
    setErr(null);
    setResult(null);
    try {
      const r = await apiHttp.post("/data-import/contacts/csv", { csvText: csv, fileName: "contacts.csv" });
      setResult(r.data);
      await refreshJobs();
    } catch (e: unknown) {
      const msg =
        e && typeof e === "object" && "message" in e ? String((e as { message?: string }).message) : "Import failed";
      setErr(msg);
    } finally {
      setBusy(false);
    }
  };

  if (role !== "ADMIN") {
    return (
      <div className="p-6">
        <p className="text-sm text-zinc-600">Доступ тільки для ADMIN.</p>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-zinc-50 p-6">
      <div className="mx-auto max-w-3xl">
        <Link href="/settings" className="text-sm text-zinc-600 hover:text-zinc-900">
          ← Налаштування
        </Link>
        <div className="mt-2 flex items-start justify-between gap-4">
          <h1 className="text-2xl font-bold text-zinc-900">Імпорт контактів (CSV)</h1>
          <HelpHint routeKey="settings.data-import" />
        </div>
        <p className="mt-1 text-sm text-zinc-500">
          Заголовок: <code className="font-mono">phone,first_name,last_name</code>
        </p>
        <textarea
          className="mt-4 h-48 w-full rounded-lg border border-zinc-200 bg-white p-3 font-mono text-xs"
          value={csv}
          onChange={(e) => setCsv(e.target.value)}
        />
        <div className="mt-3 flex flex-wrap gap-2">
          <button
            type="button"
            disabled={busy}
            onClick={() => void upload()}
            className="rounded-lg bg-zinc-900 px-4 py-2 text-sm font-medium text-white disabled:opacity-50"
          >
            1. Upload job
          </button>
          <button
            type="button"
            disabled={busy || !jobId}
            onClick={() => void validate()}
            className="rounded-lg border border-zinc-300 bg-white px-4 py-2 text-sm font-medium text-zinc-800 disabled:opacity-50"
          >
            2. Validate
          </button>
          <button
            type="button"
            disabled={busy || !jobId}
            onClick={() => void commit()}
            className="rounded-lg border border-zinc-300 bg-white px-4 py-2 text-sm font-medium text-zinc-800 disabled:opacity-50"
          >
            3. Commit
          </button>
          <button
            type="button"
            disabled={busy}
            onClick={() => void runLegacy()}
            className="rounded-lg border border-dashed border-zinc-400 px-4 py-2 text-sm text-zinc-600 disabled:opacity-50"
          >
            One-shot (legacy)
          </button>
        </div>
        {jobId ? <p className="mt-2 text-xs text-zinc-500">Job id: {jobId}</p> : null}
        {err ? <p className="mt-2 text-sm text-red-600">{err}</p> : null}
        {result ? (
          <pre className="mt-4 overflow-x-auto rounded-lg border border-zinc-200 bg-white p-3 text-xs">
            {JSON.stringify(result, null, 2)}
          </pre>
        ) : null}
        <div className="mt-8">
          <h2 className="text-sm font-semibold text-zinc-800">Recent jobs</h2>
          <pre className="mt-2 overflow-x-auto rounded-lg border border-zinc-200 bg-white p-3 text-xs">
            {JSON.stringify(jobs, null, 2)}
          </pre>
        </div>
      </div>
    </div>
  );
}

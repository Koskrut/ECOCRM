"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { useEffect, useState } from "react";
import { apiHttp } from "@/lib/api/client";

type RecordRow = { id: string; data: Record<string, unknown>; createdAt: string };

export default function CustomEntityRecordsPage() {
  const params = useParams();
  const key = typeof params?.key === "string" ? params.key : "";
  const [rows, setRows] = useState<RecordRow[]>([]);
  const [err, setErr] = useState<string | null>(null);
  const [json, setJson] = useState('{\n  "title": "Example"\n}');

  useEffect(() => {
    if (!key) return;
    let cancelled = false;
    apiHttp
      .get<{ items?: RecordRow[] }>(`/custom-entities/definitions/${encodeURIComponent(key)}/records`)
      .then((r) => {
        if (!cancelled) setRows(r.data?.items ?? []);
      })
      .catch(() => {
        if (!cancelled) setErr("Не вдалося завантажити записи");
      });
    return () => {
      cancelled = true;
    };
  }, [key]);

  const create = () => {
    setErr(null);
    try {
      const data = JSON.parse(json) as Record<string, unknown>;
      void apiHttp
        .post(`/custom-entities/definitions/${encodeURIComponent(key)}/records`, { data })
        .then(() =>
          apiHttp
            .get<{ items?: RecordRow[] }>(`/custom-entities/definitions/${encodeURIComponent(key)}/records`)
            .then((r) => setRows(r.data?.items ?? [])),
        )
        .catch(() => setErr("Create failed"));
    } catch {
      setErr("Invalid JSON");
    }
  };

  return (
    <div className="min-h-screen bg-zinc-50 p-6">
      <div className="mx-auto max-w-4xl space-y-4">
        <Link href="/settings/metadata/custom-entities" className="text-sm text-zinc-600 hover:text-zinc-900">
          ← Custom entities
        </Link>
        <h1 className="text-2xl font-bold text-zinc-900">Records: {key}</h1>
        {err ? <p className="text-sm text-red-600">{err}</p> : null}
        <div className="rounded-lg border border-zinc-200 bg-white p-3">
          <h2 className="text-sm font-semibold">New record (JSON data)</h2>
          <textarea
            className="mt-2 h-32 w-full rounded border border-zinc-200 bg-zinc-50 p-2 font-mono text-xs"
            value={json}
            onChange={(e) => setJson(e.target.value)}
          />
          <button
            type="button"
            className="mt-2 rounded bg-zinc-900 px-3 py-1.5 text-xs font-medium text-white"
            onClick={() => void create()}
          >
            Create
          </button>
        </div>
        <ul className="space-y-2">
          {rows.map((r) => (
            <li key={r.id} className="rounded-lg border border-zinc-200 bg-white p-3 text-xs">
              <div className="font-mono text-zinc-500">{r.id}</div>
              <pre className="mt-1 overflow-x-auto">{JSON.stringify(r.data, null, 2)}</pre>
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}

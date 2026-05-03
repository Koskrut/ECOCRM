"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { apiHttp } from "@/lib/api/client";

type Rule = { id: string; key: string; name: string; triggerType: string; isActive?: boolean };

type Execution = {
  id: string;
  ruleId: string;
  status: string;
  createdAt: string;
  error?: string | null;
  rule?: { key: string; name: string };
};

const DEFAULT_RULE_JSON = `{
  "key": "demo.rule",
  "name": "Demo rule",
  "entityType": "CONTACT",
  "triggerType": "RECORD_CREATED",
  "conditions": { "all": [] },
  "actions": [
    {
      "type": "call_webhook",
      "config": { "url": "https://example.com", "method": "POST", "headers": {}, "bodyTemplate": "{}" }
    }
  ],
  "rateLimitPerEntityPerHour": 10,
  "isActive": false
}`;

export default function WorkflowsMetadataPage() {
  const [role, setRole] = useState<string | null>(null);
  const [rules, setRules] = useState<Rule[]>([]);
  const [executions, setExecutions] = useState<Execution[]>([]);
  const [ruleJson, setRuleJson] = useState(DEFAULT_RULE_JSON);
  const [err, setErr] = useState<string | null>(null);
  const [msg, setMsg] = useState<string | null>(null);

  useEffect(() => {
    apiHttp
      .get<{ user?: { role?: string } }>("/auth/me")
      .then((r) => setRole(r.data?.user?.role ?? null))
      .catch(() => setRole(null));
  }, []);

  const refresh = () => {
    return Promise.all([
      apiHttp.get<Rule[]>("/workflows/rules"),
      apiHttp.get<Execution[]>("/workflows/executions?limit=40"),
    ])
      .then(([r1, r2]) => {
        setRules(Array.isArray(r1.data) ? r1.data : []);
        setExecutions(Array.isArray(r2.data) ? r2.data : []);
      })
      .catch(() => setErr("Не вдалося завантажити workflows"));
  };

  useEffect(() => {
    if (role !== "ADMIN") return;
    void refresh();
  }, [role]);

  const createRule = async () => {
    setErr(null);
    setMsg(null);
    try {
      const body = JSON.parse(ruleJson) as Record<string, unknown>;
      await apiHttp.post("/workflows/rules", body);
      setMsg("Rule saved");
      await refresh();
    } catch (e: unknown) {
      const m = e instanceof SyntaxError ? "Invalid JSON" : String(e);
      setErr(m);
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
      <div className="mx-auto max-w-5xl space-y-6">
        <Link href="/settings/metadata" className="text-sm text-zinc-600 hover:text-zinc-900">
          ← Metadata hub
        </Link>
        <h1 className="mt-2 text-2xl font-bold text-zinc-900">Workflows</h1>
        {err ? <p className="mt-2 text-sm text-red-600">{err}</p> : null}
        {msg ? <p className="text-sm text-emerald-700">{msg}</p> : null}

        <div className="rounded-lg border border-zinc-200 bg-white p-3">
          <h2 className="text-sm font-semibold text-zinc-900">Rules ({rules.length})</h2>
          <ul className="mt-2 space-y-2">
            {rules.map((w) => (
              <li key={w.id} className="rounded-lg border border-zinc-100 px-3 py-2 text-sm">
                <span className="font-medium">{w.name}</span>{" "}
                <span className="font-mono text-xs text-zinc-500">{w.key}</span> — {w.triggerType}{" "}
                <span className="text-xs text-zinc-400">{w.isActive ? "active" : "inactive"}</span>
              </li>
            ))}
          </ul>
        </div>

        <div className="rounded-lg border border-zinc-200 bg-white p-3">
          <h2 className="text-sm font-semibold text-zinc-900">Constructor (JSON)</h2>
          <p className="mt-1 text-xs text-zinc-500">
            Мінімальний чернетковий редактор. Для production додайте UI-степпер та валідацію з бекенду.
          </p>
          <textarea
            className="mt-2 h-64 w-full rounded border border-zinc-200 bg-zinc-50 p-2 font-mono text-xs"
            value={ruleJson}
            onChange={(e) => setRuleJson(e.target.value)}
          />
          <button
            type="button"
            className="mt-2 rounded bg-zinc-900 px-3 py-1.5 text-xs font-medium text-white"
            onClick={() => void createRule()}
          >
            POST rule
          </button>
        </div>

        <div className="rounded-lg border border-zinc-200 bg-white p-3">
          <h2 className="text-sm font-semibold text-zinc-900">Execution log (recent)</h2>
          <ul className="mt-2 max-h-96 space-y-1 overflow-y-auto text-xs text-zinc-700">
            {executions.map((ex) => (
              <li key={ex.id} className="rounded border border-zinc-100 px-2 py-1">
                <span className="font-medium">{ex.status}</span> · {ex.rule?.key ?? ex.ruleId} ·{" "}
                {new Date(ex.createdAt).toLocaleString()}
                {ex.error ? <span className="block text-red-600">{ex.error}</span> : null}
              </li>
            ))}
          </ul>
        </div>
      </div>
    </div>
  );
}

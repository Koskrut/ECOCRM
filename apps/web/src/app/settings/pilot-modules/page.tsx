"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { apiHttp } from "@/lib/api/client";
import { ModuleIds, type ModuleId } from "@/lib/modules/module-ids";
import { useModules } from "@/lib/modules/useModules";

const PILOTS: ModuleId[] = [
  ModuleIds.VoiceOutbound,
  ModuleIds.Finance,
  ModuleIds.IntegrationsTelegram,
];

const LABELS: Record<string, string> = {
  [ModuleIds.VoiceOutbound]: "AI Calls / Outbound",
  [ModuleIds.Finance]: "Finance / Payments",
  [ModuleIds.IntegrationsTelegram]: "Telegram Inbox",
};

export default function PilotModulesSettingsPage() {
  const { modules, refreshModules } = useModules();
  const [role, setRole] = useState<string | null | undefined>(undefined);
  const [toggles, setToggles] = useState<Record<string, boolean> | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [ok, setOk] = useState<string | null>(null);

  useEffect(() => {
    apiHttp
      .get<{ user?: { role?: string } }>("/auth/me")
      .then((r) => setRole(r.data?.user?.role ?? null))
      .catch(() => setRole(null));
  }, []);

  useEffect(() => {
    if (modules === null || role !== "ADMIN") return;
    const next: Record<string, boolean> = {};
    for (const id of PILOTS) {
      const m = modules.find((x) => x.id === id);
      next[id] = m?.enabled ?? false;
    }
    setToggles(next);
  }, [modules, role]);

  const save = useCallback(async () => {
    if (!toggles) return;
    setSaving(true);
    setError(null);
    setOk(null);
    try {
      const enabled = PILOTS.filter((id) => toggles[id]);
      await apiHttp.put("/system/modules/enabled", { enabled });
      setOk("Збережено.");
      refreshModules();
    } catch (e: unknown) {
      const data = (e as { response?: { data?: { message?: string } } })?.response?.data;
      const msg = data?.message;
      setError(typeof msg === "string" ? msg : "Не вдалося зберегти");
    } finally {
      setSaving(false);
    }
  }, [toggles, refreshModules]);

  if (role === undefined) {
    return <div className="p-6 text-sm text-zinc-500">Завантаження…</div>;
  }
  if (role !== "ADMIN") {
    return <div className="p-6 text-sm text-zinc-600">Доступ лише для ADMIN.</div>;
  }
  if (!toggles) {
    return <div className="p-6 text-sm text-zinc-500">Завантаження модулів…</div>;
  }

  return (
    <div className="mx-auto max-w-xl">
      <Link
        href="/settings"
        className="text-sm text-zinc-600 hover:text-zinc-900"
      >
        ← Settings
      </Link>
      <h1 className="mt-2 text-2xl font-bold text-zinc-900">Pilot modules</h1>
      <p className="mt-1 text-sm text-zinc-500">
        Увімкнені pilot-розширення зберігаються в системі. Ядро CRM завжди активне (не вимикається).
      </p>

      <div className="mt-6 space-y-4 rounded-lg border border-zinc-200 bg-white p-5 shadow-sm">
        <div className="flex items-center justify-between gap-3 border-b border-zinc-100 pb-3">
          <span className="text-sm font-medium text-zinc-900">CRM Core</span>
          <span className="text-xs font-medium text-emerald-700">Завжди увімкнено</span>
        </div>
        {PILOTS.map((id) => (
          <label
            key={id}
            className="flex cursor-pointer items-center justify-between gap-3 border-b border-zinc-50 py-2 last:border-0"
          >
            <span className="text-sm text-zinc-800">{LABELS[id] ?? id}</span>
            <input
              type="checkbox"
              className="size-4 rounded border-zinc-300"
              checked={toggles[id] ?? false}
              onChange={(e) =>
                setToggles((prev) => (prev ? { ...prev, [id]: e.target.checked } : prev))
              }
            />
          </label>
        ))}
      </div>

      {error ? (
        <p className="mt-4 text-sm text-red-700">{error}</p>
      ) : null}
      {ok ? (
        <p className="mt-4 text-sm text-emerald-800">{ok}</p>
      ) : null}

      <div className="mt-6">
        <button
          type="button"
          onClick={() => void save()}
          disabled={saving}
          className="rounded-lg bg-zinc-900 px-4 py-2 text-sm font-medium text-white hover:bg-zinc-800 disabled:opacity-50"
        >
          {saving ? "Збереження…" : "Зберегти"}
        </button>
      </div>
    </div>
  );
}

"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { apiHttp } from "@/lib/api/client";
import { getUserFriendlyApiError } from "@/lib/api/errors";

type UpdateStatus = {
  mode: "operator_only" | "agent_available";
  state: string;
  currentVersion: string | null;
  latestVersion: string | null;
  targetVersion: string | null;
  canUpdate: boolean;
  reason: string;
  cpReachable: boolean;
  updaterReachable: boolean;
  activeJobId: string | null;
  lastJobId: string | null;
};

type UpdatePreflight = {
  ok: boolean;
  message: string;
  details: Record<string, unknown>;
  suggestedVersion: string | null;
};

type UpdateJob = {
  id: string;
  status: string;
  message: string;
  backupPath: string | null;
  logTail: string[];
  fromVersion: string | null;
  toVersion: string | null;
};

export default function SettingsHealthPage() {
  const [role, setRole] = useState<string | null>(null);
  const [release, setRelease] = useState<unknown>(null);
  const [license, setLicense] = useState<unknown>(null);
  const [variant, setVariant] = useState<unknown>(null);
  const [modules, setModules] = useState<unknown>(null);
  const [controlPlane, setControlPlane] = useState<unknown>(null);
  const [updateStatus, setUpdateStatus] = useState<UpdateStatus | null>(null);
  const [preflight, setPreflight] = useState<UpdatePreflight | null>(null);
  const [job, setJob] = useState<UpdateJob | null>(null);
  const [isPreflighting, setIsPreflighting] = useState(false);
  const [isApplying, setIsApplying] = useState(false);
  const [manualTargetVersion, setManualTargetVersion] = useState("");
  const [err, setErr] = useState<string | null>(null);

  const agentReady = updateStatus?.mode === "agent_available" && updateStatus.updaterReachable;
  const effectiveTargetVersion = (manualTargetVersion.trim() || updateStatus?.targetVersion || "").trim();
  const canRunApply =
    agentReady &&
    !updateStatus?.activeJobId &&
    (updateStatus?.canUpdate || Boolean(manualTargetVersion.trim()));

  useEffect(() => {
    apiHttp
      .get<{ user?: { role?: string } }>("/auth/me")
      .then((r) => setRole(r.data?.user?.role ?? null))
      .catch(() => setRole(null));
  }, []);

  useEffect(() => {
    if (role !== "ADMIN") return;
    let cancelled = false;
    setErr(null);
    Promise.all([
      apiHttp.get("/system/release"),
      apiHttp.get("/system/license-status"),
      apiHttp.get("/system/backend-variant"),
      apiHttp.get("/system/modules"),
      apiHttp.get("/system/control-plane"),
      apiHttp.get<UpdateStatus>("/system/update-status"),
    ])
      .then(([a, b, c, d, e, f]) => {
        if (cancelled) return;
        setRelease(a.data);
        setLicense(b.data);
        setVariant(c.data);
        setModules(d.data);
        setControlPlane(e.data);
        setUpdateStatus(f.data ?? null);
      })
      .catch(() => {
        if (!cancelled) setErr("Не вдалося завантажити системний стан.");
      });
    return () => {
      cancelled = true;
    };
  }, [role]);

  useEffect(() => {
    if (!updateStatus?.activeJobId) return;
    let stop = false;
    const id = updateStatus.activeJobId;
    const timer = setInterval(() => {
      if (stop) return;
      apiHttp
        .get<UpdateJob>(`/system/update/jobs/${encodeURIComponent(id)}`)
        .then((r) => {
          const data = r.data;
          if (!data) return;
          setJob(data);
          if (data.status === "failed" || data.status === "succeeded") {
            stop = true;
            clearInterval(timer);
            apiHttp.get<UpdateStatus>("/system/update-status").then((s) => setUpdateStatus(s.data ?? null));
          }
        })
        .catch(() => {
          // no-op
        });
    }, 3000);
    return () => {
      stop = true;
      clearInterval(timer);
    };
  }, [updateStatus?.activeJobId]);

  async function refreshUpdateStatus() {
    try {
      const res = await apiHttp.get<UpdateStatus>("/system/update-status");
      setUpdateStatus(res.data ?? null);
    } catch (e) {
      setErr(getUserFriendlyApiError(e, "Не вдалося оновити статус оновлення."));
    }
  }

  async function runPreflight() {
    setIsPreflighting(true);
    setErr(null);
    try {
      const res = await apiHttp.post<UpdatePreflight>("/system/update/preflight", {});
      setPreflight(res.data ?? null);
      await refreshUpdateStatus();
    } catch (e) {
      setErr(getUserFriendlyApiError(e, "Перевірка перед оновленням не вдалася."));
    } finally {
      setIsPreflighting(false);
    }
  }

  async function runApply() {
    setIsApplying(true);
    setErr(null);
    try {
      const body = manualTargetVersion.trim() ? { targetVersion: manualTargetVersion.trim() } : {};
      const res = await apiHttp.post<UpdateJob>("/system/update/apply", body);
      setJob(res.data ?? null);
      await refreshUpdateStatus();
    } catch (e) {
      setErr(getUserFriendlyApiError(e, "Не вдалося запустити оновлення."));
    } finally {
      setIsApplying(false);
    }
  }

  if (role !== "ADMIN") {
    return (
      <div className="p-6">
        <p className="text-sm text-zinc-600">Доступ тільки для ADMIN.</p>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-zinc-50 p-6">
      <div className="mx-auto max-w-4xl">
        <Link href="/settings" className="text-sm text-zinc-600 hover:text-zinc-900">
          ← Налаштування
        </Link>
        <h1 className="mt-2 text-2xl font-bold text-zinc-900">Стан системи</h1>
        {err ? <p className="mt-2 text-sm text-red-600">{err}</p> : null}
        <div className="mt-4 space-y-4">
          <section className="rounded-lg border border-zinc-200 bg-white p-4">
            <h2 className="text-sm font-semibold text-zinc-900">Оновлення системи</h2>
            <p className="mt-2 text-xs text-zinc-600">
              Режим:{" "}
              <span className="font-medium text-zinc-900">
                {updateStatus?.mode === "agent_available" ? "агент на хості" : "тільки оператор"}
              </span>
              {" · "}
              Поточна: <span className="font-medium text-zinc-900">{updateStatus?.currentVersion ?? "unknown"}</span>
              {" · "}
              Цільова (CP): <span className="font-medium text-zinc-900">{updateStatus?.targetVersion ?? "none"}</span>
              {" · "}
              Стан: <span className="font-medium text-zinc-900">{updateStatus?.state ?? "idle"}</span>
            </p>
            <p className="mt-1 text-xs text-zinc-600">
              Control Plane: {updateStatus?.cpReachable ? "online" : "offline"} · Агент:{" "}
              {updateStatus?.updaterReachable ? "online" : "offline"}
            </p>
            <p className="mt-2 text-xs text-zinc-700">{updateStatus?.reason ?? "Статус недоступний"}</p>
            {updateStatus?.mode !== "agent_available" ? (
              <p className="mt-2 rounded border border-amber-200 bg-amber-50 px-2 py-1.5 text-xs text-amber-900">
                Щоб кнопки працювали, задайте <code className="text-[11px]">UPDATER_AGENT_URL</code> у backend і
                запустіть <code className="text-[11px]">npm run dev:updater</code> на хості.
              </p>
            ) : null}
            {updateStatus?.mode === "agent_available" && !updateStatus.cpReachable ? (
              <p className="mt-2 rounded border border-amber-200 bg-amber-50 px-2 py-1.5 text-xs text-amber-900">
                Control Plane недоступний. Можна вказати цільову версію вручну нижче або підняти CP (
                <code className="text-[11px]">CONTROL_PLANE_URL</code>).
              </p>
            ) : null}
            <div className="mt-3 flex flex-wrap items-end gap-2">
              <label className="flex min-w-[10rem] flex-col gap-1 text-xs text-zinc-600">
                Цільова версія (опційно)
                <input
                  type="text"
                  value={manualTargetVersion}
                  onChange={(e) => setManualTargetVersion(e.target.value)}
                  placeholder={updateStatus?.targetVersion ?? "0.2.77"}
                  className="rounded border border-zinc-300 px-2 py-1.5 text-xs text-zinc-900"
                />
              </label>
              {effectiveTargetVersion ? (
                <p className="pb-1 text-xs text-zinc-500">Буде застосовано: {effectiveTargetVersion}</p>
              ) : null}
            </div>
            <div className="mt-3 flex gap-2">
              <button
                type="button"
                onClick={refreshUpdateStatus}
                className="rounded border border-zinc-300 px-3 py-1.5 text-xs font-medium text-zinc-800 hover:bg-zinc-50"
              >
                Оновити статус
              </button>
              <button
                type="button"
                onClick={runPreflight}
                disabled={isPreflighting || updateStatus?.mode !== "agent_available"}
                className="rounded border border-zinc-300 px-3 py-1.5 text-xs font-medium text-zinc-800 disabled:cursor-not-allowed disabled:opacity-50 hover:bg-zinc-50"
              >
                {isPreflighting ? "Перевірка..." : "Перевірити"}
              </button>
              <button
                type="button"
                onClick={runApply}
                disabled={isApplying || !canRunApply}
                className="rounded bg-zinc-900 px-3 py-1.5 text-xs font-medium text-white disabled:cursor-not-allowed disabled:opacity-50 hover:bg-zinc-700"
              >
                {isApplying ? "Оновлення..." : "Запустити оновлення"}
              </button>
            </div>
            {preflight ? (
              <pre className="mt-3 overflow-x-auto rounded border border-zinc-200 bg-zinc-50 p-2 text-[11px]">
                {JSON.stringify(preflight, null, 2)}
              </pre>
            ) : null}
            {job ? (
              <pre className="mt-3 overflow-x-auto rounded border border-zinc-200 bg-zinc-50 p-2 text-[11px]">
                {JSON.stringify(job, null, 2)}
              </pre>
            ) : null}
          </section>
          <pre className="overflow-x-auto rounded-lg border border-zinc-200 bg-white p-3 text-xs">
            {JSON.stringify({ release, license, variant, controlPlane, modules, updateStatus, preflight, job }, null, 2)}
          </pre>
        </div>
      </div>
    </div>
  );
}

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
  autoUpdateEnabled: boolean;
  activeJobId: string | null;
  lastJobId: string | null;
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

function updateHeadline(status: UpdateStatus | null, job: UpdateJob | null): string {
  if (job?.status === "running" || job?.status === "queued") return "Оновлення системи…";
  if (job?.status === "succeeded") return "Оновлення завершено";
  if (job?.status === "failed") return "Не вдалося оновити систему";
  if (!status) return "Перевірка оновлень…";
  if (status.state === "updating" || status.activeJobId) return "Оновлення системи…";
  if (status.state === "update_available" && status.targetVersion) {
    return `Доступне оновлення ${status.targetVersion}`;
  }
  if (status.state === "up_to_date" && status.currentVersion) {
    return `Версія ${status.currentVersion} — актуальна`;
  }
  if (status.currentVersion) return `Версія ${status.currentVersion}`;
  return "Стан оновлень";
}

function updateSubtitle(status: UpdateStatus | null, job: UpdateJob | null): string | null {
  if (job?.message && (job.status === "running" || job.status === "queued")) return job.message;
  if (job?.status === "succeeded" && job.toVersion) return `Встановлено версію ${job.toVersion}`;
  if (job?.status === "failed") return "Зверніться до підтримки, якщо проблема повториться.";
  if (!status) return null;
  if (status.state === "update_available" && status.targetVersion && status.currentVersion) {
    return `Поточна версія ${status.currentVersion}. Натисніть «Оновити» — система зробить решту сама.`;
  }
  if (status.state === "up_to_date") return "Нових оновлень немає.";
  if (status.autoUpdateEnabled && status.mode === "agent_available") {
    return "Нові версії встановлюються автоматично з Control Plane.";
  }
  if (status.canUpdate && status.targetVersion) {
    return "Натисніть «Оновити» — система зробить решту сама.";
  }
  if (status.state === "idle") return "Нових оновлень не знайдено.";
  return null;
}

function formatCheckedAt(iso: string): string {
  try {
    return new Intl.DateTimeFormat("uk-UA", { hour: "2-digit", minute: "2-digit", second: "2-digit" }).format(
      new Date(iso),
    );
  } catch {
    return iso;
  }
}

export default function SettingsHealthPage() {
  const [role, setRole] = useState<string | null>(null);
  const [release, setRelease] = useState<unknown>(null);
  const [license, setLicense] = useState<unknown>(null);
  const [variant, setVariant] = useState<unknown>(null);
  const [modules, setModules] = useState<unknown>(null);
  const [controlPlane, setControlPlane] = useState<unknown>(null);
  const [updateStatus, setUpdateStatus] = useState<UpdateStatus | null>(null);
  const [job, setJob] = useState<UpdateJob | null>(null);
  const [isUpdating, setIsUpdating] = useState(false);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [lastCheckedAt, setLastCheckedAt] = useState<string | null>(null);
  const [manualTargetVersion, setManualTargetVersion] = useState("");
  const [showDiagnostics, setShowDiagnostics] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const isBusy =
    isUpdating ||
    Boolean(updateStatus?.activeJobId) ||
    job?.status === "running" ||
    job?.status === "queued";
  const manualTarget = manualTargetVersion.trim();
  const canUpdateWithManual =
    Boolean(updateStatus?.mode === "agent_available" && updateStatus.updaterReachable && manualTarget) &&
    !isBusy;
  const canUpdateNow =
    (Boolean(updateStatus?.canUpdate) || canUpdateWithManual) && !isBusy;
  const applyTargetVersion = manualTarget || updateStatus?.targetVersion || null;
  const trackingJobId =
    updateStatus?.activeJobId ??
    (job?.status === "running" || job?.status === "queued" ? job.id : null);

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
        setLastCheckedAt(new Date().toISOString());
      })
      .catch(() => {
        if (!cancelled) setErr("Не вдалося завантажити системний стан.");
      });
    return () => {
      cancelled = true;
    };
  }, [role]);

  useEffect(() => {
    if (!trackingJobId) return;
    let stop = false;
    const id = trackingJobId;
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
  }, [trackingJobId]);

  async function refreshUpdateStatus() {
    setIsRefreshing(true);
    setErr(null);
    try {
      const [releaseRes, cpRes, statusRes] = await Promise.all([
        apiHttp.get("/system/release"),
        apiHttp.get("/system/control-plane"),
        apiHttp.get<UpdateStatus>("/system/update-status"),
      ]);
      setRelease(releaseRes.data);
      setControlPlane(cpRes.data);
      setUpdateStatus(statusRes.data ?? null);
      setLastCheckedAt(new Date().toISOString());
    } catch (e) {
      setErr(getUserFriendlyApiError(e, "Не вдалося перевірити оновлення."));
    } finally {
      setIsRefreshing(false);
    }
  }

  async function runUpdate() {
    if (!applyTargetVersion) {
      setErr("Цільова версія не вказана.");
      return;
    }
    setIsUpdating(true);
    setErr(null);
    setJob(null);
    try {
      const preflight = await apiHttp.post<{ ok: boolean; message?: string }>(
        "/system/update/preflight",
        {},
        { timeout: 120_000 },
      );
      if (!preflight.data?.ok) {
        setErr(preflight.data?.message ?? "Оновлення тимчасово недоступне. Зверніться до підтримки.");
        return;
      }
      const body = manualTarget ? { targetVersion: manualTarget } : {};
      const res = await apiHttp.post<UpdateJob>("/system/update/apply", body, { timeout: 120_000 });
      const startedJob = res.data ?? null;
      setJob(startedJob);
      if (startedJob?.id) {
        setUpdateStatus((prev) =>
          prev
            ? {
                ...prev,
                activeJobId: startedJob.id,
                state: "updating",
                canUpdate: false,
              }
            : prev,
        );
      }
      await refreshUpdateStatus();
    } catch (e) {
      setErr(getUserFriendlyApiError(e, "Не вдалося оновити систему. Зверніться до підтримки."));
    } finally {
      setIsUpdating(false);
    }
  }

  if (role !== "ADMIN") {
    return (
      <div>
        <p className="text-sm text-zinc-600">Доступ лише для адміністратора.</p>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-4xl">
        <Link href="/settings" className="text-sm text-zinc-600 hover:text-zinc-900">
          ← Налаштування
        </Link>
        <h1 className="mt-2 text-2xl font-bold text-zinc-900">Стан системи</h1>
        {err ? <p className="mt-2 text-sm text-red-600">{err}</p> : null}
        <div className="mt-4 space-y-4">
          <section className="rounded-lg border border-zinc-200 bg-white p-4">
            <h2 className="text-sm font-semibold text-zinc-900">Оновлення системи</h2>
            <p className="mt-2 text-sm font-medium text-zinc-900">{updateHeadline(updateStatus, job)}</p>
            {updateSubtitle(updateStatus, job) ? (
              <p className="mt-1 text-xs text-zinc-600">{updateSubtitle(updateStatus, job)}</p>
            ) : null}
            {!canUpdateNow && !isBusy && updateStatus?.reason ? (
              <p className="mt-2 text-xs text-zinc-500">{updateStatus.reason}</p>
            ) : null}
            {updateStatus?.mode === "agent_available" && !updateStatus.cpReachable && !isBusy ? (
              <div className="mt-3">
                <label className="flex max-w-xs flex-col gap-1 text-xs text-zinc-600">
                  Цільова версія (Control Plane недоступний)
                  <input
                    type="text"
                    value={manualTargetVersion}
                    onChange={(e) => setManualTargetVersion(e.target.value)}
                    placeholder={updateStatus.targetVersion ?? "0.2.79"}
                    className="rounded border border-zinc-300 px-2 py-1.5 text-sm text-zinc-900"
                  />
                </label>
              </div>
            ) : null}
            {updateStatus?.mode !== "agent_available" && !isBusy ? (
              <p className="mt-2 rounded border border-amber-200 bg-amber-50 px-2 py-1.5 text-xs text-amber-900">
                Щоб оновлення працювало автоматично, переконайтеся що сервіс <code className="text-[11px]">updater</code>{" "}
                запущений (<code className="text-[11px]">compose.client.yml</code>) і backend бачить{" "}
                <code className="text-[11px]">UPDATER_AGENT_URL</code>.
              </p>
            ) : null}
            {updateStatus?.mode === "agent_available" && updateStatus.autoUpdateEnabled && !isBusy ? (
              <p className="mt-2 rounded border border-emerald-200 bg-emerald-50 px-2 py-1.5 text-xs text-emerald-900">
                Автооновлення увімкнено — нова версія з Control Plane буде встановлена без ручного втручання.
              </p>
            ) : null}
            {canUpdateNow ? (
              <button
                type="button"
                onClick={() => void runUpdate()}
                disabled={isUpdating}
                className="mt-4 rounded bg-zinc-900 px-4 py-2 text-sm font-medium text-white hover:bg-zinc-700 disabled:cursor-wait disabled:opacity-60"
              >
                {isUpdating ? "Запуск…" : `Оновити до ${applyTargetVersion}`}
              </button>
            ) : null}
            {isBusy ? (
              <p className="mt-3 text-xs text-zinc-500">Зачекайте, не закривайте сторінку під час оновлення.</p>
            ) : null}
            {!canUpdateNow && !isBusy ? (
              <div className="mt-3 flex flex-wrap items-center gap-x-3 gap-y-1">
                <button
                  type="button"
                  onClick={() => void refreshUpdateStatus()}
                  disabled={isRefreshing}
                  className="text-xs text-zinc-500 underline hover:text-zinc-800 disabled:cursor-wait disabled:no-underline disabled:opacity-60"
                >
                  {isRefreshing ? "Перевірка…" : "Перевірити знову"}
                </button>
                {lastCheckedAt ? (
                  <span className="text-xs text-zinc-400">Остання перевірка: {formatCheckedAt(lastCheckedAt)}</span>
                ) : null}
              </div>
            ) : null}
          </section>
          <button
            type="button"
            onClick={() => setShowDiagnostics((v) => !v)}
            className="text-xs text-zinc-500 underline hover:text-zinc-800"
          >
            {showDiagnostics ? "Сховати технічні деталі" : "Технічні деталі (для підтримки)"}
          </button>
          {showDiagnostics ? (
            <pre className="overflow-x-auto rounded-lg border border-zinc-200 bg-white p-3 text-xs">
              {JSON.stringify({ release, license, variant, controlPlane, modules, updateStatus, job }, null, 2)}
            </pre>
          ) : null}
        </div>
    </div>
  );
}

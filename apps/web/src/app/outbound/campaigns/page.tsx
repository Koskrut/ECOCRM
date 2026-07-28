"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { Plus, X, RefreshCw } from "lucide-react";
import {
  outboundApi,
  type OutboundCampaign,
  type OutboundTargetType,
  type OutboundScenario,
  type CreateCampaignBody,
} from "@/lib/api/resources/outbound";
import { formatDate } from "@/lib/crmDatetime";

const TARGET_LABELS: Record<OutboundTargetType, string> = {
  LEAD: "Ліди",
  CONTACT_DORMANT: "Сплячі контакти",
};

const SCENARIO_TARGET_MAP: Record<string, OutboundTargetType> = {
  LEAD_QUALIFICATION: "LEAD",
  DORMANT_REACTIVATION: "CONTACT_DORMANT",
};

function CampaignStatusBar({ stats }: { stats: Record<string, number> }) {
  const pending = (stats.PENDING ?? 0) + (stats.QUEUED ?? 0);
  const dialing = stats.DIALING ?? 0;
  const completed = stats.COMPLETED ?? 0;
  const failed = (stats.FAILED ?? 0) + (stats.CANCELED ?? 0);

  const items = [
    { label: "У черзі", value: pending, className: "text-blue-700" },
    { label: "Дзвінок", value: dialing, className: "text-amber-600" },
    { label: "Готово", value: completed, className: "text-emerald-700" },
    { label: "Помилка", value: failed, className: "text-red-600" },
  ].filter((i) => i.value > 0);

  if (items.length === 0) {
    return <span className="text-xs text-zinc-400">Ще немає спроб</span>;
  }
  return (
    <span className="flex flex-wrap gap-3">
      {items.map((i) => (
        <span key={i.label} className={`text-xs font-medium ${i.className}`}>
          {i.value} {i.label}
        </span>
      ))}
    </span>
  );
}

function CreateCampaignModal({
  scenarios,
  onClose,
  onCreated,
}: {
  scenarios: OutboundScenario[];
  onClose: () => void;
  onCreated: (c: OutboundCampaign) => void;
}) {
  const [name, setName] = useState("");
  const [scenarioCode, setScenarioCode] = useState(scenarios[0]?.code ?? "");
  const [isActive, setIsActive] = useState(true);
  const [quietStart, setQuietStart] = useState("22:00");
  const [quietEnd, setQuietEnd] = useState("09:00");
  const [enableQuietHours, setEnableQuietHours] = useState(false);
  const [maxCallsPerDay, setMaxCallsPerDay] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const targetType: OutboundTargetType =
    SCENARIO_TARGET_MAP[scenarioCode] ?? "LEAD";

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!name.trim() || !scenarioCode) return;
    setBusy(true);
    setError(null);
    try {
      const body: CreateCampaignBody = {
        name: name.trim(),
        targetType,
        scenarioCode,
        isActive,
        config: {
          ...(maxCallsPerDay && { maxCallsPerDay: parseInt(maxCallsPerDay, 10) }),
          ...(enableQuietHours && { quietHours: { start: quietStart, end: quietEnd } }),
        },
      };
      const created = await outboundApi.createCampaign(body);
      onCreated(created);
    } catch (e) {
      setError(
        (e as { response?: { data?: { message?: string } } })?.response?.data?.message ??
          (e instanceof Error ? e.message : "Не вдалося створити кампанію"),
      );
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 px-4">
      <div className="w-full max-w-md overflow-hidden rounded-2xl bg-white shadow-2xl">
        <div className="flex items-center justify-between border-b border-zinc-100 px-5 py-4">
          <h2 className="text-base font-semibold text-zinc-900">Нова кампанія</h2>
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg p-1 text-zinc-400 hover:bg-zinc-100 hover:text-zinc-700"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        <form onSubmit={(e) => void handleSubmit(e)} className="space-y-4 px-5 py-5">
          {error && (
            <div className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
              {error}
            </div>
          )}

          {/* Name */}
          <div>
            <label className="mb-1 block text-xs font-medium text-zinc-600">
              Назва кампанії <span className="text-red-500">*</span>
            </label>
            <input
              type="text"
              required
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g. Dormant reactivation Q2"
              className="w-full rounded-lg border border-zinc-200 px-3 py-2 text-sm placeholder-zinc-400 focus:outline-none focus:ring-2 focus:ring-blue-300"
            />
          </div>

          {/* Scenario */}
          <div>
            <label className="mb-1 block text-xs font-medium text-zinc-600">
              Сценарій <span className="text-red-500">*</span>
            </label>
            <select
              value={scenarioCode}
              onChange={(e) => setScenarioCode(e.target.value)}
              className="w-full rounded-lg border border-zinc-200 px-3 py-2 text-sm"
            >
              {scenarios.map((s) => (
                <option key={s.code} value={s.code}>
                  {s.name} ({s.code})
                </option>
              ))}
            </select>
            <p className="mt-1 text-xs text-zinc-400">
              Тип цілі: <span className="font-medium text-zinc-600">{TARGET_LABELS[targetType] ?? targetType}</span>
            </p>
          </div>

          {/* Active */}
          <div className="flex items-center gap-3">
            <input
              id="isActive"
              type="checkbox"
              checked={isActive}
              onChange={(e) => setIsActive(e.target.checked)}
              className="h-4 w-4 rounded border-zinc-300"
            />
            <label htmlFor="isActive" className="text-sm text-zinc-700">
              Активувати одразу
            </label>
          </div>

          {/* Max calls per day */}
          <div>
            <label className="mb-1 block text-xs font-medium text-zinc-600">
              Макс. дзвінків на день (необовʼязково)
            </label>
            <input
              type="number"
              min="1"
              value={maxCallsPerDay}
              onChange={(e) => setMaxCallsPerDay(e.target.value)}
              placeholder="Без ліміту"
              className="w-full rounded-lg border border-zinc-200 px-3 py-2 text-sm placeholder-zinc-400 focus:outline-none focus:ring-2 focus:ring-blue-300"
            />
          </div>

          {/* Quiet hours */}
          <div>
            <div className="mb-2 flex items-center gap-3">
              <input
                id="enableQuiet"
                type="checkbox"
                checked={enableQuietHours}
                onChange={(e) => setEnableQuietHours(e.target.checked)}
                className="h-4 w-4 rounded border-zinc-300"
              />
              <label htmlFor="enableQuiet" className="text-xs font-medium text-zinc-600">
                Quiet hours (no calls between)
              </label>
            </div>
            {enableQuietHours && (
              <div className="flex items-center gap-2">
                <input
                  type="time"
                  value={quietStart}
                  onChange={(e) => setQuietStart(e.target.value)}
                  className="rounded-lg border border-zinc-200 px-3 py-2 text-sm"
                />
                <span className="text-xs text-zinc-400">to</span>
                <input
                  type="time"
                  value={quietEnd}
                  onChange={(e) => setQuietEnd(e.target.value)}
                  className="rounded-lg border border-zinc-200 px-3 py-2 text-sm"
                />
              </div>
            )}
          </div>

          <div className="flex gap-3 pt-1">
            <button
              type="submit"
              disabled={busy || !name.trim()}
              className="flex-1 rounded-xl bg-zinc-900 px-4 py-2.5 text-sm font-medium text-white hover:bg-zinc-800 disabled:opacity-50"
            >
              {busy ? (
                <RefreshCw className="mx-auto h-4 w-4 animate-spin" />
              ) : (
                "Створити кампанію"
              )}
            </button>
            <button
              type="button"
              onClick={onClose}
              className="rounded-xl border border-zinc-200 px-4 py-2.5 text-sm text-zinc-600 hover:bg-zinc-50"
            >
              Скасувати
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

export default function CampaignsPage() {
  const [items, setItems] = useState<OutboundCampaign[]>([]);
  const [scenarios, setScenarios] = useState<OutboundScenario[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [togglingId, setTogglingId] = useState<string | null>(null);
  const [showCreate, setShowCreate] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [campaigns, scenarioList] = await Promise.all([
        outboundApi.listCampaigns(),
        outboundApi.listScenarios(),
      ]);
      setItems(campaigns);
      setScenarios(scenarioList);
    } catch (e) {
      setError(
        (e as { response?: { data?: { message?: string } } })?.response?.data?.message ??
          (e instanceof Error ? e.message : "Не вдалося завантажити кампанії"),
      );
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const handleToggle = async (campaign: OutboundCampaign) => {
    setTogglingId(campaign.id);
    try {
      const updated = await outboundApi.setCampaignActive(campaign.id, !campaign.isActive);
      setItems((prev) => prev.map((c) => (c.id === updated.id ? { ...c, ...updated } : c)));
    } catch {
      // silently ignore — user can retry
    } finally {
      setTogglingId(null);
    }
  };

  return (
    <div>
      <div className="mb-4 flex items-center justify-between">
        <p className="text-sm text-zinc-500">
          {loading ? "Завантаження…" : `${items.length} кампаній`}
        </p>
        <button
          type="button"
          onClick={() => setShowCreate(true)}
          className="inline-flex items-center gap-1.5 rounded-xl bg-zinc-900 px-3 py-2 text-sm font-medium text-white hover:bg-zinc-800"
        >
          <Plus className="h-4 w-4" />
          Нова кампанія
        </button>
      </div>

      {error && (
        <div className="mb-4 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          {error}
        </div>
      )}

      <div className="overflow-hidden rounded-xl border border-zinc-200 bg-white shadow-sm">
        <table className="w-full text-left text-sm">
          <thead className="bg-zinc-100/80 text-xs font-medium uppercase text-zinc-500">
            <tr>
              <th className="px-4 py-3">Campaign</th>
              <th className="px-4 py-3">Type</th>
              <th className="px-4 py-3">Scenario</th>
              <th className="px-4 py-3">Attempt stats</th>
              <th className="px-4 py-3">Status</th>
              <th className="px-4 py-3">Updated</th>
              <th className="px-4 py-3" />
            </tr>
          </thead>
          <tbody className="divide-y divide-zinc-100">
            {loading ? (
              <tr>
                <td colSpan={7} className="px-4 py-10 text-center text-zinc-400">
                  Loading campaigns…
                </td>
              </tr>
            ) : items.length === 0 ? (
              <tr>
                <td colSpan={7} className="px-4 py-12 text-center">
                  <div className="flex flex-col items-center gap-2">
                    <span className="text-3xl">📋</span>
                    <p className="font-medium text-zinc-700">No campaigns yet</p>
                    <button
                      type="button"
                      onClick={() => setShowCreate(true)}
                      className="mt-1 text-sm font-medium text-blue-600 hover:underline"
                    >
                      Create your first campaign →
                    </button>
                  </div>
                </td>
              </tr>
            ) : (
              items.map((c) => (
                <tr key={c.id} className="hover:bg-zinc-50/60">
                  <td className="px-4 py-3">
                    <Link
                      href={`/outbound/attempts?campaignId=${c.id}`}
                      className="font-medium text-zinc-900 hover:text-zinc-600 hover:underline"
                    >
                      {c.name}
                    </Link>
                    {c.config?.quietHours && (
                      <p className="mt-0.5 text-xs text-zinc-400">
                        Quiet {c.config.quietHours.start}–{c.config.quietHours.end}
                        {c.config.timezone ? ` (${c.config.timezone})` : ""}
                      </p>
                    )}
                  </td>
                  <td className="px-4 py-3">
                    <span className="rounded-md bg-zinc-100 px-2 py-0.5 text-xs text-zinc-600">
                      {TARGET_LABELS[c.targetType] ?? c.targetType}
                    </span>
                  </td>
                  <td className="px-4 py-3">
                    <span className="rounded-md bg-blue-50 px-2 py-0.5 text-xs font-medium text-blue-700">
                      {c.scenarioCode}
                    </span>
                    <span className="ml-1 text-xs text-zinc-400">v{c.scenarioVersion}</span>
                  </td>
                  <td className="px-4 py-3">
                    <CampaignStatusBar stats={c.statsByStatus} />
                  </td>
                  <td className="px-4 py-3">
                    <button
                      type="button"
                      onClick={() => void handleToggle(c)}
                      disabled={togglingId === c.id}
                      className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-0.5 text-xs font-medium transition-colors disabled:opacity-60 ${
                        c.isActive
                          ? "border-emerald-200 bg-emerald-50 text-emerald-700 hover:bg-emerald-100"
                          : "border-zinc-200 bg-zinc-100 text-zinc-500 hover:bg-zinc-200"
                      }`}
                    >
                      <span
                        className={`h-1.5 w-1.5 rounded-full ${c.isActive ? "bg-emerald-500" : "bg-zinc-400"}`}
                      />
                      {togglingId === c.id ? "…" : c.isActive ? "Active" : "Paused"}
                    </button>
                  </td>
                  <td className="px-4 py-3 text-xs text-zinc-400">
                    {formatDate(c.updatedAt)}
                  </td>
                  <td className="px-4 py-3 text-right">
                    <Link
                      href={`/outbound/attempts?campaignId=${c.id}`}
                      className="text-xs font-medium text-zinc-500 hover:text-zinc-800"
                    >
                      Attempts →
                    </Link>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {showCreate && scenarios.length > 0 && (
        <CreateCampaignModal
          scenarios={scenarios}
          onClose={() => setShowCreate(false)}
          onCreated={(c) => {
            setItems((prev) => [c, ...prev]);
            setShowCreate(false);
          }}
        />
      )}
    </div>
  );
}

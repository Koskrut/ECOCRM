"use client";

import { useEffect, useState } from "react";
import { apiHttp } from "@/lib/api/client";
import { getUserFriendlyApiError } from "@/lib/api/errors";
import { SettingsPageShell } from "@/components/SettingsPageShell";
import { ErrorPanel, PageLoading } from "@/components/feedback";
import { strings } from "@/locales";

const PRESET_PERCENTS = [5, 10, 15, 20, 25, 30] as const;

type OrderLineDiscountsConfig = {
  percents: number[];
};

export default function OrderDiscountsSettingsPage() {
  const t = strings.settings.orderDiscounts;
  const [enabled, setEnabled] = useState<number[]>([...PRESET_PERCENTS]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function load() {
    setLoading(true);
    setError(null);
    try {
      const res = await apiHttp.get<OrderLineDiscountsConfig>("/settings/order-discounts");
      const percents = res.data?.percents ?? [...PRESET_PERCENTS];
      setEnabled(percents);
    } catch (e) {
      setError(getUserFriendlyApiError(e, t.loadError));
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void load();
  }, []);

  function toggle(percent: number) {
    setEnabled((prev) => {
      if (prev.includes(percent)) {
        if (prev.length <= 1) return prev;
        return prev.filter((p) => p !== percent);
      }
      return [...prev, percent].sort((a, b) => a - b);
    });
  }

  async function save() {
    if (enabled.length === 0) {
      setError(t.minOne);
      return;
    }
    setSaving(true);
    setError(null);
    try {
      const res = await apiHttp.patch<OrderLineDiscountsConfig>("/settings/order-discounts", {
        percents: enabled,
      });
      setEnabled(res.data?.percents ?? enabled);
    } catch (e) {
      setError(getUserFriendlyApiError(e, t.saveError));
    } finally {
      setSaving(false);
    }
  }

  if (loading) return <PageLoading />;

  return (
    <SettingsPageShell title={t.title} subtitle={t.desc}>
      {error ? <ErrorPanel message={error} className="mb-4" /> : null}
      <div className="rounded-lg border border-zinc-200 bg-white p-4">
        <p className="mb-4 text-sm text-zinc-600">{t.hint}</p>
        <div className="flex flex-wrap gap-3">
          {PRESET_PERCENTS.map((percent) => {
            const checked = enabled.includes(percent);
            return (
              <label
                key={percent}
                className={`flex cursor-pointer items-center gap-2 rounded-md border px-3 py-2 text-sm ${
                  checked
                    ? "border-zinc-900 bg-zinc-50 font-medium text-zinc-900"
                    : "border-zinc-200 text-zinc-600 hover:bg-zinc-50"
                }`}
              >
                <input
                  type="checkbox"
                  checked={checked}
                  onChange={() => toggle(percent)}
                  className="rounded border-zinc-300"
                />
                {percent}%
              </label>
            );
          })}
        </div>
        <button
          type="button"
          disabled={saving}
          onClick={() => void save()}
          className="mt-4 rounded-md bg-zinc-900 px-4 py-2 text-sm font-medium text-white hover:bg-zinc-800 disabled:opacity-50"
        >
          {saving ? t.saving : t.save}
        </button>
      </div>
    </SettingsPageShell>
  );
}

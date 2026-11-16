"use client";

import { useEffect, useState } from "react";
import { apiHttp } from "@/lib/api/client";
import { getUserFriendlyApiError } from "@/lib/api/errors";
import { SettingsPageShell } from "@/components/SettingsPageShell";
import { ErrorPanel, PageLoading } from "@/components/feedback";
import { strings } from "@/locales";

type OrderSerialNumbersConfig = {
  enabled: boolean;
};

export default function OrderSerialsSettingsPage() {
  const t = strings.settings.orderSerials;
  const [enabled, setEnabled] = useState(false);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    apiHttp
      .get<OrderSerialNumbersConfig>("/settings/order-serials")
      .then((res) => {
        if (!cancelled) setEnabled(res.data?.enabled === true);
      })
      .catch((e) => {
        if (!cancelled) setError(getUserFriendlyApiError(e, t.loadError));
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [t.loadError]);

  async function save() {
    setSaving(true);
    setSaved(false);
    setError(null);
    try {
      const res = await apiHttp.patch<OrderSerialNumbersConfig>("/settings/order-serials", {
        enabled,
      });
      setEnabled(res.data?.enabled === true);
      setSaved(true);
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
        <label className="flex cursor-pointer items-start gap-3">
          <input
            type="checkbox"
            checked={enabled}
            onChange={(e) => {
              setEnabled(e.target.checked);
              setSaved(false);
            }}
            className="mt-1 rounded border-zinc-300"
          />
          <span>
            <span className="block text-sm font-medium text-zinc-900">{t.toggle}</span>
            <span className="mt-1 block text-sm text-zinc-600">{t.toggleHint}</span>
          </span>
        </label>
        <div className="mt-4 flex items-center gap-3">
          <button
            type="button"
            disabled={saving}
            onClick={() => void save()}
            className="rounded-md bg-zinc-900 px-4 py-2 text-sm font-medium text-white hover:bg-zinc-800 disabled:opacity-50"
          >
            {saving ? t.saving : t.save}
          </button>
          {saved ? <span className="text-sm text-emerald-700">{t.saved}</span> : null}
        </div>
      </div>
    </SettingsPageShell>
  );
}

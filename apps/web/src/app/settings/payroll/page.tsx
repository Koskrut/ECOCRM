"use client";

import { useEffect, useState } from "react";
import { apiHttp } from "@/lib/api/client";
import { getUserFriendlyApiError } from "@/lib/api/errors";
import { SettingsPageShell } from "@/components/SettingsPageShell";
import { ErrorPanel, PageLoading } from "@/components/feedback";
import { strings } from "@/locales";

type PayrollCompanyRates = {
  thresholdUah: number;
  percentUpTo: number;
  percentAbove: number;
};

export default function PayrollSettingsPage() {
  const t = strings.settings.payrollPage;
  const [threshold, setThreshold] = useState("25000");
  const [percentUpTo, setPercentUpTo] = useState("2");
  const [percentAbove, setPercentAbove] = useState("2.5");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function load() {
    setLoading(true);
    setError(null);
    try {
      const res = await apiHttp.get<PayrollCompanyRates>("/settings/payroll");
      const data = res.data ?? { thresholdUah: 25000, percentUpTo: 2, percentAbove: 2.5 };
      setThreshold(String(data.thresholdUah));
      setPercentUpTo(String(data.percentUpTo));
      setPercentAbove(String(data.percentAbove));
    } catch (e) {
      setError(getUserFriendlyApiError(e, t.loadError));
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void load();
  }, []);

  async function save() {
    const thresholdUah = parseFloat(threshold.replace(/,/g, "."));
    const up = parseFloat(percentUpTo.replace(/,/g, "."));
    const above = parseFloat(percentAbove.replace(/,/g, "."));
    if (
      !Number.isFinite(thresholdUah) ||
      thresholdUah < 0 ||
      !Number.isFinite(up) ||
      up < 0 ||
      !Number.isFinite(above) ||
      above < 0
    ) {
      setError(t.invalid);
      return;
    }
    setSaving(true);
    setError(null);
    try {
      const res = await apiHttp.patch<PayrollCompanyRates>("/settings/payroll", {
        thresholdUah,
        percentUpTo: up,
        percentAbove: above,
      });
      const data = res.data ?? { thresholdUah, percentUpTo: up, percentAbove: above };
      setThreshold(String(data.thresholdUah));
      setPercentUpTo(String(data.percentUpTo));
      setPercentAbove(String(data.percentAbove));
    } catch (e) {
      setError(getUserFriendlyApiError(e, t.saveError));
    } finally {
      setSaving(false);
    }
  }

  return (
    <SettingsPageShell maxWidthClassName="max-w-xl" title={t.title} subtitle={t.subtitle}>
      {error ? <ErrorPanel variant="inline" message={error} /> : null}
      {loading ? (
        <PageLoading inline />
      ) : (
        <div className="rounded-lg border border-zinc-200 bg-white p-5 shadow-sm">
          <div className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-zinc-700">{t.threshold}</label>
              <input
                type="text"
                inputMode="decimal"
                value={threshold}
                onChange={(e) => setThreshold(e.target.value)}
                className="mt-1 w-full rounded-lg border border-zinc-300 px-3 py-2 text-sm text-zinc-900"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-zinc-700">{t.percentUpTo}</label>
              <input
                type="text"
                inputMode="decimal"
                value={percentUpTo}
                onChange={(e) => setPercentUpTo(e.target.value)}
                className="mt-1 w-full rounded-lg border border-zinc-300 px-3 py-2 text-sm text-zinc-900"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-zinc-700">{t.percentAbove}</label>
              <input
                type="text"
                inputMode="decimal"
                value={percentAbove}
                onChange={(e) => setPercentAbove(e.target.value)}
                className="mt-1 w-full rounded-lg border border-zinc-300 px-3 py-2 text-sm text-zinc-900"
              />
            </div>
            <button
              type="button"
              onClick={() => void save()}
              disabled={saving}
              className="rounded-lg bg-zinc-900 px-4 py-2 text-sm font-medium text-white hover:bg-zinc-800 disabled:opacity-60"
            >
              {saving ? t.saving : t.save}
            </button>
          </div>
        </div>
      )}
    </SettingsPageShell>
  );
}

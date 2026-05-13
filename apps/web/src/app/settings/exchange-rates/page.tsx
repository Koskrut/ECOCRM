"use client";

import { useEffect, useState } from "react";
import { apiHttp } from "@/lib/api/client";
import { getUserFriendlyApiError } from "@/lib/api/errors";
import { SettingsPageShell } from "@/components/SettingsPageShell";
import { ErrorPanel, PageLoading } from "@/components/feedback";

type ExchangeRates = {
  UAH_TO_USD: number;
  EUR_TO_USD: number;
};

export default function ExchangeRatesSettingsPage() {
  const [uahInput, setUahInput] = useState("");
  const [eurInput, setEurInput] = useState("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function load() {
    setLoading(true);
    setError(null);
    try {
      const res = await apiHttp.get<ExchangeRates>("/settings/exchange-rates");
      const data = res.data ?? { UAH_TO_USD: 0.024, EUR_TO_USD: 1.05 };
      setUahInput(data.UAH_TO_USD > 0 ? (1 / data.UAH_TO_USD).toString() : "41.5");
      setEurInput(data.EUR_TO_USD.toString());
    } catch (e) {
      setError(getUserFriendlyApiError(e, "Не вдалося завантажити курси валют."));
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void load();
  }, []);

  async function save() {
    const uahPerUsd = parseFloat(uahInput.replace(/,/g, "."));
    const eur = parseFloat(eurInput.replace(/,/g, "."));
    if (!Number.isFinite(uahPerUsd) || uahPerUsd <= 0 || !Number.isFinite(eur) || eur <= 0) {
      setError("Enter positive numbers for both rates");
      return;
    }
    setSaving(true);
    setError(null);
    try {
      const res = await apiHttp.patch<ExchangeRates>("/settings/exchange-rates", {
        UAH_TO_USD: 1 / uahPerUsd,
        EUR_TO_USD: eur,
      });
      const data = res.data ?? { UAH_TO_USD: 1 / uahPerUsd, EUR_TO_USD: eur };
      setUahInput(data.UAH_TO_USD > 0 ? (1 / data.UAH_TO_USD).toString() : uahInput);
      setEurInput(data.EUR_TO_USD.toString());
    } catch (e) {
      setError(getUserFriendlyApiError(e, "Не вдалося зберегти курси валют."));
    } finally {
      setSaving(false);
    }
  }

  return (
    <SettingsPageShell
      maxWidthClassName="max-w-xl"
      title="Exchange rates"
      subtitle="UAH: how many hryvnias per 1 USD. EUR: how many USD per 1 EUR. Used to convert payments to dollars."
    >
      {error ? <ErrorPanel variant="inline" message={error} /> : null}
      {loading ? (
        <PageLoading inline />
      ) : (
        <div className="rounded-lg border border-zinc-200 bg-white p-5 shadow-sm">
          <div className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-zinc-700">
                1 USD ($) = … UAH (₴)
              </label>
              <input
                type="text"
                inputMode="decimal"
                value={uahInput}
                onChange={(e) => setUahInput(e.target.value)}
                placeholder="41.5"
                className="mt-1 w-full rounded-lg border border-zinc-300 px-3 py-2 text-sm text-zinc-900 placeholder:text-zinc-400"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-zinc-700">
                1 EUR (€) = … USD ($)
              </label>
              <input
                type="text"
                inputMode="decimal"
                value={eurInput}
                onChange={(e) => setEurInput(e.target.value)}
                placeholder="1.05"
                className="mt-1 w-full rounded-lg border border-zinc-300 px-3 py-2 text-sm text-zinc-900 placeholder:text-zinc-400"
              />
            </div>
          </div>
          <div className="mt-5 flex justify-end">
            <button
              type="button"
              onClick={() => void save()}
              disabled={saving}
              className="rounded-lg bg-zinc-900 px-4 py-2 text-sm font-medium text-white hover:bg-zinc-800 disabled:opacity-50"
            >
              {saving ? "Saving…" : "Save"}
            </button>
          </div>
        </div>
      )}
    </SettingsPageShell>
  );
}

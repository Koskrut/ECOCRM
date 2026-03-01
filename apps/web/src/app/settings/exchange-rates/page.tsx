"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { apiHttp } from "@/lib/api/client";

type ExchangeRates = {
  UAH_TO_USD: number;
  EUR_TO_USD: number;
};

function getApiErrorMessage(e: unknown, fallback: string) {
  const msg =
    (e as { response?: { data?: { message?: string; error?: string } } })?.response?.data
      ?.message ??
    (e as { response?: { data?: { message?: string; error?: string } } })?.response?.data?.error;
  return msg ?? (e instanceof Error ? e.message : fallback);
}

export default function ExchangeRatesSettingsPage() {
  const [rates, setRates] = useState<ExchangeRates>({ UAH_TO_USD: 0.024, EUR_TO_USD: 1.05 });
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
      setRates(data);
      setUahInput(
        data.UAH_TO_USD > 0 ? (1 / data.UAH_TO_USD).toString() : "41.5",
      );
      setEurInput(data.EUR_TO_USD.toString());
    } catch (e) {
      setError(getApiErrorMessage(e, "Failed to load exchange rates"));
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
      setRates(data);
      setUahInput(data.UAH_TO_USD > 0 ? (1 / data.UAH_TO_USD).toString() : uahInput);
      setEurInput(data.EUR_TO_USD.toString());
    } catch (e) {
      setError(getApiErrorMessage(e, "Failed to save"));
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="min-h-screen bg-zinc-50 p-6">
      <div className="mx-auto max-w-xl">
        <div className="mb-6">
          <Link
            href="/settings"
            className="inline-flex items-center text-sm text-zinc-600 hover:text-zinc-900"
          >
            ← Back to Settings
          </Link>
          <h1 className="mt-2 text-2xl font-bold text-zinc-900">Exchange rates</h1>
          <p className="mt-1 text-sm text-zinc-500">
            UAH: how many grivnas per 1 USD. EUR: how many USD per 1 EUR. Used to convert payments to dollars.
          </p>
        </div>

        {error && (
          <p className="mb-4 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800">
            {error}
          </p>
        )}

        {loading ? (
          <p className="text-sm text-zinc-500">Loading…</p>
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
      </div>
    </div>
  );
}

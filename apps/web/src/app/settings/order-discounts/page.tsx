"use client";

import { useEffect, useState } from "react";
import { apiHttp } from "@/lib/api/client";
import { getUserFriendlyApiError } from "@/lib/api/errors";
import { SettingsPageShell } from "@/components/SettingsPageShell";
import { ErrorPanel, PageLoading } from "@/components/feedback";
import { strings } from "@/locales";
import {
  ORDER_PROMO_BUY_100_GET_30,
  ORDER_PROMO_QTY_25_MINUS_2,
  type OrderPromoType,
} from "@/lib/order-line-total";

const PRESET_PERCENTS = [5, 10, 15, 20, 25, 30] as const;
const PRESET_PROMOS: OrderPromoType[] = [ORDER_PROMO_BUY_100_GET_30, ORDER_PROMO_QTY_25_MINUS_2];

type OrderLineDiscountsConfig = {
  percents: number[];
  promos?: string[];
};

export default function OrderDiscountsSettingsPage() {
  const t = strings.settings.orderDiscounts;
  const [enabled, setEnabled] = useState<number[]>([...PRESET_PERCENTS]);
  const [enabledPromos, setEnabledPromos] = useState<OrderPromoType[]>([...PRESET_PROMOS]);
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
      const promos = res.data?.promos;
      if (Array.isArray(promos)) {
        setEnabledPromos(
          promos.filter(
            (p): p is OrderPromoType =>
              p === ORDER_PROMO_BUY_100_GET_30 || p === ORDER_PROMO_QTY_25_MINUS_2,
          ),
        );
      } else {
        setEnabledPromos([...PRESET_PROMOS]);
      }
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

  function togglePromo(promo: OrderPromoType) {
    setEnabledPromos((prev) => {
      if (prev.includes(promo)) return prev.filter((p) => p !== promo);
      return [...prev, promo];
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
        promos: enabledPromos,
      });
      setEnabled(res.data?.percents ?? enabled);
      const promos = res.data?.promos;
      if (Array.isArray(promos)) {
        setEnabledPromos(
          promos.filter(
            (p): p is OrderPromoType =>
              p === ORDER_PROMO_BUY_100_GET_30 || p === ORDER_PROMO_QTY_25_MINUS_2,
          ),
        );
      }
    } catch (e) {
      setError(getUserFriendlyApiError(e, t.saveError));
    } finally {
      setSaving(false);
    }
  }

  if (loading) return <PageLoading />;

  const promoLabel = (p: OrderPromoType) =>
    p === ORDER_PROMO_BUY_100_GET_30 ? t.promoBuy100Get30 : t.promoQty25Minus2;

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

        <div className="mt-6 border-t border-zinc-100 pt-4">
          <h3 className="text-sm font-medium text-zinc-900">{t.promosTitle}</h3>
          <p className="mb-3 mt-1 text-sm text-zinc-600">{t.promosHint}</p>
          <div className="flex flex-col gap-2">
            {PRESET_PROMOS.map((promo) => {
              const checked = enabledPromos.includes(promo);
              return (
                <label
                  key={promo}
                  className={`flex cursor-pointer items-start gap-2 rounded-md border px-3 py-2 text-sm ${
                    checked
                      ? "border-zinc-900 bg-zinc-50 font-medium text-zinc-900"
                      : "border-zinc-200 text-zinc-600 hover:bg-zinc-50"
                  }`}
                >
                  <input
                    type="checkbox"
                    checked={checked}
                    onChange={() => togglePromo(promo)}
                    className="mt-0.5 rounded border-zinc-300"
                  />
                  <span>{promoLabel(promo)}</span>
                </label>
              );
            })}
          </div>
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

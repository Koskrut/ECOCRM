"use client";

import { useEffect, useState } from "react";
import { apiHttp } from "@/lib/api/client";
import { getUserFriendlyApiError } from "@/lib/api/errors";
import { SettingsPageShell } from "@/components/SettingsPageShell";
import { ErrorPanel, PageLoading } from "@/components/feedback";
import { strings } from "@/locales";
import {
  catalogFromLegacyPromos,
  type OrderPromoDefinition,
  type OrderPromoKind,
} from "@/lib/order-line-total";

type OrderLineDiscountsConfig = {
  percents: number[];
  promos?: string[];
  catalog?: OrderPromoDefinition[];
};

type PromoDraft = {
  id: string;
  name: string;
  enabled: boolean;
  kind: OrderPromoKind;
  minQty: string;
  payUnits: string;
  freeUnits: string;
  unitOff: string;
};

function newPromoId(): string {
  const alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  let id = "P";
  for (let i = 0; i < 8; i += 1) {
    id += alphabet[Math.floor(Math.random() * alphabet.length)];
  }
  return id;
}

function toDraft(promo: OrderPromoDefinition): PromoDraft {
  const free =
    promo.kind === "pay_ratio" ? Math.max(1, promo.bundleUnits - promo.payUnits) : 1;
  return {
    id: promo.id,
    name: promo.name,
    enabled: promo.enabled,
    kind: promo.kind,
    minQty: String(promo.minQty),
    payUnits: String(promo.payUnits > 0 ? promo.payUnits : 10),
    freeUnits: String(free),
    unitOff: String(promo.unitOff > 0 ? promo.unitOff : 1),
  };
}

function blankPromo(): PromoDraft {
  return {
    id: newPromoId(),
    name: "",
    enabled: true,
    kind: "pay_ratio",
    minQty: "12",
    payUnits: "10",
    freeUnits: "2",
    unitOff: "1",
  };
}

const fieldClass =
  "w-full rounded-md border border-zinc-300 bg-white px-2.5 py-1.5 text-sm text-zinc-900";

export default function OrderDiscountsSettingsPage() {
  const t = strings.settings.orderDiscounts;
  const [percents, setPercents] = useState<string[]>(["5", "10", "15", "20", "25", "30"]);
  const [percentInput, setPercentInput] = useState("");
  const [promos, setPromos] = useState<PromoDraft[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function load() {
    setLoading(true);
    setError(null);
    try {
      const res = await apiHttp.get<OrderLineDiscountsConfig>("/settings/order-discounts");
      const loaded = res.data?.percents ?? [];
      setPercents(loaded.length > 0 ? loaded.map(String) : ["5", "10", "15", "20", "25", "30"]);
      const catalog =
        Array.isArray(res.data?.catalog)
          ? res.data.catalog
          : catalogFromLegacyPromos(res.data?.promos);
      setPromos(catalog.map(toDraft));
    } catch (e) {
      setError(getUserFriendlyApiError(e, t.loadError));
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void load();
  }, []);

  function addPercent() {
    const n = Number(percentInput.replace(",", "."));
    if (!Number.isInteger(n) || n < 1 || n > 100) {
      setError(t.invalidPercent);
      return;
    }
    if (percents.some((p) => Math.trunc(Number(p)) === n)) {
      setError(t.duplicatePercent);
      return;
    }
    setError(null);
    setPercents((prev) => [...prev, String(n)].sort((a, b) => Number(a) - Number(b)));
    setPercentInput("");
  }

  function updatePromo(id: string, patch: Partial<PromoDraft>) {
    setPromos((prev) => prev.map((promo) => (promo.id === id ? { ...promo, ...patch } : promo)));
  }

  async function save() {
    const parsedPercents = percents.map((value) => Number(value));
    if (
      parsedPercents.some(
        (n) => !Number.isFinite(n) || !Number.isInteger(n) || n < 1 || n > 100,
      )
    ) {
      setError(t.invalidPercent);
      return;
    }
    if (new Set(parsedPercents).size !== parsedPercents.length) {
      setError(t.duplicatePercent);
      return;
    }
    if (parsedPercents.length === 0) {
      setError(t.minOne);
      return;
    }
    if (promos.some((promo) => promo.name.trim().length === 0)) {
      setError(t.promoNameRequired);
      return;
    }

    const whole = (value: string) => {
      const n = Number(value);
      return Number.isInteger(n) ? n : Number.NaN;
    };
    const catalog = promos.map((promo) => ({
      id: promo.id,
      name: promo.name.trim(),
      enabled: promo.enabled,
      kind: promo.kind,
      minQty: whole(promo.minQty),
      payUnits: whole(promo.payUnits),
      freeUnits: whole(promo.freeUnits),
      unitOff: Number(promo.unitOff.replace(",", ".")),
    }));
    const numbersOk = catalog.every((promo) => {
      if (!Number.isInteger(promo.minQty) || promo.minQty < 1) return false;
      if (promo.kind === "pay_ratio") {
        return promo.payUnits >= 1 && promo.freeUnits >= 1;
      }
      return Number.isFinite(promo.unitOff) && promo.unitOff > 0;
    });
    if (!numbersOk) {
      setError(t.promoInvalid);
      return;
    }

    setSaving(true);
    setError(null);
    try {
      const res = await apiHttp.patch<OrderLineDiscountsConfig>("/settings/order-discounts", {
        percents: [...parsedPercents].sort((a, b) => a - b),
        catalog,
      });
      const saved = res.data?.percents ?? parsedPercents;
      setPercents(saved.map(String));
      const savedCatalog = Array.isArray(res.data?.catalog) ? res.data.catalog : [];
      setPromos(savedCatalog.map(toDraft));
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
        <div className="flex flex-col gap-2">
          {percents.map((percent, index) => (
            <div key={index} className="flex items-center gap-2">
              <input
                type="number"
                min={1}
                max={100}
                value={percent}
                onChange={(e) =>
                  setPercents((prev) => prev.map((value, i) => (i === index ? e.target.value : value)))
                }
                className="w-24 rounded-md border border-zinc-300 px-2.5 py-1.5 text-sm"
                aria-label={`${percent}%`}
              />
              <span className="text-sm text-zinc-600">%</span>
              <button
                type="button"
                disabled={percents.length <= 1}
                onClick={() => setPercents((prev) => prev.filter((_, i) => i !== index))}
                className="rounded-md px-2 py-1 text-sm text-zinc-500 hover:bg-zinc-100 hover:text-zinc-900 disabled:opacity-40"
              >
                {t.remove}
              </button>
            </div>
          ))}
        </div>
        <div className="mt-3 flex flex-wrap items-center gap-2">
          <input
            type="number"
            min={1}
            max={100}
            value={percentInput}
            placeholder={t.percentPlaceholder}
            onChange={(e) => setPercentInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault();
                addPercent();
              }
            }}
            className="w-40 rounded-md border border-zinc-300 px-2.5 py-1.5 text-sm"
          />
          <button
            type="button"
            onClick={addPercent}
            className="rounded-md border border-zinc-300 px-3 py-1.5 text-sm font-medium text-zinc-800 hover:bg-zinc-50"
          >
            {t.addPercent}
          </button>
        </div>

        <div className="mt-6 border-t border-zinc-100 pt-4">
          <h3 className="text-sm font-medium text-zinc-900">{t.promosTitle}</h3>
          <p className="mb-3 mt-1 text-sm text-zinc-600">{t.promosHint}</p>
          {promos.length === 0 ? <p className="mb-3 text-sm text-zinc-500">{t.emptyPromos}</p> : null}
          <div className="flex flex-col gap-3">
            {promos.map((promo) => (
              <div key={promo.id} className="rounded-md border border-zinc-200 p-3">
                <div className="flex flex-wrap items-start gap-3">
                  <label className="min-w-[12rem] flex-1 text-sm text-zinc-700">
                    {t.promoName}
                    <input
                      value={promo.name}
                      placeholder={t.promoNamePlaceholder}
                      onChange={(e) => updatePromo(promo.id, { name: e.target.value })}
                      className={`${fieldClass} mt-1`}
                    />
                  </label>
                  <label className="w-52 text-sm text-zinc-700">
                    {t.promoKind}
                    <select
                      value={promo.kind}
                      onChange={(e) =>
                        updatePromo(promo.id, { kind: e.target.value as OrderPromoKind })
                      }
                      className={`${fieldClass} mt-1`}
                    >
                      <option value="pay_ratio">{t.promoKindPay}</option>
                      <option value="unit_off">{t.promoKindUnit}</option>
                    </select>
                  </label>
                </div>
                <div className="mt-3 flex flex-wrap gap-3">
                  {promo.kind === "pay_ratio" ? (
                    <>
                      <label className="w-36 text-sm text-zinc-700">
                        {t.payUnits}
                        <input
                          type="number"
                          min={1}
                          value={promo.payUnits}
                          onChange={(e) => updatePromo(promo.id, { payUnits: e.target.value })}
                          className={`${fieldClass} mt-1`}
                        />
                      </label>
                      <label className="w-36 text-sm text-zinc-700">
                        {t.freeUnits}
                        <input
                          type="number"
                          min={1}
                          value={promo.freeUnits}
                          onChange={(e) => updatePromo(promo.id, { freeUnits: e.target.value })}
                          className={`${fieldClass} mt-1`}
                        />
                      </label>
                    </>
                  ) : (
                    <label className="w-36 text-sm text-zinc-700">
                      {t.unitOff}
                      <input
                        type="number"
                        min={0.01}
                        step={0.01}
                        value={promo.unitOff}
                        onChange={(e) => updatePromo(promo.id, { unitOff: e.target.value })}
                        className={`${fieldClass} mt-1`}
                      />
                    </label>
                  )}
                  <label className="w-36 text-sm text-zinc-700">
                    {t.minQty}
                    <input
                      type="number"
                      min={1}
                      value={promo.minQty}
                      onChange={(e) => updatePromo(promo.id, { minQty: e.target.value })}
                      className={`${fieldClass} mt-1`}
                    />
                  </label>
                </div>
                <div className="mt-3 flex items-center justify-between gap-3">
                  <label className="flex items-center gap-2 text-sm text-zinc-700">
                    <input
                      type="checkbox"
                      checked={promo.enabled}
                      onChange={() => updatePromo(promo.id, { enabled: !promo.enabled })}
                      className="rounded border-zinc-300"
                    />
                    {t.promoEnabled}
                  </label>
                  <button
                    type="button"
                    onClick={() => setPromos((prev) => prev.filter((item) => item.id !== promo.id))}
                    className="rounded-md px-2 py-1 text-sm text-zinc-500 hover:bg-zinc-100 hover:text-zinc-900"
                  >
                    {t.remove}
                  </button>
                </div>
              </div>
            ))}
          </div>
          <button
            type="button"
            onClick={() => setPromos((prev) => [...prev, blankPromo()])}
            className="mt-3 rounded-md border border-zinc-300 px-3 py-1.5 text-sm font-medium text-zinc-800 hover:bg-zinc-50"
          >
            {t.addPromo}
          </button>
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

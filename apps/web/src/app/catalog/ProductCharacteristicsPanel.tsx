"use client";

import { useEffect, useMemo, useState } from "react";
import type { ProductCatalogItem } from "@/lib/api";
import { productsApi } from "@/lib/api";
import {
  formatSpecValue,
  orderedSpecEntries,
  PRODUCT_SPEC_LABELS_UK,
  PRODUCT_SPEC_ORDER,
} from "@/lib/product-spec-labels";

const INTERNAL_SPEC_KEYS = new Set(["fill_status", "review_note", "source_fragment"]);

const BOOLEAN_SPEC_KEYS = new Set(["screw_included", "sterile", "for_multi_unit"]);

const NUMBER_SPEC_KEYS = new Set([
  "diameter",
  "height",
  "gingival_height",
  "angle",
  "length",
  "production_time",
]);

const INTEGER_SPEC_KEYS = new Set(["packaging_qty"]);

const ADDABLE_SPEC_CODES = PRODUCT_SPEC_ORDER.filter((code) => !INTERNAL_SPEC_KEYS.has(code));

const CUSTOM_CODE_RE = /^[a-z][a-z0-9_]*$/;

function asRecord(raw: ProductCatalogItem["characteristics"]): Record<string, unknown> {
  if (raw && typeof raw === "object" && !Array.isArray(raw)) {
    return { ...(raw as Record<string, unknown>) };
  }
  return {};
}

function cloneDraft(raw: ProductCatalogItem["characteristics"]): Record<string, unknown> {
  return asRecord(raw);
}

function draftEquals(
  a: Record<string, unknown>,
  b: Record<string, unknown>,
): boolean {
  const keysA = Object.keys(a).sort();
  const keysB = Object.keys(b).sort();
  if (keysA.length !== keysB.length) return false;
  for (let i = 0; i < keysA.length; i++) {
    if (keysA[i] !== keysB[i]) return false;
    if (JSON.stringify(a[keysA[i]!]) !== JSON.stringify(b[keysB[i]!])) return false;
  }
  return true;
}

function coerceForSave(code: string, value: unknown): unknown | undefined {
  if (BOOLEAN_SPEC_KEYS.has(code)) {
    return value === true ? true : undefined;
  }
  if (INTEGER_SPEC_KEYS.has(code)) {
    if (value === null || value === undefined || value === "") return undefined;
    const n = typeof value === "number" ? value : Number(String(value).trim().replace(",", "."));
    if (!Number.isFinite(n)) return undefined;
    return Math.trunc(n);
  }
  if (NUMBER_SPEC_KEYS.has(code)) {
    if (value === null || value === undefined || value === "") return undefined;
    const n = typeof value === "number" ? value : Number(String(value).trim().replace(",", "."));
    if (!Number.isFinite(n)) return undefined;
    return n;
  }
  if (value === null || value === undefined) return undefined;
  const s = String(value).trim();
  return s === "" ? undefined : s;
}

function buildPayload(draft: Record<string, unknown>): Record<string, unknown> | null {
  const out: Record<string, unknown> = {};
  for (const [code, raw] of Object.entries(draft)) {
    const coerced = coerceForSave(code, raw);
    if (coerced !== undefined) out[code] = coerced;
  }
  return Object.keys(out).length > 0 ? out : null;
}

/** Keys present in the draft (including empty strings just added for editing). */
function editableEntries(draft: Record<string, unknown>): [string, unknown][] {
  return orderedSpecEntries(draft).filter(([, v]) => v !== null && v !== undefined);
}

export function ProductCharacteristicsPanel({
  product,
  readOnly = false,
  onSaved,
}: {
  product: ProductCatalogItem;
  readOnly?: boolean;
  onSaved?: () => void;
}) {
  const [draft, setDraft] = useState<Record<string, unknown>>(() => cloneDraft(product.characteristics));
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [addMode, setAddMode] = useState(false);
  const [selectedCatalogCode, setSelectedCatalogCode] = useState("");
  const [customCode, setCustomCode] = useState("");
  const [customValue, setCustomValue] = useState("");
  const [addError, setAddError] = useState<string | null>(null);

  useEffect(() => {
    setDraft(cloneDraft(product.characteristics));
    setError(null);
    setAddMode(false);
    setSelectedCatalogCode("");
    setCustomCode("");
    setCustomValue("");
    setAddError(null);
  }, [product.id, product.characteristics]);

  const baseline = useMemo(() => cloneDraft(product.characteristics), [product.characteristics]);
  const dirty = !draftEquals(draft, baseline);
  const entries = editableEntries(draft);
  const availableCodes = ADDABLE_SPEC_CODES.filter((code) => !(code in draft));

  const setValue = (code: string, value: unknown) => {
    setDraft((prev) => ({ ...prev, [code]: value }));
  };

  const removeKey = (code: string) => {
    setDraft((prev) => {
      const next = { ...prev };
      delete next[code];
      return next;
    });
  };

  const handleCancel = () => {
    setDraft(cloneDraft(product.characteristics));
    setError(null);
    setAddMode(false);
    setSelectedCatalogCode("");
    setCustomCode("");
    setCustomValue("");
    setAddError(null);
  };

  const handleAddFromCatalog = () => {
    setAddError(null);
    const code = selectedCatalogCode.trim();
    if (!code) {
      setAddError("Оберіть властивість зі списку");
      return;
    }
    if (code in draft) {
      setAddError("Ця властивість уже додана");
      return;
    }
    setDraft((prev) => ({
      ...prev,
      [code]: BOOLEAN_SPEC_KEYS.has(code) ? true : "",
    }));
    setSelectedCatalogCode("");
    setAddMode(false);
  };

  const handleAddCustom = () => {
    setAddError(null);
    const code = customCode.trim().toLowerCase();
    if (!CUSTOM_CODE_RE.test(code)) {
      setAddError("Код: латиниця, цифри й _ (наприклад implant_system)");
      return;
    }
    if (code in draft) {
      setAddError("Ця властивість уже додана");
      return;
    }
    const value = customValue.trim();
    setDraft((prev) => ({
      ...prev,
      [code]: BOOLEAN_SPEC_KEYS.has(code) ? true : value,
    }));
    setCustomCode("");
    setCustomValue("");
    setAddMode(false);
  };

  const handleSave = async () => {
    setSaving(true);
    setError(null);
    try {
      await productsApi.updateCharacteristics(product.id, buildPayload(draft));
      onSaved?.();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Не вдалося зберегти");
    } finally {
      setSaving(false);
    }
  };

  if (readOnly) {
    const viewEntries = entries.filter(([, v]) => v !== "");
    return (
      <div role="region" aria-label={`Характеристики ${product.sku}`}>
        <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-zinc-500">
          Характеристики
        </p>
        {viewEntries.length === 0 ? (
          <p className="text-sm text-zinc-500">Немає заповнених характеристик.</p>
        ) : (
          <dl className="grid grid-cols-1 gap-x-10 gap-y-1 sm:grid-cols-2 lg:grid-cols-3">
            {viewEntries.map(([code, val]) => (
              <div
                key={code}
                className="flex flex-col gap-0.5 border-b border-zinc-200/70 py-2 last:border-0 sm:flex-row sm:items-baseline sm:gap-3"
              >
                <dt className="shrink-0 text-xs text-zinc-500 sm:w-[42%]">
                  {PRODUCT_SPEC_LABELS_UK[code] ?? code}
                </dt>
                <dd className="text-sm font-medium text-zinc-900">{formatSpecValue(val)}</dd>
              </div>
            ))}
          </dl>
        )}
      </div>
    );
  }

  return (
    <div role="region" aria-label={`Характеристики ${product.sku}`}>
      <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-zinc-500">
        Характеристики
      </p>

      {error ? <p className="mb-2 text-sm text-red-600">{error}</p> : null}

      {entries.length === 0 && !addMode ? (
        <p className="mb-3 text-sm text-zinc-500">Немає заповнених характеристик.</p>
      ) : (
        <ul className="mb-3 grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-3">
          {entries.map(([code, val]) => (
            <li
              key={code}
              className="flex flex-col gap-1 rounded-lg border border-zinc-200 bg-white px-3 py-2"
            >
              <div className="flex items-start justify-between gap-2">
                <label
                  htmlFor={`spec-${product.id}-${code}`}
                  className="text-xs font-medium text-zinc-600"
                >
                  {PRODUCT_SPEC_LABELS_UK[code] ?? code}
                  {INTERNAL_SPEC_KEYS.has(code) ? (
                    <span className="ml-1 font-normal text-zinc-400">(службове)</span>
                  ) : null}
                </label>
                <button
                  type="button"
                  onClick={() => removeKey(code)}
                  className="shrink-0 rounded p-1 text-zinc-400 hover:bg-red-50 hover:text-red-600"
                  title="Прибрати"
                  aria-label={`Прибрати ${PRODUCT_SPEC_LABELS_UK[code] ?? code}`}
                >
                  <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={2}
                      d="M6 18L18 6M6 6l12 12"
                    />
                  </svg>
                </button>
              </div>
              {BOOLEAN_SPEC_KEYS.has(code) ? (
                <label className="inline-flex min-h-[36px] items-center gap-2 text-sm text-zinc-800">
                  <input
                    id={`spec-${product.id}-${code}`}
                    type="checkbox"
                    checked={val === true}
                    onChange={(e) =>
                      setDraft((prev) => {
                        const next = { ...prev };
                        if (e.target.checked) next[code] = true;
                        else delete next[code];
                        return next;
                      })
                    }
                    className="h-4 w-4 rounded border-zinc-300 text-zinc-900 focus:ring-zinc-500"
                  />
                  Так
                </label>
              ) : (
                <input
                  id={`spec-${product.id}-${code}`}
                  value={val === null || val === undefined ? "" : String(val)}
                  onChange={(e) => setValue(code, e.target.value)}
                  inputMode={
                    NUMBER_SPEC_KEYS.has(code) || INTEGER_SPEC_KEYS.has(code) ? "decimal" : "text"
                  }
                  className="w-full rounded-md border border-zinc-300 px-2 py-1.5 text-sm text-zinc-900"
                />
              )}
            </li>
          ))}
        </ul>
      )}

      {addMode ? (
        <div className="mb-3 space-y-3 rounded-lg border border-dashed border-zinc-300 bg-white p-3">
          <p className="text-xs font-semibold uppercase tracking-wide text-zinc-500">
            Додати властивість
          </p>
          {addError ? <p className="text-sm text-red-600">{addError}</p> : null}

          <div className="flex flex-col gap-2 sm:flex-row sm:items-end">
            <label className="flex min-w-0 flex-1 flex-col gap-1">
              <span className="text-xs text-zinc-600">Зі довідника</span>
              <select
                value={selectedCatalogCode}
                onChange={(e) => setSelectedCatalogCode(e.target.value)}
                className="w-full rounded-md border border-zinc-300 px-2 py-1.5 text-sm"
              >
                <option value="">— оберіть —</option>
                {availableCodes.map((code) => (
                  <option key={code} value={code}>
                    {PRODUCT_SPEC_LABELS_UK[code] ?? code}
                  </option>
                ))}
              </select>
            </label>
            <button
              type="button"
              onClick={handleAddFromCatalog}
              disabled={availableCodes.length === 0}
              className="rounded-md border border-zinc-300 px-3 py-1.5 text-sm font-medium text-zinc-700 hover:bg-zinc-50 disabled:opacity-50"
            >
              Додати
            </button>
          </div>

          <div className="flex flex-col gap-2 sm:flex-row sm:items-end">
            <label className="flex min-w-0 flex-1 flex-col gap-1">
              <span className="text-xs text-zinc-600">Свій код</span>
              <input
                value={customCode}
                onChange={(e) => setCustomCode(e.target.value)}
                placeholder="my_property"
                className="w-full rounded-md border border-zinc-300 px-2 py-1.5 font-mono text-sm"
              />
            </label>
            <label className="flex min-w-0 flex-1 flex-col gap-1">
              <span className="text-xs text-zinc-600">Значення</span>
              <input
                value={customValue}
                onChange={(e) => setCustomValue(e.target.value)}
                className="w-full rounded-md border border-zinc-300 px-2 py-1.5 text-sm"
              />
            </label>
            <button
              type="button"
              onClick={handleAddCustom}
              className="rounded-md border border-zinc-300 px-3 py-1.5 text-sm font-medium text-zinc-700 hover:bg-zinc-50"
            >
              Додати код
            </button>
          </div>

          <button
            type="button"
            onClick={() => {
              setAddMode(false);
              setAddError(null);
              setSelectedCatalogCode("");
              setCustomCode("");
              setCustomValue("");
            }}
            className="text-sm text-zinc-500 hover:text-zinc-800"
          >
            Скасувати додавання
          </button>
        </div>
      ) : (
        <button
          type="button"
          onClick={() => setAddMode(true)}
          className="mb-3 rounded-md border border-zinc-300 bg-white px-3 py-1.5 text-sm font-medium text-zinc-700 hover:bg-zinc-50"
        >
          Додати властивість
        </button>
      )}

      <div className="flex flex-wrap gap-2">
        <button
          type="button"
          onClick={() => void handleSave()}
          disabled={saving || !dirty}
          className="btn-primary disabled:opacity-50"
        >
          {saving ? "Збереження…" : "Зберегти"}
        </button>
        <button
          type="button"
          onClick={handleCancel}
          disabled={saving || !dirty}
          className="rounded-md border border-zinc-300 px-3 py-2 text-sm font-medium text-zinc-700 hover:bg-zinc-50 disabled:opacity-50"
        >
          Скасувати
        </button>
      </div>
    </div>
  );
}

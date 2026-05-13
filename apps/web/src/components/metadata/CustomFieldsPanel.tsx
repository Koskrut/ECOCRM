"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { apiHttp } from "@/lib/api/client";
import { ApiError, getUserFriendlyApiError } from "@/lib/api/errors";
import { useToast } from "@/components/feedback";

function apiErrMsg(e: unknown, fallback: string): string {
  if (e instanceof ApiError) return e.message;
  return getUserFriendlyApiError(e, fallback);
}

type SchemaOption = { id: string; key: string; label: string; value: string | null; sortOrder: number };

type SchemaDef = {
  id: string;
  key: string;
  label: string;
  description: string | null;
  type: string;
  required: boolean;
  options: SchemaOption[];
  dictionary: { id: string; key: string; name: string } | null;
};

type ValueRow = {
  definitionId: string;
  definition: { id: string; key: string; label: string; type: string };
  valueString?: string | null;
  valueNumber?: number | null;
  valueBoolean?: boolean | null;
  valueDate?: string | null;
  valueJson?: unknown;
  dictionaryItemId?: string | null;
};

type Props = {
  entityType: string;
  entityId: string;
  onSaved?: () => void;
};

function isSupportedEditable(type: string): boolean {
  return ["TEXT", "NUMBER", "MONEY", "BOOLEAN", "DATE", "JSON", "SELECT", "MULTISELECT"].includes(type);
}

function multiselectFromRow(row: ValueRow): string[] {
  const raw = row.valueJson;
  if (!Array.isArray(raw)) return [];
  return raw.filter((v): v is string => typeof v === "string");
}

export function CustomFieldsPanel({ entityType, entityId, onSaved }: Props) {
  const { pushToast } = useToast();
  const [defs, setDefs] = useState<SchemaDef[]>([]);
  const [values, setValues] = useState<ValueRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [draftText, setDraftText] = useState<Record<string, string>>({});
  const [draftMulti, setDraftMulti] = useState<Record<string, string[]>>({});
  const [initialSig, setInitialSig] = useState<string>("");
  const [savingAll, setSavingAll] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [sRes, vRes] = await Promise.all([
        apiHttp.get<{ items: SchemaDef[] }>(
          `/custom-fields/field-schema?entityType=${encodeURIComponent(entityType)}`,
        ),
        apiHttp.get<{ items: ValueRow[] }>(
          `/custom-fields/values/${encodeURIComponent(entityType)}/${encodeURIComponent(entityId)}`,
        ),
      ]);
      const activeDefs = sRes.data?.items ?? [];
      setDefs(activeDefs);
      const vrows = vRes.data?.items ?? [];
      setValues(vrows);

      const nextText: Record<string, string> = {};
      const nextMulti: Record<string, string[]> = {};
      const valueByDefKey = new Map(vrows.map((r) => [r.definition.key, r]));

      for (const d of activeDefs) {
        const row = valueByDefKey.get(d.key);
        if (d.type === "MULTISELECT") {
          nextMulti[d.key] = row ? multiselectFromRow(row) : [];
          continue;
        }
        if (!row) {
          if (d.type === "BOOLEAN") {
            nextText[d.key] = "false";
            continue;
          }
          nextText[d.key] = "";
          continue;
        }
        if (d.type === "TEXT" || d.type === "SELECT" || d.type === "USER") {
          nextText[d.key] = row.valueString ?? "";
        } else if (d.type === "NUMBER" || d.type === "MONEY") {
          nextText[d.key] = row.valueNumber != null ? String(row.valueNumber) : "";
        } else if (d.type === "BOOLEAN") {
          nextText[d.key] = row.valueBoolean ? "true" : "false";
        } else if (d.type === "DATE" && row.valueDate) {
          nextText[d.key] = String(row.valueDate).slice(0, 10);
        } else if (d.type === "JSON") {
          nextText[d.key] = row.valueJson != null ? JSON.stringify(row.valueJson) : "";
        } else {
          nextText[d.key] = "";
        }
      }

      setDraftText(nextText);
      setDraftMulti(nextMulti);
      setInitialSig(serializeState(activeDefs, nextText, nextMulti));
    } catch (e: unknown) {
      setError(apiErrMsg(e, "Не вдалося завантажити кастомні поля"));
    } finally {
      setLoading(false);
    }
  }, [entityType, entityId]);

  useEffect(() => {
    void load();
  }, [load]);

  const dirty = useMemo(() => {
    if (!initialSig) return false;
    return serializeState(defs, draftText, draftMulti) !== initialSig;
  }, [defs, draftText, draftMulti, initialSig]);

  const toggleMulti = (fieldKey: string, optionKey: string, checked: boolean) => {
    setDraftMulti((prev) => {
      const cur = prev[fieldKey] ?? [];
      const set = new Set(cur);
      if (checked) set.add(optionKey);
      else set.delete(optionKey);
      return { ...prev, [fieldKey]: Array.from(set).sort() };
    });
  };

  const saveAll = async () => {
    const toSave = defs.filter((d) => isSupportedEditable(d.type));
    setSavingAll(true);
    try {
      let wrote = false;
      for (const def of toSave) {
        let built: unknown;
        try {
          built = buildPutValue(def, draftText, draftMulti);
        } catch (e) {
          if (e instanceof SyntaxError) {
            pushToast(`Поле «${def.label}»: некоректний JSON`, "error");
            return;
          }
          const m = e instanceof Error ? e.message : "";
          if (m.startsWith("INVALID_NUMBER:")) {
            pushToast(`Поле «${m.slice("INVALID_NUMBER:".length)}»: некоректне число`, "error");
            return;
          }
          throw e;
        }
        const prev = valueFromServerRow(def, values.find((v) => v.definition.key === def.key));
        if (valuesEqual(def, prev, built)) continue;

        await apiHttp.put(`/custom-fields/values/${encodeURIComponent(def.key)}/${encodeURIComponent(entityId)}`, {
          value: built,
        });
        wrote = true;
      }
      if (wrote) {
        pushToast("Кастомні поля збережено.", "success");
        onSaved?.();
      } else {
        pushToast("Немає змін у значеннях для запису", "info");
      }
      await load();
    } catch (e: unknown) {
      pushToast(apiErrMsg(e, "Не вдалося зберегти кастомні поля"), "error");
    } finally {
      setSavingAll(false);
    }
  };

  const resetDraft = () => {
    void load();
  };

  if (loading) {
    return <p className="text-sm text-zinc-500">Завантаження кастомних полів…</p>;
  }
  if (error) {
    return <p className="text-sm text-red-600">{error}</p>;
  }
  if (!defs.length) {
    return <p className="text-sm text-zinc-500">Немає активних кастомних полів для цієї сутності.</p>;
  }

  return (
    <div className="space-y-4">
      {defs.map((def) => {
        const unsupported = !isSupportedEditable(def.type);
        return (
          <div key={def.id} className="rounded-md border border-zinc-100 bg-zinc-50/80 p-3">
            <div>
              <div className="text-sm font-semibold text-zinc-900">{def.label}</div>
              {def.description ? <p className="mt-0.5 text-xs text-zinc-500">{def.description}</p> : null}
              <div className="mt-0.5 text-[11px] uppercase tracking-wide text-zinc-400">{def.type}</div>
            </div>

            {unsupported ? (
              <p className="mt-2 text-xs text-amber-800">
                {def.type === "USER" || def.type === "DICTIONARY_ITEM"
                  ? "Цей тип поля поки не редагується тут (потрібні окремі пікери або права на довідники)."
                  : "Тип поля поки не підтримується в цій панелі."}
              </p>
            ) : def.type === "BOOLEAN" ? (
              <label className="mt-2 flex items-center gap-2 text-sm text-zinc-800">
                <input
                  type="checkbox"
                  checked={(draftText[def.key] ?? "") === "true"}
                  onChange={(e) =>
                    setDraftText((d) => ({
                      ...d,
                      [def.key]: e.target.checked ? "true" : "false",
                    }))
                  }
                />
                Так
              </label>
            ) : def.type === "SELECT" ? (
              <select
                className="mt-2 w-full rounded-md border border-zinc-200 bg-white px-2 py-2 text-sm outline-none focus:border-zinc-400"
                value={draftText[def.key] ?? ""}
                onChange={(e) => setDraftText((d) => ({ ...d, [def.key]: e.target.value }))}
              >
                <option value="">{def.required ? "— оберіть —" : "— не обрано —"}</option>
                {(def.options ?? []).map((o) => (
                  <option key={o.id} value={o.key}>
                    {o.label}
                  </option>
                ))}
              </select>
            ) : def.type === "MULTISELECT" ? (
              <div className="mt-2 space-y-2">
                {(def.options ?? []).map((o) => {
                  const selected = (draftMulti[def.key] ?? []).includes(o.key);
                  return (
                    <label key={o.id} className="flex items-center gap-2 text-sm text-zinc-800">
                      <input
                        type="checkbox"
                        checked={selected}
                        onChange={(e) => toggleMulti(def.key, o.key, e.target.checked)}
                      />
                      {o.label}
                    </label>
                  );
                })}
                {(def.options ?? []).length === 0 ? (
                  <p className="text-xs text-amber-800">Немає варіантів — додайте їх у налаштуваннях поля.</p>
                ) : null}
              </div>
            ) : def.type === "DATE" ? (
              <input
                type="date"
                className="mt-2 w-full rounded-md border border-zinc-200 bg-white px-2 py-2 text-sm outline-none focus:border-zinc-400"
                value={draftText[def.key] ?? ""}
                onChange={(e) => setDraftText((d) => ({ ...d, [def.key]: e.target.value }))}
              />
            ) : def.type === "NUMBER" || def.type === "MONEY" ? (
              <input
                type="number"
                step={def.type === "MONEY" ? "0.01" : "any"}
                className="mt-2 w-full rounded-md border border-zinc-200 bg-white px-2 py-2 text-sm outline-none focus:border-zinc-400"
                value={draftText[def.key] ?? ""}
                onChange={(e) => setDraftText((d) => ({ ...d, [def.key]: e.target.value }))}
                placeholder={def.required ? "Обовʼязково" : ""}
              />
            ) : def.type === "JSON" ? (
              <textarea
                className="mt-2 w-full rounded-md border border-zinc-200 bg-white px-2 py-2 font-mono text-xs outline-none focus:border-zinc-400"
                rows={4}
                value={draftText[def.key] ?? ""}
                onChange={(e) => setDraftText((d) => ({ ...d, [def.key]: e.target.value }))}
                placeholder='{"key": "value"}'
              />
            ) : (
              <input
                className="mt-2 w-full rounded-md border border-zinc-200 bg-white px-2 py-2 text-sm outline-none focus:border-zinc-400"
                value={draftText[def.key] ?? ""}
                onChange={(e) => setDraftText((d) => ({ ...d, [def.key]: e.target.value }))}
                placeholder={def.required ? "Обовʼязково" : ""}
              />
            )}
          </div>
        );
      })}

      <div className="flex flex-wrap items-center justify-end gap-2 border-t border-zinc-100 pt-3">
        <button
          type="button"
          disabled={!dirty || savingAll}
          onClick={() => resetDraft()}
          className="rounded-md border border-zinc-200 bg-white px-3 py-1.5 text-xs font-medium text-zinc-700 hover:bg-zinc-50 disabled:opacity-50"
        >
          Скинути
        </button>
        <button
          type="button"
          disabled={!dirty || savingAll}
          onClick={() => void saveAll()}
          className="rounded-md bg-zinc-900 px-3 py-1.5 text-xs font-medium text-white hover:bg-zinc-800 disabled:opacity-50"
        >
          {savingAll ? "Збереження…" : "Зберегти зміни"}
        </button>
      </div>
    </div>
  );
}

function serializeState(defs: SchemaDef[], text: Record<string, string>, multi: Record<string, string[]>): string {
  const keys = defs.map((d) => d.key).sort();
  const payload: Record<string, unknown> = {};
  for (const k of keys) {
    const d = defs.find((x) => x.key === k);
    if (!d) continue;
    if (d.type === "MULTISELECT") payload[k] = [...(multi[k] ?? [])].sort();
    else payload[k] = text[k] ?? "";
  }
  return JSON.stringify(payload);
}

function buildPutValue(def: SchemaDef, text: Record<string, string>, multi: Record<string, string[]>): unknown {
  if (def.type === "MULTISELECT") {
    return multi[def.key] ?? [];
  }
  const raw = text[def.key] ?? "";
  if (def.type === "NUMBER" || def.type === "MONEY") {
    if (raw.trim() === "") return null;
    const n = Number(raw);
    if (!Number.isFinite(n)) throw new Error(`INVALID_NUMBER:${def.label}`);
    return n;
  }
  if (def.type === "BOOLEAN") {
    return raw === "true";
  }
  if (def.type === "JSON") {
    if (raw.trim() === "") return null;
    return JSON.parse(raw);
  }
  if (def.type === "DATE" || def.type === "SELECT") {
    return raw.trim() === "" ? null : raw;
  }
  return raw.trim() === "" ? null : raw;
}

function valueFromServerRow(def: SchemaDef, row: ValueRow | undefined): unknown {
  if (def.type === "MULTISELECT") {
    return row ? multiselectFromRow(row) : [];
  }
  if (!row) {
    if (def.type === "BOOLEAN") return false;
    return null;
  }
  if (def.type === "BOOLEAN") return row.valueBoolean === true;
  if (def.type === "NUMBER" || def.type === "MONEY") return row.valueNumber ?? null;
  if (def.type === "DATE") return row.valueDate ? String(row.valueDate).slice(0, 10) : null;
  if (def.type === "JSON") return row.valueJson ?? null;
  if (def.type === "SELECT") return row.valueString ?? null;
  return row.valueString ?? null;
}

function valuesEqual(def: SchemaDef, a: unknown, b: unknown): boolean {
  if (def.type === "MULTISELECT") {
    const sa = JSON.stringify([...(Array.isArray(a) ? a : [])].sort());
    const sb = JSON.stringify([...(Array.isArray(b) ? b : [])].sort());
    return sa === sb;
  }
  return JSON.stringify(a) === JSON.stringify(b);
}

"use client";

import { useCallback, useEffect, useState } from "react";
import { apiHttp } from "@/lib/api/client";

type Definition = {
  id: string;
  key: string;
  label: string;
  type: string;
  required?: boolean;
  isActive?: boolean;
};

type ValueRow = {
  definitionId: string;
  definition: Definition;
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

export function CustomFieldsPanel({ entityType, entityId, onSaved }: Props) {
  const [defs, setDefs] = useState<Definition[]>([]);
  const [values, setValues] = useState<ValueRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [draft, setDraft] = useState<Record<string, string>>({});
  const [savingKey, setSavingKey] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [dRes, vRes] = await Promise.all([
        apiHttp.get<{ items: Definition[] }>(
          `/custom-fields/definitions?entityType=${encodeURIComponent(entityType)}`,
        ),
        apiHttp.get<{ items: ValueRow[] }>(
          `/custom-fields/values/${encodeURIComponent(entityType)}/${encodeURIComponent(entityId)}`,
        ),
      ]);
      const activeDefs = (dRes.data?.items ?? []).filter((d) => d && d.isActive !== false);
      setDefs(activeDefs);
      setValues(vRes.data?.items ?? []);
      const nextDraft: Record<string, string> = {};
      for (const row of vRes.data?.items ?? []) {
        const d = row.definition;
        if (d.type === "TEXT" || d.type === "JSON") {
          nextDraft[d.key] = row.valueString ?? (row.valueJson != null ? JSON.stringify(row.valueJson) : "");
        } else if (d.type === "NUMBER" || d.type === "MONEY") {
          nextDraft[d.key] = row.valueNumber != null ? String(row.valueNumber) : "";
        } else if (d.type === "BOOLEAN") {
          nextDraft[d.key] = row.valueBoolean ? "true" : "false";
        } else if (d.type === "DATE" && row.valueDate) {
          nextDraft[d.key] = String(row.valueDate).slice(0, 10);
        } else {
          nextDraft[d.key] = "";
        }
      }
      for (const d of activeDefs) {
        if (nextDraft[d.key] === undefined) nextDraft[d.key] = "";
      }
      setDraft(nextDraft);
    } catch (e: unknown) {
      const msg = e && typeof e === "object" && "message" in e ? String((e as { message?: string }).message) : "Failed to load";
      setError(msg);
    } finally {
      setLoading(false);
    }
  }, [entityType, entityId]);

  useEffect(() => {
    void load();
  }, [load]);

  const save = async (def: Definition) => {
    setSavingKey(def.key);
    setError(null);
    try {
      const raw = draft[def.key] ?? "";
      let value: unknown = raw;
      if (def.type === "NUMBER" || def.type === "MONEY") {
        value = raw === "" ? null : Number(raw);
      } else if (def.type === "BOOLEAN") {
        value = raw === "true";
      } else if (def.type === "JSON") {
        value = raw.trim() === "" ? null : JSON.parse(raw);
      } else if (def.type === "DATE") {
        value = raw.trim() === "" ? null : raw;
      } else {
        value = raw.trim() === "" ? null : raw;
      }
      await apiHttp.put(`/custom-fields/values/${encodeURIComponent(def.key)}/${encodeURIComponent(entityId)}`, {
        value,
      });
      await load();
      onSaved?.();
    } catch (e: unknown) {
      const msg = e && typeof e === "object" && "message" in e ? String((e as { message?: string }).message) : "Save failed";
      setError(msg);
    } finally {
      setSavingKey(null);
    }
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
    <div className="space-y-3">
      {defs.map((def) => {
        const disabled = def.type === "USER" || def.type === "SELECT" || def.type === "MULTISELECT" || def.type === "DICTIONARY_ITEM";
        return (
          <div key={def.id} className="rounded-md border border-zinc-100 bg-zinc-50/80 p-3">
            <div className="text-xs font-semibold uppercase tracking-wide text-zinc-500">
              {def.label}
              <span className="ml-2 font-normal normal-case text-zinc-400">({def.type})</span>
            </div>
            {def.type === "BOOLEAN" ? (
              <label className="mt-2 flex items-center gap-2 text-sm text-zinc-800">
                <input
                  type="checkbox"
                  checked={draft[def.key] === "true"}
                  onChange={(e) =>
                    setDraft((d) => ({
                      ...d,
                      [def.key]: e.target.checked ? "true" : "false",
                    }))
                  }
                  disabled={disabled}
                />
                Так
              </label>
            ) : (
              <input
                className="mt-2 w-full rounded-md border border-zinc-200 px-2 py-1.5 text-sm outline-none focus:border-zinc-400"
                value={draft[def.key] ?? ""}
                onChange={(e) => setDraft((d) => ({ ...d, [def.key]: e.target.value }))}
                disabled={disabled}
                placeholder={def.required ? "Обовʼязково" : ""}
              />
            )}
            {disabled ? (
              <p className="mt-1 text-xs text-amber-700">Тип поля поки не підтримується в цій панелі.</p>
            ) : (
              <div className="mt-2 flex justify-end">
                <button
                  type="button"
                  onClick={() => void save(def)}
                  disabled={savingKey === def.key}
                  className="rounded-md border border-zinc-200 bg-white px-2 py-1 text-xs font-medium text-zinc-700 hover:bg-zinc-50 disabled:opacity-50"
                >
                  {savingKey === def.key ? "Збереження…" : "Зберегти"}
                </button>
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}

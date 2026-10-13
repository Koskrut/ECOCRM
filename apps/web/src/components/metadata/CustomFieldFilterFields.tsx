"use client";

import { useEffect, useState } from "react";
import { apiHttp } from "@/lib/api/client";
import { usersApi } from "@/lib/api/resources/users";
import type { CustomFilterValues } from "@/lib/custom-fields/filters";

type SchemaOption = { id: string; key: string; label: string };
type DictionaryItem = { id: string; label: string };
type SchemaDef = {
  id: string;
  key: string;
  label: string;
  type: string;
  options: SchemaOption[];
  dictionaryItems?: DictionaryItem[];
};

type LayoutField = {
  hidden?: boolean;
  customFieldDefinition?: { id: string; key: string; label: string; type: string } | null;
};

const FILTERABLE = new Set([
  "TEXT",
  "NUMBER",
  "MONEY",
  "BOOLEAN",
  "DATE",
  "SELECT",
  "MULTISELECT",
  "USER",
  "DICTIONARY_ITEM",
]);

type Props = {
  entityType: "CONTACT" | "COMPANY" | "LEAD" | "ORDER";
  value: CustomFilterValues;
  onChange: (next: CustomFilterValues) => void;
  emptyHint?: string;
};

export function CustomFieldFilterFields({ entityType, value, onChange, emptyHint }: Props) {
  const [defs, setDefs] = useState<SchemaDef[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [users, setUsers] = useState<Array<{ id: string; label: string }>>([]);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const [layoutRes, schemaRes] = await Promise.all([
          apiHttp.get<{ items?: Array<{ sections?: Array<{ fields?: LayoutField[] }> }> }>(
            `/layouts/runtime/list?entityType=${encodeURIComponent(entityType)}&type=FILTERS`,
          ),
          apiHttp.get<{ items: SchemaDef[] }>(
            `/custom-fields/field-schema?entityType=${encodeURIComponent(entityType)}`,
          ),
        ]);
        if (cancelled) return;
        const schema = new Map((schemaRes.data?.items ?? []).map((item) => [item.key, item]));
        const fields = layoutRes.data?.items?.[0]?.sections?.flatMap((section) => section.fields ?? []) ?? [];
        const selected: SchemaDef[] = [];
        for (const field of fields) {
          if (field.hidden) continue;
          const linked = field.customFieldDefinition;
          if (!linked) continue;
          const def = schema.get(linked.key);
          if (!def || !FILTERABLE.has(def.type)) continue;
          selected.push(def);
        }
        setDefs(selected);
        setLoaded(true);
        if (selected.some((def) => def.type === "USER")) {
          const people = await usersApi.list().catch(() => []);
          if (!cancelled) {
            setUsers(
              people
                .filter((person) => person.isActive !== false)
                .map((person) => ({
                  id: person.id,
                  label: person.fullName?.trim() || person.email,
                })),
            );
          }
        }
      } catch {
        if (!cancelled) {
          setDefs([]);
          setLoaded(true);
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [entityType]);

  if (!loaded) return null;
  if (defs.length === 0) {
    return emptyHint ? <p className="text-sm text-zinc-500">{emptyHint}</p> : null;
  }

  const setText = (key: string, next: string) => {
    onChange({ ...value, [key]: next });
  };

  const toggleMulti = (key: string, optionKey: string, checked: boolean) => {
    const current = Array.isArray(value[key]) ? value[key] : [];
    const next = new Set(current);
    if (checked) next.add(optionKey);
    else next.delete(optionKey);
    onChange({ ...value, [key]: [...next] });
  };

  return (
    <div className="space-y-3 rounded-lg border border-zinc-100 bg-zinc-50/60 p-3">
      <div className="text-[11px] font-semibold uppercase tracking-wide text-zinc-500">Додаткові поля</div>
      {defs.map((def) => {
        const current = value[def.key];
        const text = typeof current === "string" ? current : "";
        return (
          <div key={def.id}>
            <label className="mb-1 block text-xs font-medium text-zinc-500">{def.label}</label>
            {def.type === "BOOLEAN" ? (
              <select
                value={text}
                onChange={(e) => setText(def.key, e.target.value)}
                className="w-full rounded-lg border border-zinc-200 bg-white px-3 py-2 text-sm"
              >
                <option value="">Будь-яке</option>
                <option value="true">Так</option>
                <option value="false">Ні</option>
              </select>
            ) : def.type === "SELECT" ? (
              <select
                value={text}
                onChange={(e) => setText(def.key, e.target.value)}
                className="w-full rounded-lg border border-zinc-200 bg-white px-3 py-2 text-sm"
              >
                <option value="">Будь-яке</option>
                {def.options.map((option) => (
                  <option key={option.id} value={option.key}>
                    {option.label}
                  </option>
                ))}
              </select>
            ) : def.type === "MULTISELECT" ? (
              <div className="space-y-1.5">
                {def.options.map((option) => {
                  const selected = Array.isArray(current) && current.includes(option.key);
                  return (
                    <label key={option.id} className="flex items-center gap-2 text-sm text-zinc-800">
                      <input
                        type="checkbox"
                        checked={selected}
                        onChange={(e) => toggleMulti(def.key, option.key, e.target.checked)}
                      />
                      {option.label}
                    </label>
                  );
                })}
              </div>
            ) : def.type === "DATE" ? (
              <input
                type="date"
                value={text.slice(0, 10)}
                onChange={(e) => setText(def.key, e.target.value)}
                className="w-full rounded-lg border border-zinc-200 bg-white px-3 py-2 text-sm"
              />
            ) : def.type === "NUMBER" || def.type === "MONEY" ? (
              <input
                type="number"
                step={def.type === "MONEY" ? "0.01" : "any"}
                value={text}
                onChange={(e) => setText(def.key, e.target.value)}
                placeholder="Дорівнює"
                className="w-full rounded-lg border border-zinc-200 bg-white px-3 py-2 text-sm"
              />
            ) : def.type === "USER" ? (
              <select
                value={text}
                onChange={(e) => setText(def.key, e.target.value)}
                className="w-full rounded-lg border border-zinc-200 bg-white px-3 py-2 text-sm"
              >
                <option value="">Будь-хто</option>
                {users.map((person) => (
                  <option key={person.id} value={person.id}>
                    {person.label}
                  </option>
                ))}
              </select>
            ) : def.type === "DICTIONARY_ITEM" ? (
              <select
                value={text}
                onChange={(e) => setText(def.key, e.target.value)}
                className="w-full rounded-lg border border-zinc-200 bg-white px-3 py-2 text-sm"
              >
                <option value="">Будь-яке</option>
                {(def.dictionaryItems ?? []).map((item) => (
                  <option key={item.id} value={item.id}>
                    {item.label}
                  </option>
                ))}
              </select>
            ) : (
              <input
                value={text}
                onChange={(e) => setText(def.key, e.target.value)}
                placeholder="Містить"
                className="w-full rounded-lg border border-zinc-200 bg-white px-3 py-2 text-sm"
              />
            )}
          </div>
        );
      })}
    </div>
  );
}

"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import { apiHttp } from "@/lib/api/client";
import {
  addLayoutField,
  ensureListDefaultLayout,
  removeLayoutField,
  updateLayoutField,
  type LayoutDto,
  type LayoutFieldDto,
} from "@/lib/api/resources/metadataHub";
import {
  BASE_COLUMNS,
  ENTITY_TYPE_LABELS,
  NATIVE_COLUMNS,
  type ListEntityType,
} from "@/lib/lists/columnCatalog";

const ENTITY_TYPES: ListEntityType[] = ["COMPANY", "CONTACT", "ORDER", "LEAD"];

type CustomFieldDef = {
  id: string;
  key: string;
  label: string;
  type: string;
  entityType: string;
  isActive?: boolean;
};

export default function ListColumnsAdminPage() {
  const [role, setRole] = useState<string | null>(null);
  const [entity, setEntity] = useState<ListEntityType>("CONTACT");
  const [layout, setLayout] = useState<LayoutDto | null>(null);
  const [customFields, setCustomFields] = useState<CustomFieldDef[]>([]);
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [msg, setMsg] = useState<string | null>(null);

  useEffect(() => {
    apiHttp
      .get<{ user?: { role?: string } }>("/auth/me")
      .then((r) => setRole(r.data?.user?.role ?? null))
      .catch(() => setRole(null));
  }, []);

  const loadEntity = useCallback(
    async (et: ListEntityType) => {
      setLoading(true);
      setErr(null);
      try {
        const [layoutResult, defsResult] = await Promise.all([
          ensureListDefaultLayout(et),
          apiHttp
            .get<{ items: CustomFieldDef[] }>(
              `/custom-fields/definitions?entityType=${encodeURIComponent(et)}`,
            )
            .then((r) => r.data?.items ?? [])
            .catch(() => [] as CustomFieldDef[]),
        ]);
        setLayout(layoutResult);
        setCustomFields(defsResult.filter((d) => d.isActive !== false));
      } catch (e: unknown) {
        const m =
          typeof e === "object" && e && "message" in e
            ? String((e as { message: unknown }).message)
            : "Не вдалося завантажити налаштування";
        setErr(m);
        setLayout(null);
      } finally {
        setLoading(false);
      }
    },
    [],
  );

  useEffect(() => {
    if (role !== "ADMIN") return;
    void loadEntity(entity);
  }, [role, entity, loadEntity]);

  const section = useMemo(() => {
    if (!layout) return null;
    return layout.sections[0] ?? null;
  }, [layout]);

  const fields = useMemo(() => {
    const list = section?.fields ?? [];
    return [...list].sort((a, b) => a.sortOrder - b.sortOrder);
  }, [section]);

  const usedNativeKeys = useMemo(
    () => new Set(fields.filter((f) => f.fieldKey).map((f) => f.fieldKey!)),
    [fields],
  );
  const usedCustomDefIds = useMemo(
    () =>
      new Set(
        fields
          .filter((f) => f.customFieldDefinitionId)
          .map((f) => f.customFieldDefinitionId!),
      ),
    [fields],
  );

  const updateLocalField = (field: LayoutFieldDto) => {
    setLayout((prev) => {
      if (!prev) return prev;
      return {
        ...prev,
        sections: prev.sections.map((s) =>
          s.id === section?.id
            ? {
                ...s,
                fields: s.fields.map((f) => (f.id === field.id ? field : f)),
              }
            : s,
        ),
      };
    });
  };

  const removeLocalField = (fieldId: string) => {
    setLayout((prev) => {
      if (!prev) return prev;
      return {
        ...prev,
        sections: prev.sections.map((s) =>
          s.id === section?.id
            ? { ...s, fields: s.fields.filter((f) => f.id !== fieldId) }
            : s,
        ),
      };
    });
  };

  const appendLocalField = (field: LayoutFieldDto) => {
    setLayout((prev) => {
      if (!prev) return prev;
      return {
        ...prev,
        sections: prev.sections.map((s) =>
          s.id === section?.id ? { ...s, fields: [...s.fields, field] } : s,
        ),
      };
    });
  };

  const onAddNative = async (key: string) => {
    if (!layout || !section) return;
    setErr(null);
    setMsg(null);
    try {
      const nextOrder = fields.length;
      const field = await addLayoutField(layout.id, section.id, {
        fieldKey: key,
        sortOrder: nextOrder,
      });
      appendLocalField(field);
      setMsg("Колонку додано.");
    } catch (e: unknown) {
      setErr(asError(e, "Не вдалося додати колонку"));
    }
  };

  const onAddCustom = async (definitionId: string) => {
    if (!layout || !section) return;
    setErr(null);
    setMsg(null);
    try {
      const nextOrder = fields.length;
      const field = await addLayoutField(layout.id, section.id, {
        customFieldDefinitionId: definitionId,
        sortOrder: nextOrder,
      });
      appendLocalField(field);
      setMsg("Колонку додано.");
    } catch (e: unknown) {
      setErr(asError(e, "Не вдалося додати колонку"));
    }
  };

  const onRemove = async (field: LayoutFieldDto) => {
    if (!layout || !section) return;
    setErr(null);
    setMsg(null);
    try {
      await removeLayoutField(layout.id, section.id, field.id);
      removeLocalField(field.id);
      setMsg("Колонку видалено.");
    } catch (e: unknown) {
      setErr(asError(e, "Не вдалося видалити колонку"));
    }
  };

  const onToggleHidden = async (field: LayoutFieldDto) => {
    if (!layout || !section) return;
    setErr(null);
    setMsg(null);
    try {
      const updated = await updateLayoutField(layout.id, section.id, field.id, {
        hidden: !field.hidden,
      });
      updateLocalField(updated);
    } catch (e: unknown) {
      setErr(asError(e, "Не вдалося оновити колонку"));
    }
  };

  const onChangeLabel = async (field: LayoutFieldDto, label: string) => {
    if (!layout || !section) return;
    setErr(null);
    try {
      const updated = await updateLayoutField(layout.id, section.id, field.id, {
        label: label.trim() === "" ? null : label.trim(),
      });
      updateLocalField(updated);
    } catch (e: unknown) {
      setErr(asError(e, "Не вдалося оновити заголовок"));
    }
  };

  const onMove = async (field: LayoutFieldDto, dir: -1 | 1) => {
    if (!layout || !section) return;
    const idx = fields.findIndex((f) => f.id === field.id);
    const swapIdx = idx + dir;
    if (idx < 0 || swapIdx < 0 || swapIdx >= fields.length) return;
    const a = fields[idx]!;
    const b = fields[swapIdx]!;
    setErr(null);
    try {
      const [ua, ub] = await Promise.all([
        updateLayoutField(layout.id, section.id, a.id, { sortOrder: b.sortOrder }),
        updateLayoutField(layout.id, section.id, b.id, { sortOrder: a.sortOrder }),
      ]);
      updateLocalField(ua);
      updateLocalField(ub);
    } catch (e: unknown) {
      setErr(asError(e, "Не вдалося змінити порядок"));
    }
  };

  if (role !== "ADMIN") {
    return (
      <div className="p-6">
        <p className="text-sm text-zinc-600">Доступ тільки для ADMIN.</p>
      </div>
    );
  }

  const availableNative = NATIVE_COLUMNS[entity].filter((c) => !usedNativeKeys.has(c.key));
  const availableCustom = customFields.filter((d) => !usedCustomDefIds.has(d.id));

  return (
    <div className="min-h-screen bg-zinc-50 p-6">
      <div className="mx-auto max-w-6xl">
        <Link href="/settings/metadata" className="text-sm text-zinc-600 hover:text-zinc-900">
          ← Хаб метаданих
        </Link>
        <h1 className="mt-2 text-2xl font-bold text-zinc-900">Колонки списків</h1>
        <p className="mt-1 text-sm text-zinc-600">
          Додавайте додаткові колонки в списки компаній, контактів, замовлень і лідів. Базові колонки
          (ім'я та дії) завжди видимі і не редагуються.
        </p>

        {err ? <p className="mt-2 text-sm text-red-600">{err}</p> : null}
        {msg ? <p className="mt-2 text-sm text-emerald-700">{msg}</p> : null}

        <div className="mt-4 flex flex-wrap gap-2">
          {ENTITY_TYPES.map((e) => (
            <button
              key={e}
              type="button"
              onClick={() => setEntity(e)}
              className={`rounded border px-3 py-1 text-sm ${
                entity === e
                  ? "border-zinc-900 bg-zinc-900 text-white"
                  : "border-zinc-200 bg-white text-zinc-700 hover:bg-zinc-50"
              }`}
            >
              {ENTITY_TYPE_LABELS[e]}
            </button>
          ))}
        </div>

        {loading ? (
          <p className="mt-4 text-sm text-zinc-500">Завантаження…</p>
        ) : (
          <div className="mt-4 grid gap-4 lg:grid-cols-2">
            <div className="rounded-lg border border-zinc-200 bg-white p-3">
              <h2 className="text-sm font-semibold text-zinc-900">Базові колонки</h2>
              <p className="mt-1 text-xs text-zinc-500">
                Завжди видимі. Налаштовуються в коді сторінки.
              </p>
              <ul className="mt-2 space-y-1 text-sm">
                {BASE_COLUMNS[entity].map((c) => (
                  <li key={c.key} className="flex items-center justify-between rounded bg-zinc-50 px-2 py-1">
                    <span>{c.label}</span>
                    <span className="font-mono text-xs text-zinc-400">{c.key}</span>
                  </li>
                ))}
              </ul>

              <h2 className="mt-4 text-sm font-semibold text-zinc-900">Активні додаткові колонки</h2>
              {fields.length === 0 ? (
                <p className="mt-2 text-xs text-zinc-500">Колонок ще немає.</p>
              ) : (
                <ul className="mt-2 space-y-2">
                  {fields.map((f, idx) => {
                    const isNative = !!f.fieldKey;
                    const defaultLabel = isNative
                      ? NATIVE_COLUMNS[entity].find((c) => c.key === f.fieldKey)?.label ?? f.fieldKey ?? ""
                      : f.customFieldDefinition?.label ?? "";
                    return (
                      <li
                        key={f.id}
                        className={`rounded border px-2 py-2 ${
                          f.hidden ? "border-zinc-200 bg-zinc-50 text-zinc-500" : "border-zinc-200 bg-white"
                        }`}
                      >
                        <div className="flex items-center gap-2">
                          <span className="font-mono text-xs text-zinc-500">{f.key}</span>
                          {!isNative ? (
                            <span className="rounded bg-violet-100 px-1 text-[10px] uppercase text-violet-700">
                              custom
                            </span>
                          ) : (
                            <span className="rounded bg-zinc-100 px-1 text-[10px] uppercase text-zinc-600">
                              native
                            </span>
                          )}
                        </div>
                        <div className="mt-1 flex flex-wrap items-center gap-2">
                          <input
                            className="min-w-[12rem] flex-1 rounded border border-zinc-200 px-2 py-1 text-sm"
                            defaultValue={f.label ?? defaultLabel}
                            placeholder={defaultLabel}
                            onBlur={(e) => {
                              const next = e.currentTarget.value;
                              if (next === (f.label ?? "")) return;
                              void onChangeLabel(f, next);
                            }}
                          />
                          <button
                            type="button"
                            className="rounded border border-zinc-200 px-2 py-1 text-xs"
                            onClick={() => onMove(f, -1)}
                            disabled={idx === 0}
                          >
                            ↑
                          </button>
                          <button
                            type="button"
                            className="rounded border border-zinc-200 px-2 py-1 text-xs"
                            onClick={() => onMove(f, 1)}
                            disabled={idx === fields.length - 1}
                          >
                            ↓
                          </button>
                          <button
                            type="button"
                            className="rounded border border-zinc-200 px-2 py-1 text-xs"
                            onClick={() => onToggleHidden(f)}
                          >
                            {f.hidden ? "Показати" : "Приховати"}
                          </button>
                          <button
                            type="button"
                            className="rounded border border-red-200 px-2 py-1 text-xs text-red-600"
                            onClick={() => onRemove(f)}
                          >
                            Видалити
                          </button>
                        </div>
                      </li>
                    );
                  })}
                </ul>
              )}
            </div>

            <div className="rounded-lg border border-zinc-200 bg-white p-3">
              <h2 className="text-sm font-semibold text-zinc-900">Нативні поля</h2>
              {availableNative.length === 0 ? (
                <p className="mt-2 text-xs text-zinc-500">Усі нативні поля додані.</p>
              ) : (
                <ul className="mt-2 space-y-1">
                  {availableNative.map((c) => (
                    <li key={c.key} className="flex items-center justify-between rounded border border-zinc-200 bg-white px-2 py-1">
                      <div className="min-w-0 flex-1">
                        <div className="truncate text-sm">{c.label}</div>
                        <div className="font-mono text-[10px] text-zinc-400">{c.key}</div>
                      </div>
                      <button
                        type="button"
                        className="rounded bg-zinc-900 px-2 py-1 text-xs text-white"
                        onClick={() => onAddNative(c.key)}
                      >
                        Додати
                      </button>
                    </li>
                  ))}
                </ul>
              )}

              <h2 className="mt-4 text-sm font-semibold text-zinc-900">Користувацькі поля</h2>
              {customFields.length === 0 ? (
                <p className="mt-2 text-xs text-zinc-500">
                  Користувацьких полів немає.{" "}
                  <Link href="/settings/metadata/custom-fields" className="text-zinc-700 underline">
                    Створити
                  </Link>
                  .
                </p>
              ) : availableCustom.length === 0 ? (
                <p className="mt-2 text-xs text-zinc-500">Усі користувацькі поля додані.</p>
              ) : (
                <ul className="mt-2 space-y-1">
                  {availableCustom.map((d) => (
                    <li key={d.id} className="flex items-center justify-between rounded border border-zinc-200 bg-white px-2 py-1">
                      <div className="min-w-0 flex-1">
                        <div className="truncate text-sm">{d.label}</div>
                        <div className="font-mono text-[10px] text-zinc-400">
                          {d.key} · {d.type}
                        </div>
                      </div>
                      <button
                        type="button"
                        className="rounded bg-zinc-900 px-2 py-1 text-xs text-white"
                        onClick={() => onAddCustom(d.id)}
                      >
                        Додати
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

function asError(e: unknown, fallback: string): string {
  if (typeof e === "object" && e && "message" in e) {
    return String((e as { message: unknown }).message);
  }
  return fallback;
}

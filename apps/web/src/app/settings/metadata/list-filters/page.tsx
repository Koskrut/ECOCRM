"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import { apiHttp } from "@/lib/api/client";
import {
  addLayoutField,
  ensureFilterDefaultLayout,
  removeLayoutField,
  type LayoutDto,
  type LayoutFieldDto,
} from "@/lib/api/resources/metadataHub";
import { ENTITY_TYPE_LABELS, type ListEntityType } from "@/lib/lists/columnCatalog";
import { customFieldTypeLabel } from "@/lib/custom-fields/presentation";

const ENTITY_TYPES: ListEntityType[] = ["COMPANY", "CONTACT", "ORDER", "LEAD"];

type CustomFieldDef = {
  id: string;
  key: string;
  label: string;
  type: string;
  isActive?: boolean;
};

const SKIP_TYPES = new Set(["JSON"]);

export default function ListFiltersAdminPage() {
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

  const loadEntity = useCallback(async (et: ListEntityType) => {
    setLoading(true);
    setErr(null);
    try {
      const [layoutResult, defsResult] = await Promise.all([
        ensureFilterDefaultLayout(et),
        apiHttp
          .get<{ items: CustomFieldDef[] }>(`/custom-fields/definitions?entityType=${encodeURIComponent(et)}`)
          .then((r) => r.data?.items ?? [])
          .catch(() => [] as CustomFieldDef[]),
      ]);
      setLayout(layoutResult);
      setCustomFields(defsResult.filter((d) => d.isActive !== false && !SKIP_TYPES.has(d.type)));
    } catch (e: unknown) {
      setErr(asError(e, "Не вдалося завантажити фільтри"));
      setLayout(null);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (role !== "ADMIN") return;
    void loadEntity(entity);
  }, [role, entity, loadEntity]);

  const section = layout?.sections[0] ?? null;
  const fields = useMemo(() => {
    const list = section?.fields ?? [];
    return [...list].sort((a, b) => a.sortOrder - b.sortOrder);
  }, [section]);

  const usedIds = useMemo(
    () => new Set(fields.map((field) => field.customFieldDefinitionId).filter((id): id is string => Boolean(id))),
    [fields],
  );

  const available = customFields.filter((field) => !usedIds.has(field.id));

  const onAdd = async (definitionId: string) => {
    if (!layout || !section) return;
    setErr(null);
    setMsg(null);
    try {
      const field = await addLayoutField(layout.id, section.id, {
        customFieldDefinitionId: definitionId,
        sortOrder: fields.length,
      });
      setLayout((prev) =>
        prev
          ? {
              ...prev,
              sections: prev.sections.map((item) =>
                item.id === section.id ? { ...item, fields: [...item.fields, field] } : item,
              ),
            }
          : prev,
      );
      setMsg("Поле додано у фільтр.");
    } catch (e: unknown) {
      setErr(asError(e, "Не вдалося додати поле у фільтр"));
    }
  };

  const onRemove = async (field: LayoutFieldDto) => {
    if (!layout || !section) return;
    setErr(null);
    setMsg(null);
    try {
      await removeLayoutField(layout.id, section.id, field.id);
      setLayout((prev) =>
        prev
          ? {
              ...prev,
              sections: prev.sections.map((item) =>
                item.id === section.id ? { ...item, fields: item.fields.filter((row) => row.id !== field.id) } : item,
              ),
            }
          : prev,
      );
      setMsg("Поле прибрано з фільтра.");
    } catch (e: unknown) {
      setErr(asError(e, "Не вдалося прибрати поле"));
    }
  };

  if (role !== "ADMIN") {
    return (
      <div className="p-6">
        <p className="text-sm text-zinc-600">Доступ тільки для адміністратора.</p>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-zinc-50 p-6">
      <div className="mx-auto max-w-5xl">
        <Link href="/settings/metadata" className="text-sm text-zinc-600 hover:text-zinc-900">
          ← Хаб метаданих
        </Link>
        <h1 className="mt-2 text-2xl font-bold text-zinc-900">Фільтри списків</h1>
        <p className="mt-2 max-w-3xl text-sm leading-relaxed text-zinc-600">
          Оберіть додаткові поля, за якими можна фільтрувати списки. Вони з’являться у вікні фільтра на сторінці
          контактів, компаній, замовлень або лідів. Спочатку створіть поле в{" "}
          <Link href="/settings/metadata/custom-fields" className="font-medium text-zinc-800 underline underline-offset-2">
            користувацьких полях
          </Link>
          .
        </p>

        {err ? <p className="mt-3 text-sm text-red-600">{err}</p> : null}
        {msg ? <p className="mt-3 text-sm text-emerald-700">{msg}</p> : null}

        <div className="mt-4 flex flex-wrap gap-2">
          {ENTITY_TYPES.map((item) => (
            <button
              key={item}
              type="button"
              onClick={() => setEntity(item)}
              className={`rounded-full px-3 py-1 text-sm font-medium ${
                entity === item ? "bg-zinc-900 text-white" : "border border-zinc-200 bg-white text-zinc-700"
              }`}
            >
              {ENTITY_TYPE_LABELS[item]}
            </button>
          ))}
        </div>

        {loading ? (
          <p className="mt-6 text-sm text-zinc-500">Завантаження…</p>
        ) : (
          <div className="mt-4 grid gap-4 lg:grid-cols-2">
            <section className="rounded-xl border border-zinc-200 bg-white p-4 shadow-sm">
              <h2 className="text-sm font-semibold text-zinc-900">У фільтрі зараз</h2>
              {fields.length === 0 ? (
                <p className="mt-3 text-sm text-zinc-500">Поки нічого. Додайте поле справа.</p>
              ) : (
                <ul className="mt-3 space-y-2">
                  {fields.map((field) => (
                    <li
                      key={field.id}
                      className="flex items-center justify-between gap-3 rounded-lg border border-zinc-200 px-3 py-2"
                    >
                      <div>
                        <div className="text-sm font-medium text-zinc-900">
                          {field.customFieldDefinition?.label || field.label || "Поле"}
                        </div>
                        <div className="text-xs text-zinc-500">
                          {customFieldTypeLabel(field.customFieldDefinition?.type ?? "")}
                        </div>
                      </div>
                      <button
                        type="button"
                        onClick={() => void onRemove(field)}
                        className="rounded-md border border-zinc-200 px-2 py-1 text-xs font-medium text-zinc-700 hover:bg-zinc-50"
                      >
                        Прибрати
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </section>

            <section className="rounded-xl border border-zinc-200 bg-white p-4 shadow-sm">
              <h2 className="text-sm font-semibold text-zinc-900">Доступні поля</h2>
              {customFields.length === 0 ? (
                <p className="mt-3 text-sm text-zinc-500">
                  Для цієї сутності ще немає полів.{" "}
                  <Link href="/settings/metadata/custom-fields" className="underline">
                    Створити
                  </Link>
                </p>
              ) : available.length === 0 ? (
                <p className="mt-3 text-sm text-zinc-500">Усі поля вже у фільтрі.</p>
              ) : (
                <ul className="mt-3 space-y-2">
                  {available.map((field) => (
                    <li
                      key={field.id}
                      className="flex items-center justify-between gap-3 rounded-lg border border-zinc-200 px-3 py-2"
                    >
                      <div>
                        <div className="text-sm font-medium text-zinc-900">{field.label}</div>
                        <div className="text-xs text-zinc-500">{customFieldTypeLabel(field.type)}</div>
                      </div>
                      <button
                        type="button"
                        onClick={() => void onAdd(field.id)}
                        className="rounded-md bg-zinc-900 px-3 py-1.5 text-xs font-medium text-white hover:bg-zinc-800"
                      >
                        Додати у фільтр
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </section>
          </div>
        )}
      </div>
    </div>
  );
}

function asError(e: unknown, fallback: string): string {
  if (typeof e === "object" && e && "message" in e) {
    const message = String((e as { message: unknown }).message);
    if (message && !/^[A-Z0-9_]+$/.test(message)) return message;
  }
  return fallback;
}

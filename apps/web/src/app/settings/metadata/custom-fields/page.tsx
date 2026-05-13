"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import { apiHttp } from "@/lib/api/client";
import { ApiError, getUserFriendlyApiError } from "@/lib/api/errors";
import { useConfirm, useToast } from "@/components/feedback";

function apiErrMsg(e: unknown, fallback: string): string {
  if (e instanceof ApiError) return e.message;
  return getUserFriendlyApiError(e, fallback);
}

const ENTITY_TYPES = [
  "CONTACT",
  "COMPANY",
  "LEAD",
  "ORDER",
  "PRODUCT",
  "TASK",
  "ACTIVITY",
] as const;

const ENTITY_LABELS: Record<(typeof ENTITY_TYPES)[number], string> = {
  CONTACT: "Контакт",
  COMPANY: "Компанія",
  LEAD: "Лід",
  ORDER: "Замовлення",
  PRODUCT: "Товар",
  TASK: "Задача",
  ACTIVITY: "Активність",
};

const FIELD_TYPES: { value: string; label: string; hint: string }[] = [
  { value: "TEXT", label: "Текст", hint: "Довільний рядок." },
  { value: "NUMBER", label: "Число", hint: "Ціле або дробове." },
  { value: "MONEY", label: "Гроші", hint: "Числове значення суми." },
  { value: "BOOLEAN", label: "Так / ні", hint: "Логічне значення." },
  { value: "DATE", label: "Дата", hint: "Календарна дата." },
  { value: "SELECT", label: "Список (один)", hint: "Потрібні варіанти — додайте після створення або в редагуванні." },
  { value: "MULTISELECT", label: "Список (кілька)", hint: "Кілька значень з варіантів." },
  { value: "JSON", label: "JSON", hint: "Структуровані дані (для досвідчених користувачів)." },
  { value: "USER", label: "Користувач", hint: "Посилання на користувача системи." },
  {
    value: "DICTIONARY_ITEM",
    label: "Елемент довідника",
    hint: "Значення з існуючого довідника — оберіть довідник нижче.",
  },
];

type DictRow = { id: string; key: string; name: string };

type DefinitionOption = {
  id: string;
  key: string;
  label: string;
  value?: string | null;
  sortOrder?: number;
  isActive?: boolean;
  deletedAt?: string | null;
};

type DefinitionItem = {
  id: string;
  key: string;
  label: string;
  entityType: string;
  type: string;
  description?: string | null;
  required?: boolean;
  isActive?: boolean;
  system?: boolean;
  dictionaryId?: string | null;
  options?: DefinitionOption[];
  dictionary?: { id: string; key: string; name: string } | null;
};

function RoleSkeleton() {
  return (
    <div className="min-h-screen bg-zinc-50 p-6">
      <div className="mx-auto max-w-5xl animate-pulse space-y-3">
        <div className="h-4 w-40 rounded bg-zinc-200" />
        <div className="h-8 w-72 rounded bg-zinc-200" />
        <div className="h-32 rounded-lg bg-zinc-200" />
        <div className="h-64 rounded-lg bg-zinc-200" />
      </div>
    </div>
  );
}

export default function CustomFieldsMetadataPage() {
  const { pushToast } = useToast();
  const { confirm } = useConfirm();

  const [authLoading, setAuthLoading] = useState(true);
  const [role, setRole] = useState<string | null>(null);
  const [items, setItems] = useState<DefinitionItem[]>([]);
  const [listLoading, setListLoading] = useState(false);
  const [dictionaries, setDictionaries] = useState<DictRow[]>([]);

  const [includeInactive, setIncludeInactive] = useState(false);
  const [filterEntity, setFilterEntity] = useState<string>("ALL");
  const [search, setSearch] = useState("");

  const [createOpen, setCreateOpen] = useState(false);
  const [cfEntity, setCfEntity] = useState<(typeof ENTITY_TYPES)[number]>("CONTACT");
  const [cfKey, setCfKey] = useState("");
  const [cfLabel, setCfLabel] = useState("");
  const [cfType, setCfType] = useState("TEXT");
  const [cfDictionaryId, setCfDictionaryId] = useState<string>("");
  const [creating, setCreating] = useState(false);

  const [editingId, setEditingId] = useState<string | null>(null);
  const [editLoading, setEditLoading] = useState(false);
  const [editDef, setEditDef] = useState<DefinitionItem | null>(null);
  const [editLabel, setEditLabel] = useState("");
  const [editDescription, setEditDescription] = useState("");
  const [editRequired, setEditRequired] = useState(false);
  const [editActive, setEditActive] = useState(true);
  const [editDictionaryId, setEditDictionaryId] = useState<string>("");
  const [editSaving, setEditSaving] = useState(false);
  const [newOptKey, setNewOptKey] = useState("");
  const [newOptLabel, setNewOptLabel] = useState("");
  const [optBusy, setOptBusy] = useState(false);

  const refresh = useCallback(async () => {
    setListLoading(true);
    try {
      const r = await apiHttp.get<{ items: DefinitionItem[] }>("/custom-fields/definitions", {
        params: includeInactive ? { includeInactive: "true" } : undefined,
      });
      setItems(r.data?.items ?? []);
    } catch (e) {
      pushToast(apiErrMsg(e, "Не вдалося завантажити поля"), "error");
    } finally {
      setListLoading(false);
    }
  }, [includeInactive, pushToast]);

  useEffect(() => {
    apiHttp
      .get<{ user?: { role?: string } }>("/auth/me")
      .then((r) => setRole(r.data?.user?.role ?? null))
      .catch(() => setRole(null))
      .finally(() => setAuthLoading(false));
  }, []);

  useEffect(() => {
    if (role !== "ADMIN") return;
    void refresh();
  }, [role, refresh]);

  useEffect(() => {
    if (role !== "ADMIN") return;
    void apiHttp
      .get<{ items: DictRow[] }>("/dictionaries")
      .then((r) => setDictionaries(r.data?.items ?? []))
      .catch(() => setDictionaries([]));
  }, [role]);

  const openEdit = async (id: string) => {
    setEditingId(id);
    setEditLoading(true);
    setEditDef(null);
    try {
      const r = await apiHttp.get<{ definition: DefinitionItem }>(`/custom-fields/definitions/${encodeURIComponent(id)}`);
      const d = r.data?.definition;
      if (!d) throw new Error("empty");
      setEditDef(d);
      setEditLabel(d.label);
      setEditDescription(d.description ?? "");
      setEditRequired(d.required === true);
      setEditActive(d.isActive !== false);
      setEditDictionaryId(d.dictionaryId ?? d.dictionary?.id ?? "");
    } catch (e) {
      pushToast(apiErrMsg(e, "Не вдалося відкрити поле"), "error");
      setEditingId(null);
    } finally {
      setEditLoading(false);
    }
  };

  const saveEdit = async () => {
    if (!editingId) return;
    setEditSaving(true);
    try {
      const body: Record<string, unknown> = {
        label: editLabel.trim(),
        description: editDescription.trim() || null,
        required: editRequired,
        isActive: editActive,
      };
      if (editDef?.type === "DICTIONARY_ITEM") {
        body.dictionaryId = editDictionaryId || null;
      }
      await apiHttp.patch(`/custom-fields/definitions/${encodeURIComponent(editingId)}`, body);
      pushToast("Збережено.", "success");
      await refresh();
      setEditingId(null);
      setEditDef(null);
    } catch (e) {
      pushToast(apiErrMsg(e, "Не вдалося зберегти"), "error");
    } finally {
      setEditSaving(false);
    }
  };

  const addOption = async () => {
    if (!editingId || !newOptKey.trim() || !newOptLabel.trim()) {
      pushToast("Вкажіть ключ і назву варіанта.", "error");
      return;
    }
    setOptBusy(true);
    try {
      await apiHttp.post(`/custom-fields/definitions/${encodeURIComponent(editingId)}/options`, {
        key: newOptKey.trim().toLowerCase(),
        label: newOptLabel.trim(),
        isActive: true,
      });
      pushToast("Варіант додано.", "success");
      setNewOptKey("");
      setNewOptLabel("");
      const r = await apiHttp.get<{ definition: DefinitionItem }>(
        `/custom-fields/definitions/${encodeURIComponent(editingId)}`,
      );
      setEditDef(r.data?.definition ?? null);
      await refresh();
    } catch (e) {
      pushToast(apiErrMsg(e, "Не вдалося додати варіант"), "error");
    } finally {
      setOptBusy(false);
    }
  };

  const removeOption = async (optId: string) => {
    if (!editingId) return;
    const ok = await confirm({
      title: "Прибрати варіант?",
      message: "Варіант буде деактивовано (м’яке видалення).",
      destructive: true,
      confirmText: "Прибрати",
    });
    if (!ok) return;
    setOptBusy(true);
    try {
      await apiHttp.delete(`/custom-fields/definitions/${encodeURIComponent(editingId)}/options/${encodeURIComponent(optId)}`);
      pushToast("Варіант прибрано.", "success");
      const r = await apiHttp.get<{ definition: DefinitionItem }>(
        `/custom-fields/definitions/${encodeURIComponent(editingId)}`,
      );
      setEditDef(r.data?.definition ?? null);
      await refresh();
    } catch (e) {
      pushToast(apiErrMsg(e, "Не вдалося прибрати варіант"), "error");
    } finally {
      setOptBusy(false);
    }
  };

  const deactivateField = async (row: DefinitionItem) => {
    const ok = await confirm({
      title: "Деактивувати поле?",
      message: `Поле «${row.label}» зникне з форм, дані значень збережуться.`,
      confirmText: "Деактивувати",
    });
    if (!ok) return;
    try {
      await apiHttp.patch(`/custom-fields/definitions/${encodeURIComponent(row.id)}`, { isActive: false });
      pushToast("Поле деактивовано.", "success");
      await refresh();
    } catch (e) {
      pushToast(apiErrMsg(e, "Не вдалося деактивувати"), "error");
    }
  };

  const activateField = async (row: DefinitionItem) => {
    try {
      await apiHttp.patch(`/custom-fields/definitions/${encodeURIComponent(row.id)}`, { isActive: true });
      pushToast("Поле знову активне.", "success");
      await refresh();
    } catch (e) {
      pushToast(apiErrMsg(e, "Не вдалося активувати"), "error");
    }
  };

  const deleteField = async (row: DefinitionItem) => {
    const ok = await confirm({
      title: "Видалити визначення поля?",
      message: `Поле «${row.label}» буде приховано (м’яке видалення). Цю дію не можна скасувати через UI.`,
      destructive: true,
      confirmText: "Видалити",
    });
    if (!ok) return;
    try {
      await apiHttp.delete(`/custom-fields/definitions/${encodeURIComponent(row.id)}`);
      pushToast("Поле видалено.", "success");
      await refresh();
    } catch (e) {
      pushToast(apiErrMsg(e, "Не вдалося видалити"), "error");
    }
  };

  const createField = async () => {
    if (!cfKey.trim() || !cfLabel.trim()) {
      pushToast("Заповніть ключ і назву поля.", "error");
      return;
    }
    if (cfType === "DICTIONARY_ITEM" && !cfDictionaryId) {
      pushToast("Оберіть довідник для типу «Елемент довідника».", "error");
      return;
    }
    setCreating(true);
    try {
      const body: Record<string, unknown> = {
        entityType: cfEntity,
        key: cfKey.trim(),
        label: cfLabel.trim(),
        type: cfType,
        isActive: true,
      };
      if (cfType === "DICTIONARY_ITEM") body.dictionaryId = cfDictionaryId;
      await apiHttp.post("/custom-fields/definitions", body);
      pushToast("Поле створено.", "success");
      setCfKey("");
      setCfLabel("");
      setCfDictionaryId("");
      setCreateOpen(false);
      await refresh();
    } catch (e) {
      pushToast(apiErrMsg(e, "Не вдалося створити поле"), "error");
    } finally {
      setCreating(false);
    }
  };

  const filteredItems = useMemo(() => {
    const q = search.trim().toLowerCase();
    return items.filter((it) => {
      if (filterEntity !== "ALL" && it.entityType !== filterEntity) return false;
      if (!q) return true;
      return (
        it.key.toLowerCase().includes(q) ||
        it.label.toLowerCase().includes(q) ||
        (it.description ?? "").toLowerCase().includes(q)
      );
    });
  }, [items, filterEntity, search]);

  const typeHint = FIELD_TYPES.find((t) => t.value === cfType)?.hint;

  if (authLoading) {
    return <RoleSkeleton />;
  }

  if (role !== "ADMIN") {
    return (
      <div className="p-6">
        <p className="text-sm text-zinc-600">Доступ тільки для ADMIN.</p>
      </div>
    );
  }

  const showOptionsEditor = editDef?.type === "SELECT" || editDef?.type === "MULTISELECT";

  return (
    <div className="min-h-screen bg-zinc-50 p-6">
      <div className="mx-auto max-w-5xl">
        <Link href="/settings/metadata" className="text-sm text-zinc-600 hover:text-zinc-900">
          ← Хаб метаданих
        </Link>
        <h1 className="mt-2 text-2xl font-bold text-zinc-900">Користувацькі поля</h1>
        <p className="mt-2 max-w-3xl text-sm leading-relaxed text-zinc-600">
          Додаткові поля для сутностей CRM: спочатку визначте поле тут, потім воно з’явиться в картках (де підключено) і в{" "}
          <Link href="/settings/metadata/list-columns" className="font-medium text-zinc-800 underline underline-offset-2">
            колонках списків
          </Link>
          . Для типу «Елемент довідника» спочатку створіть{" "}
          <Link href="/settings/metadata/dictionaries" className="font-medium text-zinc-800 underline underline-offset-2">
            довідник
          </Link>
          .
        </p>

        <div className="mt-4 flex flex-wrap items-center gap-3">
          <label className="flex items-center gap-2 text-sm text-zinc-700">
            <input
              type="checkbox"
              checked={includeInactive}
              onChange={(e) => setIncludeInactive(e.target.checked)}
              className="rounded border-zinc-300"
            />
            Показувати неактивні
          </label>
          <button
            type="button"
            onClick={() => void refresh()}
            className="rounded-md border border-zinc-200 bg-white px-3 py-1.5 text-sm font-medium text-zinc-800 hover:bg-zinc-50 disabled:opacity-50"
            disabled={listLoading}
          >
            Оновити
          </button>
          <button
            type="button"
            onClick={() => setCreateOpen((v) => !v)}
            className="rounded-md bg-zinc-900 px-3 py-1.5 text-sm font-medium text-white hover:bg-zinc-800"
          >
            {createOpen ? "Згорнути форму" : "Нове поле"}
          </button>
        </div>

        {createOpen ? (
          <div className="mt-4 rounded-xl border border-zinc-200 bg-white p-4 shadow-sm">
            <h2 className="text-sm font-semibold text-zinc-900">Створити визначення</h2>
            <p className="mt-1 text-xs text-zinc-500">
              Ключ — латиниця в нижньому регістрі, літери, цифри, крапки та підкреслення (наприклад{" "}
              <code className="rounded bg-zinc-100 px-1">client.segment</code>).
            </p>
            <div className="mt-4 grid gap-4 sm:grid-cols-2">
              <div>
                <label className="text-xs font-medium uppercase tracking-wide text-zinc-500">Сутність</label>
                <select
                  className="mt-1 w-full rounded-md border border-zinc-200 px-3 py-2 text-sm"
                  value={cfEntity}
                  onChange={(e) => setCfEntity(e.target.value as (typeof ENTITY_TYPES)[number])}
                >
                  {ENTITY_TYPES.map((e) => (
                    <option key={e} value={e}>
                      {ENTITY_LABELS[e]} ({e})
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="text-xs font-medium uppercase tracking-wide text-zinc-500">Тип поля</label>
                <select
                  className="mt-1 w-full rounded-md border border-zinc-200 px-3 py-2 text-sm"
                  value={cfType}
                  onChange={(e) => setCfType(e.target.value)}
                >
                  {FIELD_TYPES.map((t) => (
                    <option key={t.value} value={t.value}>
                      {t.label}
                    </option>
                  ))}
                </select>
                {typeHint ? <p className="mt-1 text-xs text-zinc-500">{typeHint}</p> : null}
              </div>
              <div className="sm:col-span-2">
                <label className="text-xs font-medium uppercase tracking-wide text-zinc-500">Ключ (технічний)</label>
                <input
                  className="mt-1 w-full rounded-md border border-zinc-200 px-3 py-2 font-mono text-sm"
                  value={cfKey}
                  onChange={(e) => setCfKey(e.target.value)}
                  placeholder="наприклад client.segment"
                />
              </div>
              <div className="sm:col-span-2">
                <label className="text-xs font-medium uppercase tracking-wide text-zinc-500">Назва для людей</label>
                <input
                  className="mt-1 w-full rounded-md border border-zinc-200 px-3 py-2 text-sm"
                  value={cfLabel}
                  onChange={(e) => setCfLabel(e.target.value)}
                  placeholder="Наприклад, Сегмент клієнта"
                />
              </div>
              {cfType === "DICTIONARY_ITEM" ? (
                <div className="sm:col-span-2">
                  <label className="text-xs font-medium uppercase tracking-wide text-zinc-500">Довідник</label>
                  <select
                    className="mt-1 w-full rounded-md border border-zinc-200 px-3 py-2 text-sm"
                    value={cfDictionaryId}
                    onChange={(e) => setCfDictionaryId(e.target.value)}
                  >
                    <option value="">— Оберіть —</option>
                    {dictionaries.map((d) => (
                      <option key={d.id} value={d.id}>
                        {d.name} ({d.key})
                      </option>
                    ))}
                  </select>
                </div>
              ) : null}
            </div>
            <div className="mt-4 flex flex-wrap gap-2">
              <button
                type="button"
                disabled={creating}
                onClick={() => void createField()}
                className="rounded-md bg-zinc-900 px-4 py-2 text-sm font-medium text-white hover:bg-zinc-800 disabled:opacity-50"
              >
                {creating ? "Створення…" : "Створити поле"}
              </button>
            </div>
          </div>
        ) : null}

        <div className="mt-6 flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              onClick={() => setFilterEntity("ALL")}
              className={`rounded-full px-3 py-1 text-xs font-medium ${
                filterEntity === "ALL" ? "bg-zinc-900 text-white" : "border border-zinc-200 bg-white text-zinc-700"
              }`}
            >
              Усі
            </button>
            {ENTITY_TYPES.map((e) => (
              <button
                key={e}
                type="button"
                onClick={() => setFilterEntity(e)}
                className={`rounded-full px-3 py-1 text-xs font-medium ${
                  filterEntity === e ? "bg-zinc-900 text-white" : "border border-zinc-200 bg-white text-zinc-700"
                }`}
              >
                {ENTITY_LABELS[e]}
              </button>
            ))}
          </div>
          <div className="w-full sm:max-w-xs">
            <label className="text-xs font-medium uppercase tracking-wide text-zinc-500">Пошук</label>
            <input
              className="mt-1 w-full rounded-md border border-zinc-200 px-3 py-2 text-sm"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Ключ або назва…"
            />
          </div>
        </div>

        <div className="mt-4 overflow-hidden rounded-xl border border-zinc-200 bg-white shadow-sm">
          {listLoading ? (
            <div className="p-8 text-center text-sm text-zinc-500">Завантаження…</div>
          ) : filteredItems.length === 0 ? (
            <div className="p-8 text-center text-sm text-zinc-500">Нічого не знайдено. Створіть перше поле.</div>
          ) : (
            <div className="overflow-x-auto">
              <table className="min-w-full text-left text-sm">
                <thead className="border-b border-zinc-100 bg-zinc-50 text-xs uppercase tracking-wide text-zinc-500">
                  <tr>
                    <th className="px-4 py-3">Сутність</th>
                    <th className="px-4 py-3">Ключ</th>
                    <th className="px-4 py-3">Назва</th>
                    <th className="px-4 py-3">Тип</th>
                    <th className="px-4 py-3">Статус</th>
                    <th className="px-4 py-3 text-right">Дії</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredItems.map((it) => (
                    <tr key={it.id} className="border-b border-zinc-50 hover:bg-zinc-50/80">
                      <td className="px-4 py-3 text-zinc-800">{ENTITY_LABELS[it.entityType as keyof typeof ENTITY_LABELS] ?? it.entityType}</td>
                      <td className="px-4 py-3 font-mono text-xs text-zinc-600">{it.key}</td>
                      <td className="px-4 py-3 font-medium text-zinc-900">{it.label}</td>
                      <td className="px-4 py-3 text-zinc-600">{FIELD_TYPES.find((t) => t.value === it.type)?.label ?? it.type}</td>
                      <td className="px-4 py-3">
                        {it.isActive === false ? (
                          <span className="rounded-full bg-amber-100 px-2 py-0.5 text-xs font-medium text-amber-900">Неактивне</span>
                        ) : (
                          <span className="rounded-full bg-emerald-100 px-2 py-0.5 text-xs font-medium text-emerald-900">Активне</span>
                        )}
                      </td>
                      <td className="px-4 py-3 text-right">
                        <div className="flex flex-wrap justify-end gap-2">
                          <button
                            type="button"
                            onClick={() => void openEdit(it.id)}
                            className="rounded-md border border-zinc-200 bg-white px-2 py-1 text-xs font-medium text-zinc-800 hover:bg-zinc-50"
                          >
                            Редагувати
                          </button>
                          {it.isActive !== false ? (
                            <button
                              type="button"
                              onClick={() => void deactivateField(it)}
                              className="rounded-md border border-zinc-200 bg-white px-2 py-1 text-xs font-medium text-zinc-700 hover:bg-zinc-50"
                            >
                              Деактивувати
                            </button>
                          ) : (
                            <button
                              type="button"
                              onClick={() => void activateField(it)}
                              className="rounded-md border border-zinc-200 bg-white px-2 py-1 text-xs font-medium text-zinc-700 hover:bg-zinc-50"
                            >
                              Активувати
                            </button>
                          )}
                          <button
                            type="button"
                            onClick={() => void deleteField(it)}
                            className="rounded-md border border-red-200 bg-red-50 px-2 py-1 text-xs font-medium text-red-800 hover:bg-red-100"
                          >
                            Видалити
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>

      {editingId ? (
        <div className="fixed inset-0 z-[100] flex items-end justify-center bg-black/40 p-4 sm:items-center">
          <div className="max-h-[90vh] w-full max-w-lg overflow-y-auto rounded-xl border border-zinc-200 bg-white p-5 shadow-xl">
            <div className="flex items-start justify-between gap-2">
              <h2 className="text-lg font-semibold text-zinc-900">Редагування поля</h2>
              <button
                type="button"
                className="rounded-md px-2 py-1 text-sm text-zinc-500 hover:bg-zinc-100"
                onClick={() => {
                  setEditingId(null);
                  setEditDef(null);
                }}
              >
                Закрити
              </button>
            </div>
            {editLoading ? (
              <p className="mt-4 text-sm text-zinc-500">Завантаження…</p>
            ) : editDef ? (
              <>
                <p className="mt-1 font-mono text-xs text-zinc-500">
                  {editDef.entityType} · {editDef.key} · {editDef.type}
                </p>
                <div className="mt-4 space-y-3">
                  <div>
                    <label className="text-xs font-medium text-zinc-500">Назва</label>
                    <input
                      className="mt-1 w-full rounded-md border border-zinc-200 px-3 py-2 text-sm"
                      value={editLabel}
                      onChange={(e) => setEditLabel(e.target.value)}
                    />
                  </div>
                  <div>
                    <label className="text-xs font-medium text-zinc-500">Опис (підказка в UI)</label>
                    <textarea
                      className="mt-1 w-full rounded-md border border-zinc-200 px-3 py-2 text-sm"
                      rows={2}
                      value={editDescription}
                      onChange={(e) => setEditDescription(e.target.value)}
                    />
                  </div>
                  <label className="flex items-center gap-2 text-sm text-zinc-800">
                    <input type="checkbox" checked={editRequired} onChange={(e) => setEditRequired(e.target.checked)} />
                    Обовʼязкове поле
                  </label>
                  <label className="flex items-center gap-2 text-sm text-zinc-800">
                    <input type="checkbox" checked={editActive} onChange={(e) => setEditActive(e.target.checked)} />
                    Активне
                  </label>
                  {editDef.type === "DICTIONARY_ITEM" ? (
                    <div>
                      <label className="text-xs font-medium text-zinc-500">Довідник</label>
                      <select
                        className="mt-1 w-full rounded-md border border-zinc-200 px-3 py-2 text-sm"
                        value={editDictionaryId}
                        onChange={(e) => setEditDictionaryId(e.target.value)}
                      >
                        <option value="">—</option>
                        {dictionaries.map((d) => (
                          <option key={d.id} value={d.id}>
                            {d.name} ({d.key})
                          </option>
                        ))}
                      </select>
                    </div>
                  ) : null}
                </div>

                {showOptionsEditor ? (
                  <div className="mt-6 border-t border-zinc-100 pt-4">
                    <h3 className="text-sm font-semibold text-zinc-900">Варіанти списку</h3>
                    <ul className="mt-2 max-h-40 space-y-1 overflow-y-auto text-sm">
                      {(editDef.options ?? []).filter((o) => !o.deletedAt).map((o) => (
                        <li key={o.id} className="flex items-center justify-between gap-2 rounded-md bg-zinc-50 px-2 py-1.5">
                          <span>
                            <span className="font-mono text-xs text-zinc-600">{o.key}</span> — {o.label}
                          </span>
                          <button
                            type="button"
                            disabled={optBusy}
                            onClick={() => void removeOption(o.id)}
                            className="text-xs font-medium text-red-700 hover:underline disabled:opacity-50"
                          >
                            Прибрати
                          </button>
                        </li>
                      ))}
                    </ul>
                    <div className="mt-3 grid gap-2 sm:grid-cols-2">
                      <input
                        className="rounded-md border border-zinc-200 px-2 py-1.5 font-mono text-xs"
                        placeholder="ключ варіанта"
                        value={newOptKey}
                        onChange={(e) => setNewOptKey(e.target.value)}
                      />
                      <input
                        className="rounded-md border border-zinc-200 px-2 py-1.5 text-sm"
                        placeholder="Назва варіанта"
                        value={newOptLabel}
                        onChange={(e) => setNewOptLabel(e.target.value)}
                      />
                    </div>
                    <button
                      type="button"
                      disabled={optBusy}
                      onClick={() => void addOption()}
                      className="mt-2 rounded-md border border-zinc-200 bg-white px-3 py-1.5 text-xs font-medium text-zinc-800 hover:bg-zinc-50 disabled:opacity-50"
                    >
                      Додати варіант
                    </button>
                  </div>
                ) : null}

                <div className="mt-6 flex justify-end gap-2 border-t border-zinc-100 pt-4">
                  <button
                    type="button"
                    className="rounded-md border border-zinc-200 px-4 py-2 text-sm text-zinc-700 hover:bg-zinc-50"
                    onClick={() => {
                      setEditingId(null);
                      setEditDef(null);
                    }}
                  >
                    Скасувати
                  </button>
                  <button
                    type="button"
                    disabled={editSaving}
                    onClick={() => void saveEdit()}
                    className="rounded-md bg-zinc-900 px-4 py-2 text-sm font-medium text-white hover:bg-zinc-800 disabled:opacity-50"
                  >
                    {editSaving ? "Збереження…" : "Зберегти"}
                  </button>
                </div>
              </>
            ) : null}
          </div>
        </div>
      ) : null}
    </div>
  );
}

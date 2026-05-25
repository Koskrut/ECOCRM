"use client";

import { useCallback, useEffect, useState } from "react";
import {
  createWarehouse,
  deleteWarehouse,
  listWarehouses,
  updateWarehouse,
  type WarehouseItem,
} from "@/lib/api/resources/warehouses";

type WarehousesModalProps = {
  open: boolean;
  onClose: () => void;
  onChanged: () => void;
};

type EditDraft = {
  name: string;
  sortOrder: string;
  externalCode: string;
};

export function WarehousesModal({ open, onClose, onChanged }: WarehousesModalProps) {
  const [items, setItems] = useState<WarehouseItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editDraft, setEditDraft] = useState<EditDraft | null>(null);
  const [saving, setSaving] = useState(false);

  const [newName, setNewName] = useState("");
  const [newSortOrder, setNewSortOrder] = useState("");
  const [newExternalCode, setNewExternalCode] = useState("");
  const [creating, setCreating] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const rows = await listWarehouses();
      setItems(rows);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Не удалось загрузить склады");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (open) void load();
    else {
      setEditingId(null);
      setEditDraft(null);
      setNewName("");
      setNewSortOrder("");
      setNewExternalCode("");
      setError(null);
    }
  }, [open, load]);

  const startEdit = (wh: WarehouseItem) => {
    setEditingId(wh.id);
    setEditDraft({
      name: wh.name,
      sortOrder: String(wh.sortOrder),
      externalCode: wh.externalCode ?? "",
    });
  };

  const handleSaveEdit = async () => {
    if (!editingId || !editDraft) return;
    const name = editDraft.name.trim();
    if (!name) {
      setError("Название склада обязательно");
      return;
    }
    setSaving(true);
    setError(null);
    try {
      await updateWarehouse(editingId, {
        name,
        sortOrder: Math.floor(Number(editDraft.sortOrder) || 0),
        externalCode: editDraft.externalCode.trim() || null,
      });
      setEditingId(null);
      setEditDraft(null);
      await load();
      onChanged();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Ошибка сохранения");
    } finally {
      setSaving(false);
    }
  };

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    const name = newName.trim();
    if (!name) {
      setError("Введите название склада");
      return;
    }
    setCreating(true);
    setError(null);
    try {
      await createWarehouse({
        name,
        sortOrder: newSortOrder.trim() ? Math.floor(Number(newSortOrder)) : undefined,
        externalCode: newExternalCode.trim() || null,
      });
      setNewName("");
      setNewSortOrder("");
      setNewExternalCode("");
      await load();
      onChanged();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Ошибка создания");
    } finally {
      setCreating(false);
    }
  };

  const handleDelete = async (wh: WarehouseItem) => {
    if (!confirm(`Удалить склад «${wh.name}»?`)) return;
    setError(null);
    try {
      await deleteWarehouse(wh.id);
      await load();
      onChanged();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Не удалось удалить склад");
    }
  };

  const moveSortOrder = async (wh: WarehouseItem, delta: number) => {
    setError(null);
    try {
      await updateWarehouse(wh.id, { sortOrder: wh.sortOrder + delta });
      await load();
      onChanged();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Ошибка изменения порядка");
    }
  };

  if (!open) return null;

  const sorted = [...items].sort((a, b) => a.sortOrder - b.sortOrder);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30 px-4 backdrop-blur-sm">
      <div className="max-h-[90vh] w-full max-w-2xl overflow-y-auto rounded-2xl bg-white p-6 shadow-xl">
        <div className="mb-4 flex items-start justify-between gap-3">
          <div>
            <h2 className="text-lg font-semibold text-zinc-900">Склады</h2>
            <p className="mt-1 text-sm text-zinc-600">
              Порядок влияет на колонки каталога и склад по умолчанию в заказах. Импорт Excel
              ищет колонки по названию склада.
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded p-1.5 text-zinc-500 hover:bg-zinc-100"
            aria-label="Закрыть"
          >
            <svg className="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        {error && (
          <p className="mb-3 text-sm text-red-600" role="alert">
            {error}
          </p>
        )}

        {loading ? (
          <p className="text-sm text-zinc-600">Загрузка…</p>
        ) : (
          <div className="overflow-x-auto rounded-lg border border-zinc-200">
            <table className="w-full text-sm">
              <thead className="bg-zinc-50 text-left text-xs font-medium uppercase text-zinc-500">
                <tr>
                  <th className="px-3 py-2">Название</th>
                  <th className="px-3 py-2 w-20">Порядок</th>
                  <th className="px-3 py-2">Код 1С</th>
                  <th className="px-3 py-2 w-36" />
                </tr>
              </thead>
              <tbody>
                {sorted.map((wh) =>
                  editingId === wh.id && editDraft ? (
                    <tr key={wh.id} className="border-t border-zinc-100 bg-zinc-50/80">
                      <td className="px-3 py-2">
                        <input
                          value={editDraft.name}
                          onChange={(e) =>
                            setEditDraft((d) => (d ? { ...d, name: e.target.value } : d))
                          }
                          className="w-full rounded border border-zinc-300 px-2 py-1 text-sm"
                        />
                      </td>
                      <td className="px-3 py-2">
                        <input
                          value={editDraft.sortOrder}
                          onChange={(e) =>
                            setEditDraft((d) => (d ? { ...d, sortOrder: e.target.value } : d))
                          }
                          inputMode="numeric"
                          className="w-full rounded border border-zinc-300 px-2 py-1 text-sm"
                        />
                      </td>
                      <td className="px-3 py-2">
                        <input
                          value={editDraft.externalCode}
                          onChange={(e) =>
                            setEditDraft((d) =>
                              d ? { ...d, externalCode: e.target.value } : d,
                            )
                          }
                          className="w-full rounded border border-zinc-300 px-2 py-1 text-sm font-mono"
                          placeholder="000000190"
                        />
                      </td>
                      <td className="px-3 py-2">
                        <div className="flex gap-1">
                          <button
                            type="button"
                            onClick={() => void handleSaveEdit()}
                            disabled={saving}
                            className="btn-primary px-2 py-1 text-xs"
                          >
                            {saving ? "…" : "OK"}
                          </button>
                          <button
                            type="button"
                            onClick={() => {
                              setEditingId(null);
                              setEditDraft(null);
                            }}
                            className="rounded border border-zinc-300 px-2 py-1 text-xs"
                          >
                            Отмена
                          </button>
                        </div>
                      </td>
                    </tr>
                  ) : (
                    <tr key={wh.id} className="border-t border-zinc-100">
                      <td className="px-3 py-2 font-medium text-zinc-900">{wh.name}</td>
                      <td className="px-3 py-2 tabular-nums text-zinc-700">{wh.sortOrder}</td>
                      <td className="px-3 py-2 font-mono text-xs text-zinc-600">
                        {wh.externalCode ?? "—"}
                      </td>
                      <td className="px-3 py-2">
                        <div className="flex flex-wrap items-center gap-1">
                          <button
                            type="button"
                            title="Выше"
                            onClick={() => void moveSortOrder(wh, -1)}
                            className="rounded border border-zinc-300 px-1.5 py-0.5 text-xs hover:bg-zinc-50"
                          >
                            ↑
                          </button>
                          <button
                            type="button"
                            title="Ниже"
                            onClick={() => void moveSortOrder(wh, 1)}
                            className="rounded border border-zinc-300 px-1.5 py-0.5 text-xs hover:bg-zinc-50"
                          >
                            ↓
                          </button>
                          <button
                            type="button"
                            onClick={() => startEdit(wh)}
                            className="rounded border border-zinc-300 px-2 py-0.5 text-xs hover:bg-zinc-50"
                          >
                            Изменить
                          </button>
                          <button
                            type="button"
                            onClick={() => void handleDelete(wh)}
                            className="rounded border border-red-200 px-2 py-0.5 text-xs text-red-700 hover:bg-red-50"
                          >
                            Удалить
                          </button>
                        </div>
                      </td>
                    </tr>
                  ),
                )}
              </tbody>
            </table>
          </div>
        )}

        <form onSubmit={(e) => void handleCreate(e)} className="mt-6 border-t border-zinc-200 pt-4">
          <p className="mb-2 text-sm font-medium text-zinc-800">Добавить склад</p>
          <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
            <input
              value={newName}
              onChange={(e) => setNewName(e.target.value)}
              placeholder="Название"
              className="rounded-md border border-zinc-300 px-3 py-2 text-sm"
            />
            <input
              value={newSortOrder}
              onChange={(e) => setNewSortOrder(e.target.value)}
              placeholder="Порядок (авто)"
              inputMode="numeric"
              className="rounded-md border border-zinc-300 px-3 py-2 text-sm"
            />
            <input
              value={newExternalCode}
              onChange={(e) => setNewExternalCode(e.target.value)}
              placeholder="Код 1С"
              className="rounded-md border border-zinc-300 px-3 py-2 text-sm font-mono"
            />
          </div>
          <button
            type="submit"
            disabled={creating}
            className="btn-primary mt-3"
          >
            {creating ? "Создание…" : "Добавить"}
          </button>
        </form>

        <div className="mt-4 flex justify-end">
          <button
            type="button"
            onClick={onClose}
            className="rounded-md border border-zinc-300 px-3 py-2 text-sm font-medium text-zinc-700 hover:bg-zinc-50"
          >
            Закрыть
          </button>
        </div>
      </div>
    </div>
  );
}

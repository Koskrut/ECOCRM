"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  productsApi,
  type ProductCatalogItem,
  type StockUploadResult,
} from "../../lib/api";

/** Первые два символа артикула (или весь артикул, если короче). */
function categoryFromSku(sku: string): string {
  const s = sku.trim();
  return s.length >= 2 ? s.slice(0, 2) : s || "—";
}

function CatalogRowDeleteButton({
  productId,
  productName,
  onDeleted,
}: {
  productId: string;
  productName: string;
  onDeleted: () => void;
}) {
  const [deleting, setDeleting] = useState(false);
  const handleDelete = async () => {
    if (!confirm(`Удалить товар «${productName}» из каталога?`)) return;
    setDeleting(true);
    try {
      await productsApi.deleteProduct(productId);
      onDeleted();
    } catch {
      // ignore for now; could show toast
    } finally {
      setDeleting(false);
    }
  };
  return (
    <button
      type="button"
      onClick={handleDelete}
      disabled={deleting}
      className="rounded p-1.5 text-zinc-400 hover:bg-red-50 hover:text-red-600 disabled:opacity-50"
      title="Удалить"
      aria-label={`Удалить ${productName}`}
    >
      <svg
        xmlns="http://www.w3.org/2000/svg"
        width="18"
        height="18"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
        aria-hidden
      >
        <path d="M3 6h18M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
        <line x1="10" y1="11" x2="10" y2="17" />
        <line x1="14" y1="11" x2="14" y2="17" />
      </svg>
    </button>
  );
}

function StockUploadModal({
  open,
  onClose,
  onSuccess,
}: {
  open: boolean;
  onClose: () => void;
  onSuccess: () => void;
}) {
  const [file, setFile] = useState<File | null>(null);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<StockUploadResult | null>(null);

  const reset = useCallback(() => {
    setFile(null);
    setError(null);
    setResult(null);
  }, []);

  useEffect(() => {
    if (!open) reset();
  }, [open, reset]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!file) {
      setError("Выберите файл");
      return;
    }
    setError(null);
    setResult(null);
    setUploading(true);
    try {
      const data = await productsApi.uploadStock(file);
      setResult(data);
      if (data.updated > 0 || data.created > 0) {
        onSuccess();
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Ошибка загрузки");
    } finally {
      setUploading(false);
    }
  };

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30 px-4 backdrop-blur-sm">
      <div className="w-full max-w-md rounded-2xl bg-white p-6 shadow-xl">
        <h2 className="mb-4 text-lg font-semibold text-zinc-900">
          Загрузить остатки из Excel
        </h2>
        <p className="mb-4 text-sm text-zinc-600">
          Первая строка — заголовки. Обязательно: <b>Артикул</b> (или sku),{" "}
          <b>Остаток</b> (или qty, quantity, stock). По желанию: <b>Название</b> (name, наименование), <b>Цена</b> (price, базовая цена).
        </p>
        <form onSubmit={handleSubmit}>
          <input
            type="file"
            accept=".xlsx,.xls"
            className="mb-4 block w-full text-sm text-zinc-600 file:mr-3 file:rounded file:border-0 file:bg-zinc-100 file:px-3 file:py-1.5 file:text-sm file:font-medium file:text-zinc-800"
            onChange={(e) => setFile(e.target.files?.[0] ?? null)}
          />
          {error && (
            <p className="mb-3 text-sm text-red-600" role="alert">
              {error}
            </p>
          )}
          {result && (
            <div className="mb-3 rounded border border-zinc-200 bg-zinc-50 p-3 text-sm">
              <p className="font-medium text-zinc-900">
                Обновлено: {result.updated}
                {result.created > 0 && `, добавлено: ${result.created}`}
              </p>
              {result.notFound.length > 0 && (
                <p className="mt-1 text-zinc-600">
                  Не найдены артикулы: {result.notFound.slice(0, 10).join(", ")}
                  {result.notFound.length > 10
                    ? ` и ещё ${result.notFound.length - 10}`
                    : ""}
                </p>
              )}
            </div>
          )}
          <div className="flex gap-2">
            <button
              type="submit"
              disabled={uploading || !file}
              className="btn-primary"
            >
              {uploading ? "Загрузка…" : "Загрузить"}
            </button>
            <button
              type="button"
              onClick={() => {
                onClose();
                reset();
              }}
              className="rounded-md border border-zinc-300 px-3 py-2 text-sm font-medium text-zinc-700 hover:bg-zinc-50"
            >
              Закрыть
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

function CatalogPageContent() {
  const [items, setItems] = useState<ProductCatalogItem[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [searchDebounced, setSearchDebounced] = useState("");
  const [uploadModalOpen, setUploadModalOpen] = useState(false);
  const [editingStock, setEditingStock] = useState<{
    productId: string;
    value: string;
  } | null>(null);
  const [collapsedCategories, setCollapsedCategories] = useState<Set<string>>(new Set());

  const categoriesWithItems = useMemo(() => {
    const map = new Map<string, ProductCatalogItem[]>();
    for (const p of items) {
      const cat = categoryFromSku(p.sku);
      const list = map.get(cat) ?? [];
      list.push(p);
      map.set(cat, list);
    }
    return Array.from(map.entries())
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([category, categoryItems]) => ({ category, items: categoryItems }));
  }, [items]);

  const toggleCategory = useCallback((category: string) => {
    setCollapsedCategories((prev) => {
      const next = new Set(prev);
      if (next.has(category)) next.delete(category);
      else next.add(category);
      return next;
    });
  }, []);

  const loadCatalog = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);
      const data = await productsApi.listCatalog({
        search: searchDebounced || undefined,
        page: 1,
        pageSize: 500,
      });
      setItems(data.items);
      setTotal(data.total);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unknown error");
    } finally {
      setLoading(false);
    }
  }, [searchDebounced]);

  useEffect(() => {
    loadCatalog();
  }, [loadCatalog]);

  useEffect(() => {
    const t = setTimeout(() => setSearchDebounced(search), 300);
    return () => clearTimeout(t);
  }, [search]);

  return (
    <div className="p-6">
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-2xl font-bold text-zinc-900">Каталог</h1>
        <div className="flex items-center gap-2">
          <input
            type="search"
            placeholder="Поиск по артикулу или названию…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="rounded-md border border-zinc-300 px-3 py-2 text-sm focus:border-zinc-500 focus:outline-none focus:ring-1 focus:ring-zinc-500"
          />
          <button
            type="button"
            onClick={() => setUploadModalOpen(true)}
            className="btn-primary"
          >
            Загрузить остатки
          </button>
        </div>
      </div>

      {loading && <div className="text-sm text-zinc-600">Загрузка…</div>}
      {error && (
        <div className="text-sm text-red-600" role="alert">
          {error}
        </div>
      )}

      {!loading && !error && (
        <div className="overflow-hidden rounded-xl border border-zinc-200 bg-white shadow-sm">
          {categoriesWithItems.length === 0 ? (
            <div className="px-4 py-6 text-center text-sm text-zinc-500">
              Нет товаров
            </div>
          ) : (
            <table className="w-full text-sm">
              <thead className="bg-zinc-100/80 text-left text-xs font-medium uppercase text-zinc-500">
                <tr>
                  <th className="px-4 py-3">Артикул</th>
                  <th className="px-4 py-3">Название</th>
                  <th className="px-4 py-3">Ед.</th>
                  <th className="px-4 py-3">Цена</th>
                  <th className="px-4 py-3">Остаток</th>
                  <th className="w-10 px-2 py-3" aria-label="Удалить" />
                </tr>
              </thead>
              {categoriesWithItems.map(({ category, items: categoryItems }) => {
                const isCollapsed = collapsedCategories.has(category);
                return (
                  <tbody key={category} className="border-t border-zinc-200">
                    <tr>
                      <td colSpan={6} className="p-0">
                        <button
                          type="button"
                          onClick={() => toggleCategory(category)}
                          className="flex w-full items-center gap-2 px-4 py-2.5 text-left font-medium text-zinc-800 hover:bg-zinc-100"
                        >
                          <svg
                            className={`h-4 w-4 shrink-0 transition-transform ${isCollapsed ? "" : "rotate-90"}`}
                            fill="none"
                            stroke="currentColor"
                            viewBox="0 0 24 24"
                          >
                            <path
                              strokeLinecap="round"
                              strokeLinejoin="round"
                              strokeWidth={2}
                              d="M9 5l7 7-7 7"
                            />
                          </svg>
                          <span>Категория {category}</span>
                          <span className="text-xs font-normal text-zinc-500">
                            ({categoryItems.length})
                          </span>
                        </button>
                      </td>
                    </tr>
                    {!isCollapsed &&
                      categoryItems.map((p) => (
                        <tr key={p.id} className="border-t border-zinc-100 hover:bg-zinc-50">
                          <td className="px-4 py-3 font-mono text-zinc-900">{p.sku}</td>
                          <td className="px-4 py-3 text-zinc-900">{p.name}</td>
                          <td className="px-4 py-3 text-zinc-600">{p.unit}</td>
                          <td className="px-4 py-3 text-zinc-600">{p.basePrice}</td>
                          <td className="px-4 py-3">
                            {editingStock?.productId === p.id ? (
                              <input
                                type="number"
                                min={0}
                                value={editingStock.value}
                                onChange={(e) =>
                                  setEditingStock((prev) =>
                                    prev ? { ...prev, value: e.target.value } : null,
                                  )
                                }
                                onBlur={async () => {
                                  const val = Math.max(0, Math.floor(Number(editingStock?.value) || 0));
                                  setEditingStock(null);
                                  try {
                                    await productsApi.updateStock(p.id, val);
                                    setItems((prev) =>
                                      prev.map((it) =>
                                        it.id === p.id ? { ...it, stock: val } : it,
                                      ),
                                    );
                                  } catch {
                                    loadCatalog();
                                  }
                                }}
                                onKeyDown={(e) => {
                                  if (e.key === "Enter") {
                                    e.preventDefault();
                                    const val = Math.max(0, Math.floor(Number(editingStock?.value) || 0));
                                    setEditingStock(null);
                                    void productsApi.updateStock(p.id, val).then(() => {
                                      setItems((prev) =>
                                        prev.map((it) =>
                                          it.id === p.id ? { ...it, stock: val } : it,
                                        ),
                                      );
                                    }).catch(() => loadCatalog());
                                  }
                                  if (e.key === "Escape") setEditingStock(null);
                                }}
                                autoFocus
                                className="w-16 rounded border border-zinc-300 px-2 py-1 text-right text-sm"
                              />
                            ) : (
                              <button
                                type="button"
                                onClick={() =>
                                  setEditingStock({ productId: p.id, value: String(p.stock) })
                                }
                                className="font-medium text-zinc-900 hover:underline"
                              >
                                {p.stock}
                              </button>
                            )}
                          </td>
                          <td className="px-2 py-3">
                            <CatalogRowDeleteButton
                              productId={p.id}
                              productName={p.name}
                              onDeleted={loadCatalog}
                            />
                          </td>
                        </tr>
                      ))}
                  </tbody>
                );
              })}
            </table>
          )}
        </div>
      )}

      <StockUploadModal
        open={uploadModalOpen}
        onClose={() => setUploadModalOpen(false)}
        onSuccess={loadCatalog}
      />
    </div>
  );
}

export default function CatalogPage() {
  return <CatalogPageContent />;
}

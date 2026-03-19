"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  productsApi,
  type ProductCatalogItem,
  type ProductImageItem,
  type ProductImagesSyncResult,
  type ProductImagesSyncStatus,
  type StockUploadResult,
} from "../../lib/api";
import { PRODUCT_GROUP_NAMES } from "../../lib/product-groups";

/** Порядок складов для колонок каталога. */
const WAREHOUSE_ORDER = ["Днепр", "Одесса", "Львов"];

function qtyAtWarehouse(
  p: ProductCatalogItem,
  warehouseName: string,
): number {
  const w = p.stockByWarehouse?.find(
    (x) => x.warehouseName.toLowerCase() === warehouseName.toLowerCase(),
  );
  return w?.qty ?? 0;
}

/** Первые два символа артикула (группа товара). */
function categoryFromSku(sku: string): string {
  const s = sku.trim();
  return s.length >= 2 ? s.slice(0, 2) : s || "—";
}

function categoryLabel(categoryId: string): string {
  return PRODUCT_GROUP_NAMES[categoryId] ?? `Группа ${categoryId}`;
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

function ActivateProductButton({
  productId,
  productName,
  onActivated,
}: {
  productId: string;
  productName: string;
  onActivated: () => void;
}) {
  const [activating, setActivating] = useState(false);
  const handleActivate = async () => {
    setActivating(true);
    try {
      await productsApi.updateIsActive(productId, true);
      onActivated();
    } catch {
      // ignore; could show toast
    } finally {
      setActivating(false);
    }
  };
  return (
    <button
      type="button"
      onClick={handleActivate}
      disabled={activating}
      className="ml-2 rounded border border-emerald-200 bg-emerald-50 px-2 py-0.5 text-xs font-medium text-emerald-800 hover:bg-emerald-100 disabled:opacity-50"
      title="Сделать активным"
    >
      {activating ? "…" : "Активировать"}
    </button>
  );
}

function ProductImagesModal({
  productId,
  productName,
  open,
  onClose,
}: {
  productId: string;
  productName: string;
  open: boolean;
  onClose: () => void;
}) {
  const [images, setImages] = useState<ProductImageItem[]>([]);
  const [loading, setLoading] = useState(false);
  useEffect(() => {
    if (!open || !productId) return;
    setLoading(true);
    productsApi
      .listProductImages(productId)
      .then((r) => setImages(r.items))
      .catch(() => setImages([]))
      .finally(() => setLoading(false));
  }, [open, productId]);
  if (!open) return null;
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30 px-4 backdrop-blur-sm">
      <div className="max-h-[80vh] w-full max-w-lg overflow-hidden rounded-2xl bg-white shadow-xl">
        <div className="flex items-center justify-between border-b border-zinc-200 px-4 py-3">
          <h2 className="text-lg font-semibold text-zinc-900">
            Фото: {productName}
          </h2>
          <button
            type="button"
            onClick={onClose}
            className="rounded p-1.5 text-zinc-500 hover:bg-zinc-100 hover:text-zinc-800"
            aria-label="Закрыть"
          >
            <svg className="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>
        <div className="max-h-[60vh] overflow-y-auto p-4">
          {loading ? (
            <p className="text-sm text-zinc-500">Загрузка…</p>
          ) : images.length === 0 ? (
            <p className="text-sm text-zinc-500">Нет фото. Запустите синхронизацию с Google Drive.</p>
          ) : (
            <ul className="grid grid-cols-2 gap-3 sm:grid-cols-3">
              {images.map((img) => (
                <li key={img.id} className="flex flex-col gap-1">
                  <img
                    src={`/api/products/images/${img.id}/source`}
                    alt={img.fileName}
                    className="aspect-square rounded-lg border border-zinc-200 object-contain bg-zinc-50"
                  />
                  <p className="truncate text-xs text-zinc-500" title={img.fileName}>
                    {img.fileName}
                    {img.isPrimary && " (главное)"}
                  </p>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
    </div>
  );
}

const POLL_INTERVAL_MS = 1500;

function SyncImagesModal({
  open,
  onClose,
  onSuccess,
}: {
  open: boolean;
  onClose: () => void;
  onSuccess: () => void;
}) {
  const [status, setStatus] = useState<ProductImagesSyncStatus | null>(null);
  const [starting, setStarting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const reset = useCallback(() => {
    setStatus(null);
    setError(null);
  }, []);

  useEffect(() => {
    if (!open) reset();
  }, [open, reset]);

  const pollStatus = useCallback(async () => {
    try {
      const s = await productsApi.getProductImagesSyncStatus();
      setStatus(s);
      return s.running;
    } catch {
      return false;
    }
  }, []);

  useEffect(() => {
    if (!open || !status?.running) return;
    const t = setInterval(pollStatus, POLL_INTERVAL_MS);
    return () => clearInterval(t);
  }, [open, status?.running, pollStatus]);

  const handleSync = async () => {
    setStarting(true);
    setError(null);
    setStatus(null);
    try {
      await productsApi.syncProductImagesStart();
      const s = await productsApi.getProductImagesSyncStatus();
      setStatus(s);
      if (!s.running && s.result && s.result.errors.length === 0) {
        onSuccess();
      }
    } catch (err: unknown) {
      const res = err && typeof err === "object" && "response" in err
        ? (err as { response?: { status?: number; data?: ProductImagesSyncStatus } }).response
        : null;
      if (res?.status === 409 && res.data && typeof res.data === "object") {
        setStatus(res.data);
      } else {
        setError(err instanceof Error ? err.message : "Ошибка запуска синхронизации");
      }
    } finally {
      setStarting(false);
    }
  };

  const result = status?.result ?? null;
  const running = status?.running ?? false;
  const done = !running && (result !== null || (status?.error ?? null) !== null);

  useEffect(() => {
    if (done && result && result.errors.length === 0) onSuccess();
  }, [done, result, onSuccess]);

  if (!open) return null;
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30 px-4 backdrop-blur-sm">
      <div className="w-full max-w-md rounded-2xl bg-white p-6 shadow-xl">
        <h2 className="mb-4 text-lg font-semibold text-zinc-900">
          Синхронизация фото из Google Drive
        </h2>
        <p className="mb-4 text-sm text-zinc-600">
          Файлы из папки сопоставляются с товарами по артикулу в имени файла.
          Настройте GOOGLE_DRIVE_FOLDER_ID и учётные данные на бэкенде.
        </p>
        {error && (
          <p className="mb-3 text-sm text-red-600" role="alert">
            {error}
          </p>
        )}
        {status?.error && (
          <p className="mb-3 text-sm text-red-600" role="alert">
            {status.error}
          </p>
        )}
        {running && status && (
          <div className="mb-4">
            <p className="mb-2 text-sm font-medium text-zinc-700">
              Обработано файлов: {status.filesProcessed}
              {status.totalFiles != null ? ` из ${status.totalFiles}` : ""}
            </p>
            <div className="h-2 w-full overflow-hidden rounded-full bg-zinc-200">
              <div
                className="h-full bg-[var(--primary)] transition-all duration-300"
                style={{
                  width:
                    status.totalFiles != null && status.totalFiles > 0
                      ? `${(100 * status.filesProcessed) / status.totalFiles}%`
                      : "30%",
                }}
              />
            </div>
          </div>
        )}
        {result && !running && (
          <div className="mb-4 rounded-lg border border-zinc-200 bg-zinc-50 p-3 text-sm">
            <p className="font-medium text-zinc-900">
              Обработано файлов: {result.filesProcessed}
            </p>
            <p className="mt-1 text-zinc-700">
              Сопоставлено с товарами: {result.productsMatched}
            </p>
            <p className="mt-1 text-zinc-700">
              Не сопоставлено файлов: {result.filesUnmatched}
            </p>
            <p className="mt-1 text-zinc-700">
              Товаров с несколькими фото: {result.productsWithMultipleImages}
            </p>
            {result.errors.length > 0 && (
              <p className="mt-2 text-red-600">
                Ошибки: {result.errors.join("; ")}
              </p>
            )}
            {result.unmatchedFileNames.length > 0 && (
              <p className="mt-2 text-zinc-600">
                Примеры без совпадения:{" "}
                {result.unmatchedFileNames.slice(0, 5).join(", ")}
                {result.unmatchedFileNames.length > 5 &&
                  ` и ещё ${result.unmatchedFileNames.length - 5}`}
              </p>
            )}
          </div>
        )}
        <div className="flex gap-2">
          <button
            type="button"
            onClick={handleSync}
            disabled={starting || running}
            className="btn-primary"
          >
            {starting
              ? "Запуск…"
              : running
                ? "Синхронизация…"
                : "Запустить синхронизацию"}
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
      </div>
    </div>
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

function StockUploadByWarehousesModal({
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
      const data = await productsApi.uploadStockByWarehouses(file);
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
          Остатки по складам (Excel)
        </h2>
        <p className="mb-4 text-sm text-zinc-600">
          Первая строка — заголовки. Обязательно: <b>Артикул</b> (или sku) и колонки по складам: <b>Днепр</b>, <b>Одесса</b>, <b>Львов</b> (или «Остаток Днепр» и т.д.).
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
                Обновлено записей: {result.updated}
                {result.created > 0 && `, создано: ${result.created}`}
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

function AddProductModal({
  open,
  onClose,
  onSuccess,
}: {
  open: boolean;
  onClose: () => void;
  onSuccess: () => void;
}) {
  const [sku, setSku] = useState("");
  const [name, setName] = useState("");
  const [unit, setUnit] = useState("pcs");
  const [basePrice, setBasePrice] = useState("");
  const [showOnStore, setShowOnStore] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const reset = useCallback(() => {
    setSku("");
    setName("");
    setUnit("pcs");
    setBasePrice("");
    setShowOnStore(true);
    setError(null);
  }, []);

  useEffect(() => {
    if (!open) reset();
  }, [open, reset]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const skuTrim = sku.trim();
    if (!skuTrim) {
      setError("Укажите артикул");
      return;
    }
    const priceNum = basePrice.trim() === "" ? 0 : Number(basePrice);
    if (Number.isNaN(priceNum) || priceNum < 0) {
      setError("Цена должна быть неотрицательным числом");
      return;
    }
    setError(null);
    setSubmitting(true);
    try {
      await productsApi.createProduct({
        sku: skuTrim,
        name: name.trim() || undefined,
        unit: unit.trim() || "pcs",
        basePrice: priceNum,
        showOnStore,
      });
      onSuccess();
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Ошибка создания");
    } finally {
      setSubmitting(false);
    }
  };

  if (!open) return null;
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30 px-4 backdrop-blur-sm">
      <div className="w-full max-w-md rounded-2xl bg-white p-6 shadow-xl">
        <h2 className="mb-4 text-lg font-semibold text-zinc-900">
          Добавить позицию
        </h2>
        <form onSubmit={handleSubmit} className="flex flex-col gap-3">
          <div>
            <label htmlFor="add-product-sku" className="mb-1 block text-sm font-medium text-zinc-700">
              Артикул <span className="text-red-500">*</span>
            </label>
            <input
              id="add-product-sku"
              type="text"
              value={sku}
              onChange={(e) => setSku(e.target.value)}
              placeholder="например 00.105"
              className="w-full rounded-md border border-zinc-300 px-3 py-2 text-sm focus:border-zinc-500 focus:outline-none focus:ring-1 focus:ring-zinc-500"
              autoFocus
            />
          </div>
          <div>
            <label htmlFor="add-product-name" className="mb-1 block text-sm font-medium text-zinc-700">
              Название
            </label>
            <input
              id="add-product-name"
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="если пусто — будет артикул"
              className="w-full rounded-md border border-zinc-300 px-3 py-2 text-sm focus:border-zinc-500 focus:outline-none focus:ring-1 focus:ring-zinc-500"
            />
          </div>
          <div>
            <label htmlFor="add-product-unit" className="mb-1 block text-sm font-medium text-zinc-700">
              Ед.
            </label>
            <input
              id="add-product-unit"
              type="text"
              value={unit}
              onChange={(e) => setUnit(e.target.value)}
              placeholder="pcs"
              className="w-full rounded-md border border-zinc-300 px-3 py-2 text-sm focus:border-zinc-500 focus:outline-none focus:ring-1 focus:ring-zinc-500"
            />
          </div>
          <div>
            <label htmlFor="add-product-price" className="mb-1 block text-sm font-medium text-zinc-700">
              Цена
            </label>
            <input
              id="add-product-price"
              type="text"
              inputMode="decimal"
              value={basePrice}
              onChange={(e) => setBasePrice(e.target.value)}
              placeholder="0"
              className="w-full rounded-md border border-zinc-300 px-3 py-2 text-sm focus:border-zinc-500 focus:outline-none focus:ring-1 focus:ring-zinc-500"
            />
          </div>
          <label className="flex cursor-pointer items-center gap-2">
            <input
              type="checkbox"
              checked={showOnStore}
              onChange={(e) => setShowOnStore(e.target.checked)}
              className="h-4 w-4 rounded border-zinc-300 text-zinc-900 focus:ring-zinc-500"
            />
            <span className="text-sm text-zinc-700">Показывать на сайте</span>
          </label>
          {error && (
            <p className="text-sm text-red-600" role="alert">
              {error}
            </p>
          )}
          <div className="flex gap-2 pt-1">
            <button
              type="submit"
              disabled={submitting}
              className="btn-primary"
            >
              {submitting ? "Создание…" : "Создать"}
            </button>
            <button
              type="button"
              onClick={onClose}
              className="rounded-md border border-zinc-300 px-3 py-2 text-sm font-medium text-zinc-700 hover:bg-zinc-50"
            >
              Отмена
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
  const [addProductModalOpen, setAddProductModalOpen] = useState(false);
  const [uploadModalOpen, setUploadModalOpen] = useState(false);
  const [uploadByWarehousesModalOpen, setUploadByWarehousesModalOpen] = useState(false);
  const [syncImagesModalOpen, setSyncImagesModalOpen] = useState(false);
  const [imagesModalProduct, setImagesModalProduct] = useState<{
    id: string;
    name: string;
  } | null>(null);
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
            onClick={() => setAddProductModalOpen(true)}
            className="rounded-md border border-zinc-300 px-3 py-2 text-sm font-medium text-zinc-700 hover:bg-zinc-50"
          >
            Добавить позицию
          </button>
          <button
            type="button"
            onClick={() => setSyncImagesModalOpen(true)}
            className="rounded-md border border-zinc-300 px-3 py-2 text-sm font-medium text-zinc-700 hover:bg-zinc-50"
          >
            Синхронизация фото
          </button>
          <button
            type="button"
            onClick={() => setUploadModalOpen(true)}
            className="rounded-md border border-zinc-300 px-3 py-2 text-sm font-medium text-zinc-700 hover:bg-zinc-50"
          >
            Остатки (общий)
          </button>
          <button
            type="button"
            onClick={() => setUploadByWarehousesModalOpen(true)}
            className="btn-primary"
          >
            Остатки по складам
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
            <div className="overflow-x-auto">
            <table className="w-full min-w-[800px] text-sm">
              <thead className="bg-zinc-100/80 text-left text-xs font-medium uppercase text-zinc-500">
                <tr>
                  <th className="w-16 px-2 py-3">Фото</th>
                  <th className="px-4 py-3">Артикул</th>
                  <th className="px-4 py-3">Название</th>
                  <th className="px-4 py-3">Ед.</th>
                  <th className="px-4 py-3">Цена</th>
                  {WAREHOUSE_ORDER.map((wh) => (
                    <th key={wh} className="px-4 py-3">
                      {wh}
                    </th>
                  ))}
                  <th className="w-24 px-2 py-3 text-center" title="Отображать на сайте">
                    На сайте
                  </th>
                  <th className="w-10 px-2 py-3" aria-label="Удалить" />
                </tr>
              </thead>
              {categoriesWithItems.map(({ category, items: categoryItems }) => {
                const isCollapsed = collapsedCategories.has(category);
                return (
                  <tbody key={category} className="border-t border-zinc-200">
                    <tr>
                      <td colSpan={7 + WAREHOUSE_ORDER.length} className="p-0">
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
                          <span>{categoryLabel(category)}</span>
                          <span className="text-xs font-normal text-zinc-500">
                            ({categoryItems.length})
                          </span>
                        </button>
                      </td>
                    </tr>
                    {!isCollapsed &&
                      categoryItems.map((p) => (
                        <tr
                          key={p.id}
                          className={`border-t border-zinc-100 hover:bg-zinc-50 ${p.isActive === false ? "bg-zinc-100/60" : ""}`}
                        >
                          <td className="px-2 py-2">
                            <button
                              type="button"
                              onClick={() =>
                                setImagesModalProduct({ id: p.id, name: p.name })
                              }
                              className="flex h-12 w-12 items-center justify-center overflow-hidden rounded border border-zinc-200 bg-zinc-50 hover:bg-zinc-100"
                              title="Фото товара"
                            >
                              {p.primaryImageId ? (
                                <img
                                  src={`/api/products/images/${p.primaryImageId}/source`}
                                  alt=""
                                  className="h-full w-full object-contain"
                                />
                              ) : (
                                <span className="text-lg text-zinc-400">—</span>
                              )}
                            </button>
                          </td>
                          <td className="px-4 py-3 font-mono text-zinc-900">
                            {p.sku}
                            {p.isActive === false && (
                              <>
                                <span className="ml-2 rounded bg-amber-100 px-1.5 py-0.5 text-xs text-amber-800">
                                  неактивен
                                </span>
                                <ActivateProductButton
                                  productId={p.id}
                                  productName={p.name}
                                  onActivated={loadCatalog}
                                />
                              </>
                            )}
                          </td>
                          <td className="px-4 py-3 text-zinc-900">{p.name}</td>
                          <td className="px-4 py-3 text-zinc-600">{p.unit}</td>
                          <td className="px-4 py-3 text-zinc-600">{p.basePrice}</td>
                          {WAREHOUSE_ORDER.map((wh) => (
                            <td key={wh} className="px-4 py-3 text-right tabular-nums text-zinc-700">
                              {qtyAtWarehouse(p, wh)}
                            </td>
                          ))}
                          <td className="px-2 py-3 text-center">
                            <label className="inline-flex cursor-pointer items-center gap-1.5">
                              <input
                                type="checkbox"
                                checked={p.showOnStore ?? true}
                                onChange={async (e) => {
                                  const next = e.target.checked;
                                  try {
                                    await productsApi.updateShowOnStore(p.id, next);
                                    setItems((prev) =>
                                      prev.map((it) =>
                                        it.id === p.id ? { ...it, showOnStore: next } : it,
                                      ),
                                    );
                                  } catch {
                                    loadCatalog();
                                  }
                                }}
                                className="h-4 w-4 rounded border-zinc-300 text-zinc-900 focus:ring-zinc-500"
                                title={p.showOnStore ?? true ? "Скрыть с сайта" : "Показать на сайте"}
                              />
                              <span className="sr-only">Отображать на сайте</span>
                            </label>
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
            </div>
          )}
        </div>
      )}

      <AddProductModal
        open={addProductModalOpen}
        onClose={() => setAddProductModalOpen(false)}
        onSuccess={loadCatalog}
      />
      <StockUploadModal
        open={uploadModalOpen}
        onClose={() => setUploadModalOpen(false)}
        onSuccess={loadCatalog}
      />
      <StockUploadByWarehousesModal
        open={uploadByWarehousesModalOpen}
        onClose={() => setUploadByWarehousesModalOpen(false)}
        onSuccess={loadCatalog}
      />
      <SyncImagesModal
        open={syncImagesModalOpen}
        onClose={() => setSyncImagesModalOpen(false)}
        onSuccess={loadCatalog}
      />
      <ProductImagesModal
        productId={imagesModalProduct?.id ?? ""}
        productName={imagesModalProduct?.name ?? ""}
        open={Boolean(imagesModalProduct)}
        onClose={() => setImagesModalProduct(null)}
      />
    </div>
  );
}

export default function CatalogPage() {
  return <CatalogPageContent />;
}

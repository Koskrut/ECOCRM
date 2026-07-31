"use client";

import { Fragment, useCallback, useEffect, useMemo, useRef, useState, useDeferredValue } from "react";
import {
  listWarehouses,
  productsApi,
  type ProductCatalogItem,
  type ProductImageItem,
  type ProductImagesSyncResult,
  type ProductImagesSyncStatus,
  type StockUploadResult,
  type MissingStockProduct,
  type WarehouseItem,
} from "../../lib/api";
import { PRODUCT_GROUP_NAMES } from "../../lib/product-groups";
import { CatalogProductCard } from "./CatalogProductCard";
import { ProductCharacteristicsPanel } from "./ProductCharacteristicsPanel";
import { filterCatalogItems } from "./catalog-search";
import { WarehousesModal } from "./WarehousesModal";
import { apiHttp } from "@/lib/api/client";
import { HelpHint } from "@/components/help/HelpHint";

function CatalogExpandedCharacteristics({
  product,
  tableColspan,
}: {
  product: ProductCatalogItem;
  tableColspan: number;
}) {
  return (
    <tr className="border-t border-zinc-200 bg-zinc-50/95">
      <td colSpan={tableColspan} className="p-0">
        <div className="animate-in fade-in slide-in-from-top-1 duration-200 motion-reduce:animate-none border-t border-zinc-200/80 px-4 py-3">
          <ProductCharacteristicsPanel product={product} />
        </div>
      </td>
    </tr>
  );
}

/** Preferred warehouse column order in catalog (matches Google Sheets export). */
const WAREHOUSE_ORDER = ["Днепр", "Львов", "Киев", "Луцьк", "Одесса", "Хмельницький"] as const;

function warehouseDisplayOrder(name: string): number {
  const idx = WAREHOUSE_ORDER.findIndex((w) => w.toLowerCase() === name.toLowerCase());
  return idx >= 0 ? idx : WAREHOUSE_ORDER.length;
}

/** Physical on-hand qty (catalog columns). Orders/store keep using availableQty. */
function stockAtWarehouse(
  p: ProductCatalogItem,
  warehouseName: string,
): { qty: number; available: number; reserved: number } {
  const w = p.stockByWarehouse?.find(
    (x) => x.warehouseName.toLowerCase() === warehouseName.toLowerCase(),
  );
  const qty = w?.qty ?? 0;
  const available = w?.availableQty ?? qty;
  const reserved = Math.max(0, qty - available);
  return { qty, available, reserved };
}

function qtyAtWarehouse(
  p: ProductCatalogItem,
  warehouseName: string,
): number {
  return stockAtWarehouse(p, warehouseName).qty;
}

function stockTitleAtWarehouse(
  p: ProductCatalogItem,
  warehouseName: string,
): string | undefined {
  const { qty, available, reserved } = stockAtWarehouse(p, warehouseName);
  if (reserved <= 0) return undefined;
  return `физический: ${qty} / резерв: ${reserved} / доступно: ${available}`;
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
      className="inline-flex min-h-[44px] min-w-[44px] items-center justify-center rounded-lg p-1.5 text-zinc-400 hover:bg-red-50 hover:text-red-600 disabled:opacity-50"
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

function CatalogRowEditButton({
  productName,
  onEdit,
}: {
  productName: string;
  onEdit: () => void;
}) {
  return (
    <button
      type="button"
      onClick={(e) => {
        e.stopPropagation();
        onEdit();
      }}
      className="inline-flex min-h-[44px] min-w-[44px] items-center justify-center rounded-lg p-1.5 text-zinc-400 hover:bg-zinc-100 hover:text-zinc-700"
      title="Редактировать"
      aria-label={`Редактировать ${productName}`}
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
        <path d="M12 20h9" />
        <path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L8 18l-4 1 1-4Z" />
      </svg>
    </button>
  );
}

function EditProductModal({
  open,
  product,
  warehouses,
  onClose,
  onSaved,
}: {
  open: boolean;
  product: ProductCatalogItem | null;
  warehouses: WarehouseItem[];
  onClose: () => void;
  onSaved: () => void;
}) {
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [sku, setSku] = useState("");
  const [name, setName] = useState("");
  const [unit, setUnit] = useState("");
  const [basePrice, setBasePrice] = useState<string>("");
  const [warehouseStocks, setWarehouseStocks] = useState<Record<string, string>>({});
  const [showOnStore, setShowOnStore] = useState(true);
  const [isActive, setIsActive] = useState(true);

  useEffect(() => {
    if (!open || !product) return;
    setError(null);
    setSku(product.sku ?? "");
    setName(product.name ?? "");
    setUnit(product.unit ?? "");
    setBasePrice(String(product.basePrice ?? 0));
    setWarehouseStocks(() => {
      const byWarehouse = new Map(
        (product.stockByWarehouse ?? []).map((row) => [row.warehouseId, String(row.qty ?? 0)]),
      );
      return Object.fromEntries(
        warehouses.map((wh) => [wh.id, byWarehouse.get(wh.id) ?? "0"]),
      );
    });
    setShowOnStore(Boolean(product.showOnStore ?? true));
    setIsActive(product.isActive === false ? false : true);
  }, [open, product, warehouses]);

  const totalStockFromWarehouses = warehouses.reduce(
    (sum, wh) => sum + Math.max(0, Math.floor(Number(warehouseStocks[wh.id] ?? 0))),
    0,
  );

  const handleSave = async () => {
    if (!product) return;
    setSaving(true);
    setError(null);
    try {
      await productsApi.updateProduct(product.id, {
        sku,
        name,
        unit,
        basePrice: Number(basePrice),
        stock: totalStockFromWarehouses,
        warehouseStocks: warehouses.map((wh) => ({
          warehouseId: wh.id,
          qty: Math.max(0, Math.floor(Number(warehouseStocks[wh.id] ?? 0))),
        })),
        showOnStore,
        isActive,
      });
      onSaved();
      onClose();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Не вдалося зберегти");
    } finally {
      setSaving(false);
    }
  };

  if (!open) return null;
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30 px-4 backdrop-blur-sm">
      <div className="w-full max-w-lg rounded-2xl bg-white p-6 shadow-xl">
        <div className="mb-4 flex items-start justify-between gap-3">
          <div>
            <h2 className="text-lg font-semibold text-zinc-900">Редактирование товара</h2>
            <p className="mt-1 text-sm text-zinc-600">{product?.sku}</p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded p-1.5 text-zinc-500 hover:bg-zinc-100 hover:text-zinc-800"
            aria-label="Закрити"
          >
            <svg className="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        {error && <p className="mb-3 text-sm text-red-600">{error}</p>}

        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <label className="flex flex-col gap-1">
            <span className="text-xs font-medium text-zinc-600">Артикул</span>
            <input
              value={sku}
              onChange={(e) => setSku(e.target.value)}
              className="w-full rounded-md border border-zinc-300 px-3 py-2 text-sm"
            />
          </label>
          <label className="flex flex-col gap-1">
            <span className="text-xs font-medium text-zinc-600">Ед.</span>
            <input
              value={unit}
              onChange={(e) => setUnit(e.target.value)}
              className="w-full rounded-md border border-zinc-300 px-3 py-2 text-sm"
            />
          </label>
          <label className="flex flex-col gap-1 sm:col-span-2">
            <span className="text-xs font-medium text-zinc-600">Название</span>
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="w-full rounded-md border border-zinc-300 px-3 py-2 text-sm"
            />
          </label>
          <label className="flex flex-col gap-1">
            <span className="text-xs font-medium text-zinc-600">Цена</span>
            <input
              value={basePrice}
              onChange={(e) => setBasePrice(e.target.value)}
              inputMode="decimal"
              className="w-full rounded-md border border-zinc-300 px-3 py-2 text-sm"
            />
          </label>
          <label className="flex flex-col gap-1">
            <span className="text-xs font-medium text-zinc-600">Количество (общий остаток, авто)</span>
            <input
              value={String(totalStockFromWarehouses)}
              readOnly
              inputMode="numeric"
              className="w-full rounded-md border border-zinc-200 bg-zinc-100 px-3 py-2 text-sm text-zinc-600"
            />
          </label>
          {warehouses.length > 0 && (
            <div className="sm:col-span-2">
              <p className="mb-1 text-xs font-medium text-zinc-600">Остатки по складам</p>
              <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                {warehouses.map((wh) => (
                  <label key={wh.id} className="flex flex-col gap-1">
                    <span className="text-xs text-zinc-600">{wh.name}</span>
                    <input
                      value={warehouseStocks[wh.id] ?? "0"}
                      onChange={(e) =>
                        setWarehouseStocks((prev) => ({ ...prev, [wh.id]: e.target.value }))
                      }
                      inputMode="numeric"
                      className="w-full rounded-md border border-zinc-300 px-3 py-2 text-sm"
                    />
                  </label>
                ))}
              </div>
            </div>
          )}
        </div>

        <div className="mt-4 flex flex-wrap gap-4">
          <label className="inline-flex items-center gap-2 text-sm text-zinc-700">
            <input
              type="checkbox"
              checked={showOnStore}
              onChange={(e) => setShowOnStore(e.target.checked)}
              className="h-4 w-4 rounded border-zinc-300 text-zinc-900 focus:ring-zinc-500"
            />
            Показувати на сайті
          </label>
          <label className="inline-flex items-center gap-2 text-sm text-zinc-700">
            <input
              type="checkbox"
              checked={isActive}
              onChange={(e) => setIsActive(e.target.checked)}
              className="h-4 w-4 rounded border-zinc-300 text-zinc-900 focus:ring-zinc-500"
            />
            Активен
          </label>
        </div>

        <div className="mt-6 flex gap-2">
          <button
            type="button"
            onClick={handleSave}
            disabled={saving || !product}
            className="btn-primary"
          >
            {saving ? "Сохранение…" : "Сохранить"}
          </button>
          <button
            type="button"
            onClick={onClose}
            className="rounded-md border border-zinc-300 px-3 py-2 text-sm font-medium text-zinc-700 hover:bg-zinc-50"
          >
            Отмена
          </button>
        </div>
      </div>
    </div>
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
  const handleActivate = async (e: React.MouseEvent) => {
    e.stopPropagation();
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
      title="Зробити активним"
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
  const [settingPrimaryId, setSettingPrimaryId] = useState<string | null>(null);
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
            aria-label="Закрити"
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
                  <div className="flex items-center justify-between gap-2">
                    <p className="min-w-0 truncate text-xs text-zinc-500" title={img.fileName}>
                      {img.fileName}
                      {img.isPrimary && " (главное)"}
                    </p>
                    {!img.isPrimary && (
                      <button
                        type="button"
                        disabled={settingPrimaryId === img.id}
                        onClick={async () => {
                          setSettingPrimaryId(img.id);
                          try {
                            await productsApi.setPrimaryProductImage(img.id);
                            const r = await productsApi.listProductImages(productId);
                            setImages(r.items);
                          } finally {
                            setSettingPrimaryId(null);
                          }
                        }}
                        className="shrink-0 rounded border border-zinc-200 bg-white px-2 py-1 text-[11px] text-zinc-700 hover:bg-zinc-50 disabled:opacity-50"
                        title="Зробити головним"
                      >
                        {settingPrimaryId === img.id ? "…" : "Главное"}
                      </button>
                    )}
                  </div>
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
        setError(err instanceof Error ? err.message : "Помилка запуску синхронізації");
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
          Файли з папки зіставляються з товарами за артикулом у імені файлу.
          Настройте папку и service account в{" "}
          <a href="/settings/google-sheet" className="font-medium text-zinc-900 underline">
            Настройки → Google-таблиця
          </a>
          .
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
              У папці Drive обʼєктів: {result.driveItemsTotal}
            </p>
            {(result.skippedFolders > 0 || result.skippedNonImage > 0) && (
              <p className="mt-1 text-zinc-600">
                Пропущено (папки / не изображения): {result.skippedFolders} /{" "}
                {result.skippedNonImage}
              </p>
            )}
            <p className="mt-1 text-zinc-700">
              Обработано изображений: {result.filesProcessed}
            </p>
            <p className="mt-1 text-zinc-700">
              Сопоставлено с товарами: {result.productsMatched}
            </p>
            <p className="mt-1 text-zinc-700">
              Не сопоставлено изображений: {result.filesUnmatched}
              {result.filesUnmatched > 0 && (
                <>
                  {" "}
                  (без артикула в имени: {result.filesUnmatchedNoArticle}, товар не
                  найден: {result.filesUnmatchedNoProduct})
                </>
              )}
            </p>
            <p className="mt-1 text-zinc-700">
              Товаров с несколькими фото: {result.productsWithMultipleImages}
            </p>
            {result.errors.length > 0 && (
              <p className="mt-2 text-red-600">
                Ошибки: {result.errors.join("; ")}
              </p>
            )}
            {result.unmatchedNoArticleExamples.length > 0 && (
              <p className="mt-2 text-zinc-600">
                Немає артикулу в імені (приклади):{" "}
                {result.unmatchedNoArticleExamples.slice(0, 5).join(", ")}
                {result.unmatchedNoArticleExamples.length > 5 &&
                  ` і ще ${result.unmatchedNoArticleExamples.length - 5}`}
              </p>
            )}
            {result.unmatchedNoProductExamples.length > 0 && (
              <p className="mt-2 text-zinc-600">
                Артикул розпізнано, товару в каталозі немає (приклади):{" "}
                {result.unmatchedNoProductExamples.slice(0, 5).join(", ")}
                {result.unmatchedNoProductExamples.length > 5 &&
                  ` і ще ${result.unmatchedNoProductExamples.length - 5}`}
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
            Закрити
          </button>
        </div>
      </div>
    </div>
  );
}

function StockImportMissingProductsBlock({
  missingProducts,
  onCreated,
}: {
  missingProducts: MissingStockProduct[];
  onCreated: () => void;
}) {
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState<{ created: number; updated: number; failed: string[] } | null>(
    null,
  );

  if (missingProducts.length === 0) return null;

  const handleCreate = async () => {
    setCreating(true);
    setError(null);
    try {
      const res = await productsApi.createMissingFromStockImport(missingProducts);
      setDone(res);
      if (res.created > 0 || res.updated > 0) onCreated();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Не удалось добавить позиции");
    } finally {
      setCreating(false);
    }
  };

  const preview = missingProducts.slice(0, 8);
  const label = (p: MissingStockProduct) => p.fileSku ?? p.sku;

  return (
    <div className="mt-3 rounded border border-amber-200 bg-amber-50 p-3 text-sm">
      <p className="font-medium text-amber-900">
        Не найдено в каталоге: {missingProducts.length}{" "}
        {missingProducts.length === 1 ? "позиция" : "позиций"}
      </p>
      <p className="mt-1 text-amber-800">
        {preview.map((p) => (p.name ? `${label(p)} (${p.name})` : label(p))).join(", ")}
        {missingProducts.length > preview.length
          ? ` і ще ${missingProducts.length - preview.length}`
          : ""}
      </p>
      {done ? (
        <p className="mt-2 text-emerald-800">
          Добавлено: {done.created}
          {done.updated > 0 ? `, обновлено: ${done.updated}` : ""}
          {done.failed.length > 0
            ? `. Не удалось: ${done.failed.slice(0, 5).join(", ")}${
                done.failed.length > 5 ? ` і ще ${done.failed.length - 5}` : ""
              }`
            : ""}
        </p>
      ) : (
        <button
          type="button"
          onClick={() => void handleCreate()}
          disabled={creating}
          className="mt-2 rounded-md bg-amber-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-amber-700 disabled:opacity-50"
        >
          {creating ? "Добавление…" : `Добавить в каталог (${missingProducts.length})`}
        </button>
      )}
      {error ? (
        <p className="mt-2 text-sm text-red-600" role="alert">
          {error}
        </p>
      ) : null}
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
      setError("Оберіть файл");
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
      setError(err instanceof Error ? err.message : "Помилка завантаження");
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
              {result.notFound.length > 0 && !result.missingProducts?.length && (
                <p className="mt-1 text-zinc-600">
                  Не знайдено артикули: {result.notFound.slice(0, 10).join(", ")}
                  {result.notFound.length > 10
                    ? ` і ще ${result.notFound.length - 10}`
                    : ""}
                </p>
              )}
              {result.missingProducts && result.missingProducts.length > 0 ? (
                <StockImportMissingProductsBlock
                  missingProducts={result.missingProducts}
                  onCreated={onSuccess}
                />
              ) : null}
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
            Закрити
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
  warehouses,
}: {
  open: boolean;
  onClose: () => void;
  onSuccess: () => void;
  warehouses: WarehouseItem[];
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
      setError("Оберіть файл");
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
      setError(err instanceof Error ? err.message : "Помилка завантаження");
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
          Первая строка — заголовки. Обязательно: <b>Артикул</b> (или sku) и колонки по складам
          {warehouses.length > 0 ? (
            <>
              :{" "}
              {warehouses
                .slice()
                .sort((a, b) => a.sortOrder - b.sortOrder)
                .map((w) => (
                  <b key={w.id} className="mx-0.5">
                    {w.name}
                  </b>
                ))}
            </>
          ) : (
            " (додайте склади в налаштуваннях каталогу)"
          )}{" "}
          (допускаются заголовки вида «Остаток Днепр»).
        </p>
        <p className="mb-4 text-sm text-amber-800">
          Режим overwrite: для складов из файла остатки артикулов, которых нет в файле, обнуляются.
          При повторе артикула в файле побеждает последняя строка (в т.ч. если она 0).
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
              {result.notFound.length > 0 && !result.missingProducts?.length && (
                <p className="mt-1 text-zinc-600">
                  Не знайдено артикули:{" "}
                  {(result.unresolvedSkus ?? result.notFound).slice(0, 10).join(", ")}
                  {(result.unresolvedSkus ?? result.notFound).length > 10
                    ? ` і ще ${(result.unresolvedSkus ?? result.notFound).length - 10}`
                    : ""}
                </p>
              )}
              {result.missingProducts && result.missingProducts.length > 0 ? (
                <StockImportMissingProductsBlock
                  missingProducts={result.missingProducts}
                  onCreated={onSuccess}
                />
              ) : null}
              {result.resolved && result.resolved.length > 0 && (
                <p className="mt-2 text-zinc-700">
                  Сопоставлено:{" "}
                  {result.resolved
                    .slice(0, 8)
                    .map((r) => `${r.fileSku} → ${r.dbSku}`)
                    .join(", ")}
                  {result.resolved.length > 8 ? ` і ще ${result.resolved.length - 8}` : ""}
                </p>
              )}
              {result.skuCorrections && result.skuCorrections.length > 0 && !result.resolved?.length && (
                <p className="mt-2 text-zinc-700">
                  Зіставлено артикули з файлу:{" "}
                  {result.skuCorrections
                    .slice(0, 8)
                    .map((c) => `${c.fileSku} → ${c.dbSku}`)
                    .join(", ")}
                  {result.skuCorrections.length > 8
                    ? ` і ще ${result.skuCorrections.length - 8}`
                    : ""}
                </p>
              )}
              {result.matchedSkus && result.matchedSkus.length > 0 && (
                <p className="mt-1 text-zinc-500">
                  Найдено в каталоге: {result.matchedSkus.length} арт.
                </p>
              )}
              {result.unmatchedWarehouseNames && result.unmatchedWarehouseNames.length > 0 && (
                <p className="mt-2 text-amber-800">
                  В файле нет колонок для складов:{" "}
                  {result.unmatchedWarehouseNames.join(", ")}
                </p>
              )}
              {result.duplicateSkus && result.duplicateSkus.length > 0 && (
                <p className="mt-2 text-amber-800">
                  Дубликаты артикулов (последняя строка побеждает):{" "}
                  {result.duplicateSkus.slice(0, 15).join(", ")}
                  {result.duplicateSkus.length > 15
                    ? ` і ще ${result.duplicateSkus.length - 15}`
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
              Закрити
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
      setError("Ціна має бути невідʼємним числом");
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
      setError(err instanceof Error ? err.message : "Помилка створення");
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
            <span className="text-sm text-zinc-700">Показувати на сайті</span>
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

const SEARCH_SUPPLEMENT_MS = 400;

function CatalogPageContent() {
  const [userRole, setUserRole] = useState<string | null>(null);
  const [allItems, setAllItems] = useState<ProductCatalogItem[]>([]);
  /** Inactive / server-only matches merged after debounced API search. */
  const [searchExtras, setSearchExtras] = useState<ProductCatalogItem[]>([]);
  const [warehouses, setWarehouses] = useState<WarehouseItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [searching, setSearching] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const searchSupplementGen = useRef(0);
  const [addProductModalOpen, setAddProductModalOpen] = useState(false);
  const [uploadModalOpen, setUploadModalOpen] = useState(false);
  const [uploadByWarehousesModalOpen, setUploadByWarehousesModalOpen] = useState(false);
  const [warehousesModalOpen, setWarehousesModalOpen] = useState(false);
  const [syncImagesModalOpen, setSyncImagesModalOpen] = useState(false);
  const [imagesModalProduct, setImagesModalProduct] = useState<{
    id: string;
    name: string;
  } | null>(null);
  const [editModalProduct, setEditModalProduct] = useState<ProductCatalogItem | null>(null);
  const [editingStock, setEditingStock] = useState<{
    productId: string;
    value: string;
  } | null>(null);
  const [collapsedCategories, setCollapsedCategories] = useState<Set<string>>(new Set());
  const [expandedSpecsProductId, setExpandedSpecsProductId] = useState<string | null>(null);

  const filteredItems = useMemo(() => {
    const q = search.trim();
    if (!q) return allItems;
    const byId = new Map<string, ProductCatalogItem>();
    for (const p of filterCatalogItems(allItems, q)) byId.set(p.id, p);
    for (const p of searchExtras) byId.set(p.id, p);
    return Array.from(byId.values()).sort((a, b) => a.name.localeCompare(b.name));
  }, [allItems, search, searchExtras]);

  const displayItems = useDeferredValue(filteredItems);
  const isListStale = displayItems !== filteredItems;

  const categoriesWithItems = useMemo(() => {
    const map = new Map<string, ProductCatalogItem[]>();
    for (const p of displayItems) {
      const cat = categoryFromSku(p.sku);
      const list = map.get(cat) ?? [];
      list.push(p);
      map.set(cat, list);
    }
    return Array.from(map.entries())
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([category, categoryItems]) => ({ category, items: categoryItems }));
  }, [displayItems]);

  const toggleCategory = useCallback((category: string) => {
    setCollapsedCategories((prev) => {
      const next = new Set(prev);
      if (next.has(category)) next.delete(category);
      else next.add(category);
      return next;
    });
  }, []);

  const loadCatalog = useCallback(async (opts?: { silent?: boolean }) => {
    try {
      if (!opts?.silent) {
        setLoading(true);
        setError(null);
      }
      const data = await productsApi.listCatalog({
        page: 1,
        pageSize: 500,
      });
      setAllItems(data.items);
      setSearchExtras([]);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unknown error");
    } finally {
      if (!opts?.silent) setLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadCatalog();
  }, [loadCatalog]);

  useEffect(() => {
    apiHttp
      .get<{ user?: { role?: string } }>("/auth/me")
      .then((r) => setUserRole(r.data?.user?.role ?? null))
      .catch(() => setUserRole(null));
  }, []);

  const catalogReadOnly = userRole === "WAREHOUSE";

  const reloadWarehouses = useCallback(async () => {
    try {
      const rows = await listWarehouses();
      setWarehouses(rows);
    } catch {
      setWarehouses([]);
    }
  }, []);

  useEffect(() => {
    void reloadWarehouses();
  }, [reloadWarehouses]);

  const sortedWarehouses = useMemo(
    () =>
      [...warehouses].sort((a, b) => {
        const orderDiff = warehouseDisplayOrder(a.name) - warehouseDisplayOrder(b.name);
        if (orderDiff !== 0) return orderDiff;
        return a.sortOrder - b.sortOrder;
      }),
    [warehouses],
  );
  const sortedWarehouseNames = useMemo(
    () => sortedWarehouses.map((w) => w.name),
    [sortedWarehouses],
  );
  const tableColspan = (catalogReadOnly ? 5 : 8) + sortedWarehouses.length;

  useEffect(() => {
    const q = search.trim();
    if (!q) {
      setSearchExtras([]);
      setSearching(false);
      return;
    }

    const gen = ++searchSupplementGen.current;
    const t = setTimeout(() => {
      void (async () => {
        setSearching(true);
        try {
          const data = await productsApi.listCatalog({
            search: q,
            page: 1,
            pageSize: 500,
          });
          if (searchSupplementGen.current !== gen) return;
          const localIds = new Set(filterCatalogItems(allItems, q).map((p) => p.id));
          setSearchExtras(data.items.filter((p) => !localIds.has(p.id)));
        } catch {
          if (searchSupplementGen.current === gen) setSearchExtras([]);
        } finally {
          if (searchSupplementGen.current === gen) setSearching(false);
        }
      })();
    }, SEARCH_SUPPLEMENT_MS);

    return () => clearTimeout(t);
  }, [search, allItems]);

  const handleShowOnStoreChange = useCallback(
    async (productId: string, next: boolean) => {
      try {
        await productsApi.updateShowOnStore(productId, next);
        setAllItems((prev) =>
          prev.map((it) => (it.id === productId ? { ...it, showOnStore: next } : it)),
        );
        setSearchExtras((prev) =>
          prev.map((it) => (it.id === productId ? { ...it, showOnStore: next } : it)),
        );
      } catch {
        void loadCatalog({ silent: true });
      }
    },
    [loadCatalog],
  );

  const catalogActionBtn =
    "rounded-md border border-zinc-300 px-3 py-2 text-sm font-medium text-zinc-700 hover:bg-zinc-50";
  const catalogToolbarSecondary = (
    <>
      <button
        type="button"
        onClick={() => setWarehousesModalOpen(true)}
        className={catalogActionBtn}
      >
        Склади
      </button>
      <button type="button" onClick={() => setSyncImagesModalOpen(true)} className={catalogActionBtn}>
        Синхронизация фото
      </button>
      <button type="button" onClick={() => setUploadModalOpen(true)} className={catalogActionBtn}>
        Остатки (общий)
      </button>
      <button
        type="button"
        onClick={() => setUploadByWarehousesModalOpen(true)}
        className="btn-primary col-span-2 sm:col-span-1"
      >
        Остатки по складам
      </button>
    </>
  );

  return (
    <div className="min-w-0">
      <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <h1 className="text-xl font-bold text-zinc-900 sm:text-2xl">Каталог</h1>
        <HelpHint routeKey="catalog" />
      </div>
      <div className="mb-4 flex flex-col gap-3">
        <div className="relative">
          <input
            type="search"
            placeholder="Поиск по артикулу или названию…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full min-w-0 rounded-md border border-zinc-300 px-3 py-2.5 pr-9 text-sm focus:border-zinc-500 focus:outline-none focus:ring-1 focus:ring-zinc-500"
            aria-busy={isListStale || searching}
          />
          {(isListStale || searching) && (
            <span
              className="pointer-events-none absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 animate-spin rounded-full border-2 border-zinc-300 border-t-zinc-600"
              aria-hidden
            />
          )}
        </div>
        {!catalogReadOnly ? (
          <>
            <div className="hidden flex-wrap items-center gap-2 sm:flex">
              <button
                type="button"
                onClick={() => setAddProductModalOpen(true)}
                className={catalogActionBtn}
              >
                Добавить позицию
              </button>
              {catalogToolbarSecondary}
            </div>
            <div className="grid grid-cols-2 gap-2 sm:hidden">{catalogToolbarSecondary}</div>
          </>
        ) : (
          <p className="text-xs text-zinc-500">Перегляд залишків (без редагування)</p>
        )}
      </div>

      {loading && <div className="text-sm text-zinc-600">Загрузка…</div>}
      {error && (
        <div className="text-sm text-red-600" role="alert">
          {error}
        </div>
      )}

      {!loading && !error && categoriesWithItems.length === 0 && (
        <div className="rounded-xl border border-zinc-200 bg-white px-4 py-8 text-center text-sm text-zinc-500 shadow-sm">
          Нет товаров
        </div>
      )}

      {!loading && !error && categoriesWithItems.length > 0 && (
        <>
        <div className="hidden overflow-hidden rounded-xl border border-zinc-200 bg-white shadow-sm sm:block">
            <div className="overflow-x-auto">
            <table className="w-full min-w-[720px] text-sm">
              <thead className="bg-zinc-100/80 text-left text-xs font-medium uppercase text-zinc-500">
                <tr>
                  <th className="w-16 px-2 py-3">Фото</th>
                  <th className="px-4 py-3">Артикул</th>
                  <th className="px-4 py-3">Название</th>
                  <th className="px-4 py-3">Ед.</th>
                  <th className="px-4 py-3">Цена</th>
                  {sortedWarehouses.map((wh) => (
                    <th key={wh.id} className="px-4 py-3">
                      {wh.name}
                    </th>
                  ))}
                  {!catalogReadOnly ? (
                    <>
                      <th className="w-24 px-2 py-3 text-center" title="Отображать на сайте">
                        На сайте
                      </th>
                      <th className="w-10 px-2 py-3" aria-label="Редактировать" />
                      <th className="w-10 px-2 py-3" aria-label="Удалить" />
                    </>
                  ) : null}
                </tr>
              </thead>
              {categoriesWithItems.map(({ category, items: categoryItems }) => {
                const isCollapsed = collapsedCategories.has(category);
                return (
                  <tbody key={category} className="border-t border-zinc-200">
                    <tr>
                      <td colSpan={tableColspan} className="p-0">
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
                        <Fragment key={p.id}>
                        <tr
                          className={`border-t border-zinc-100 hover:bg-zinc-50 ${p.isActive === false ? "bg-zinc-100/60" : ""} ${expandedSpecsProductId === p.id ? "bg-zinc-100/80" : ""} cursor-pointer`}
                          onClick={() =>
                            setExpandedSpecsProductId((id) => (id === p.id ? null : p.id))
                          }
                          title="Натисніть рядок, щоб показати характеристики"
                        >
                          <td className="px-2 py-2" onClick={(e) => e.stopPropagation()}>
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
                          {sortedWarehouseNames.map((wh) => (
                            <td
                              key={wh}
                              className="px-4 py-3 text-right tabular-nums text-zinc-700"
                              title={stockTitleAtWarehouse(p, wh)}
                            >
                              {qtyAtWarehouse(p, wh)}
                            </td>
                          ))}
                          {!catalogReadOnly ? (
                            <td className="px-2 py-3 text-center" onClick={(e) => e.stopPropagation()}>
                              <label className="inline-flex cursor-pointer items-center gap-1.5">
                                <input
                                  type="checkbox"
                                  checked={p.showOnStore ?? true}
                                  onChange={(e) => void handleShowOnStoreChange(p.id, e.target.checked)}
                                  className="h-4 w-4 rounded border-zinc-300 text-zinc-900 focus:ring-zinc-500"
                                  title={p.showOnStore ?? true ? "Сховати з сайту" : "Показати на сайті"}
                                />
                                <span className="sr-only">Отображать на сайте</span>
                              </label>
                            </td>
                          ) : null}
                          {!catalogReadOnly ? (
                            <td className="px-2 py-3" onClick={(e) => e.stopPropagation()}>
                              <CatalogRowEditButton
                                productName={p.name}
                                onEdit={() => setEditModalProduct(p)}
                              />
                            </td>
                          ) : null}
                          {!catalogReadOnly ? (
                            <td className="px-2 py-3" onClick={(e) => e.stopPropagation()}>
                              <CatalogRowDeleteButton
                                productId={p.id}
                                productName={p.name}
                                onDeleted={loadCatalog}
                              />
                            </td>
                          ) : null}
                        </tr>
                        {expandedSpecsProductId === p.id ? (
                          <CatalogExpandedCharacteristics
                            product={p}
                            tableColspan={tableColspan}
                          />
                        ) : null}
                        </Fragment>
                      ))}
                  </tbody>
                );
              })}
            </table>
            </div>
        </div>

        <div className="sm:hidden space-y-4">
          {categoriesWithItems.map(({ category, items: categoryItems }) => {
            const isCollapsed = collapsedCategories.has(category);
            return (
              <section key={category} className="min-w-0">
                <button
                  type="button"
                  onClick={() => toggleCategory(category)}
                  className="flex w-full items-center gap-2 rounded-xl border border-zinc-200 bg-white px-4 py-3 text-left font-medium text-zinc-800 shadow-sm hover:bg-zinc-50"
                >
                  <svg
                    className={`h-4 w-4 shrink-0 transition-transform ${isCollapsed ? "" : "rotate-90"}`}
                    fill="none"
                    stroke="currentColor"
                    viewBox="0 0 24 24"
                    aria-hidden
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={2}
                      d="M9 5l7 7-7 7"
                    />
                  </svg>
                  <span className="min-w-0 flex-1 truncate">{categoryLabel(category)}</span>
                  <span className="shrink-0 text-xs font-normal text-zinc-500">
                    ({categoryItems.length})
                  </span>
                </button>
                {!isCollapsed && (
                  <div className="mt-2 space-y-2">
                    {categoryItems.map((p) => (
                      <CatalogProductCard
                        key={p.id}
                        product={p}
                        expanded={expandedSpecsProductId === p.id}
                        onToggleExpand={() =>
                          setExpandedSpecsProductId((id) => (id === p.id ? null : p.id))
                        }
                        onOpenImages={() => setImagesModalProduct({ id: p.id, name: p.name })}
                        onShowOnStoreChange={(checked) => handleShowOnStoreChange(p.id, checked)}
                        warehouseNames={sortedWarehouseNames}
                        qtyAtWarehouse={qtyAtWarehouse}
                        stockTitleAtWarehouse={stockTitleAtWarehouse}
                        editButton={
                          <CatalogRowEditButton
                            productName={p.name}
                            onEdit={() => setEditModalProduct(p)}
                          />
                        }
                        deleteButton={
                          <CatalogRowDeleteButton
                            productId={p.id}
                            productName={p.name}
                            onDeleted={loadCatalog}
                          />
                        }
                        activateButton={
                          <ActivateProductButton
                            productId={p.id}
                            productName={p.name}
                            onActivated={loadCatalog}
                          />
                        }
                      />
                    ))}
                  </div>
                )}
              </section>
            );
          })}
        </div>
        </>
      )}

      {!catalogReadOnly ? (
        <button
          type="button"
          onClick={() => setAddProductModalOpen(true)}
          className="fixed bottom-20 right-4 z-40 flex h-14 w-14 items-center justify-center rounded-full bg-accent-500 text-white shadow-lg transition-opacity hover:bg-accent-600 sm:hidden"
          aria-label="Добавить позицию"
        >
          <span className="text-2xl leading-none">+</span>
        </button>
      ) : null}

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
        warehouses={warehouses}
      />
      <WarehousesModal
        open={warehousesModalOpen}
        onClose={() => setWarehousesModalOpen(false)}
        onChanged={() => {
          void reloadWarehouses();
          void loadCatalog({ silent: true });
        }}
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
      <EditProductModal
        open={Boolean(editModalProduct)}
        product={editModalProduct}
        warehouses={warehouses}
        onClose={() => setEditModalProduct(null)}
        onSaved={loadCatalog}
      />
    </div>
  );
}

export default function CatalogPage() {
  return <CatalogPageContent />;
}

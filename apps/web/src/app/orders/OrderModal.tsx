"use client";

import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { TtnModal } from "./TtnModal";

// =====================
// Small local UI helpers
// =====================

type Option = { id: string; label: string; meta?: any };

function cx(...parts: Array<string | false | null | undefined>) {
  return parts.filter(Boolean).join(" ");
}

function renderValue(value: unknown): string {
  if (value === null || value === undefined) return "";
  if (typeof value === "string") return value;
  if (typeof value === "number" || typeof value === "boolean") return String(value);
  try {
    return JSON.stringify(value, null, 2);
  } catch {
    return String(value);
  }
}

function Badge({ children, className }: { children: React.ReactNode; className?: string }) {
  return (
    <span
      className={cx(
        "inline-flex items-center rounded-full border px-2 py-0.5 text-[11px] font-medium",
        className,
      )}
    >
      {children}
    </span>
  );
}

/**
 * Minimal searchable select (no external deps).
 * - click to open
 * - type to filter
 * - shows optional "Create new" action when nothing matches
 */
function SearchableSelectLite({
  value,
  options,
  placeholder,
  disabled,
  isLoading,
  onChange,
  onCreate,
  createLabel,
}: {
  value: string | null;
  options: Option[];
  placeholder?: string;
  disabled?: boolean;
  isLoading?: boolean;
  onChange: (id: string | null) => void;
  onCreate?: (typed: string) => void;
  createLabel?: string;
}) {
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState("");
  const rootRef = useRef<HTMLDivElement | null>(null);

  const selected = useMemo(() => options.find((o) => o.id === value) ?? null, [options, value]);

  const filtered = useMemo(() => {
    const s = q.trim().toLowerCase();
    if (!s) return options;
    return options.filter((o) => o.label.toLowerCase().includes(s));
  }, [options, q]);

  useEffect(() => {
    const onDoc = (e: MouseEvent) => {
      const el = rootRef.current;
      if (!el) return;
      if (e.target instanceof Node && !el.contains(e.target)) setOpen(false);
    };
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, []);

  useEffect(() => {
    if (!open) setQ("");
  }, [open]);

  return (
    <div ref={rootRef} className="relative">
      <button
        type="button"
        disabled={disabled}
        onClick={() => setOpen((v) => !v)}
        className={cx(
          "flex w-full items-center justify-between rounded-md border border-zinc-200 bg-white px-3 py-2 text-left text-sm",
          disabled && "opacity-60",
        )}
      >
        <span className={cx("truncate", selected ? "text-zinc-900" : "text-zinc-500")}>
          {selected ? selected.label : placeholder ?? "Select…"}
        </span>
        <span className="ml-3 text-xs text-zinc-400">▾</span>
      </button>

      {open ? (
        <div className="absolute z-50 mt-1 w-full overflow-hidden rounded-md border border-zinc-200 bg-white shadow-lg">
          <div className="p-2">
            <input
              autoFocus
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder={isLoading ? "Loading…" : "Search…"}
              className="w-full rounded-md border border-zinc-200 px-3 py-2 text-sm outline-none focus:border-zinc-400"
            />
          </div>

          <div className="max-h-56 overflow-auto">
            {isLoading ? (
              <div className="px-3 py-2 text-sm text-zinc-500">Loading…</div>
            ) : filtered.length === 0 ? (
              <div className="px-3 py-2 text-sm text-zinc-500">
                No results
                {onCreate ? (
                  <button
                    type="button"
                    className="ml-2 rounded-md border border-zinc-200 px-2 py-1 text-xs text-zinc-700 hover:bg-zinc-50"
                    onClick={() => {
                      setOpen(false);
                      onCreate(q.trim());
                    }}
                  >
                    {createLabel ?? "Create"}
                  </button>
                ) : null}
              </div>
            ) : (
              <>
                {filtered.map((o) => (
                  <button
                    key={o.id}
                    type="button"
                    onClick={() => {
                      onChange(o.id);
                      setOpen(false);
                    }}
                    className={cx(
                      "flex w-full items-start gap-2 px-3 py-2 text-left text-sm hover:bg-zinc-50",
                      o.id === value && "bg-zinc-50",
                    )}
                  >
                    <span className="flex-1 truncate text-zinc-900">{o.label}</span>
                  </button>
                ))}
                {onCreate ? (
                  <div className="border-t border-zinc-100 p-2">
                    <button
                      type="button"
                      className="w-full rounded-md border border-zinc-200 px-3 py-2 text-sm text-zinc-700 hover:bg-zinc-50"
                      onClick={() => {
                        setOpen(false);
                        onCreate(q.trim());
                      }}
                    >
                      {createLabel ?? "Create"}
                    </button>
                  </div>
                ) : null}
              </>
            )}
          </div>
        </div>
      ) : null}
    </div>
  );
}

// =====================
// Types
// =====================

type OrderItem = {
  id: string;
  productId: string;
  productName?: string;
  product?: {
    id: string;
    sku: string;
    name: string;
    unit: string;
  };
  qty: number;
  price: number;
  lineTotal: number;
};

type OrderDetails = {
  id: string;
  orderNumber: string;
  companyId: string | null;
  clientId: string | null;
  contactId: string | null;
  deliveryData?: any;
  company?: { id: string; name: string };
  client?: { id: string; firstName: string; lastName: string; phone: string };

  status: string;
  deliveryMethod: string | null;

  discountAmount: number;
  totalAmount: number;
  comment: string | null;
  createdAt: string;
  items: OrderItem[];
  currency: string;
};

type ProductSearchItem = {
  id: string;
  sku: string;
  name: string;
  unit: string;
  basePrice: number;
};

type ProductsResponse = {
  items: ProductSearchItem[];
  total: number;
  page: number;
  pageSize: number;
};

type CompanyOption = { id: string; name: string };

type ContactOption = {
  id: string;
  firstName: string;
  lastName: string;
  phone: string;
  companyId?: string | null;
};

type TimelineItem = {
  id: string;
  source: "ACTIVITY" | "STATUS";
  type: string;
  title: string;
  body: string;
  occurredAt: string;
  createdAt: string;
  createdBy: string;
};

type TimelineResponse = { items: TimelineItem[] };

type OrderModalProps = {
  apiBaseUrl: string; // "/api"
  orderId: string | null; // null => create mode
  onClose: () => void;
  onSaved?: () => void;
  prefill?: { companyId?: string | null; clientId?: string | null };
  onOpenCompany?: (companyId: string) => void;
  onOpenContact?: (contactId: string) => void;
};

// =====================
// Status stepper
// =====================

type StepDef = {
  key: string;
  label: string;
  color: "zinc" | "blue" | "amber" | "emerald" | "red";
};

const ORDER_STEPS: StepDef[] = [
  { key: "NEW", label: "New", color: "zinc" },
  { key: "IN_WORK", label: "In work", color: "blue" },
  { key: "READY_TO_SHIP", label: "Ready", color: "amber" },
  { key: "SHIPPED", label: "Shipped", color: "blue" },
  { key: "PAYMENT_CONTROL", label: "Payment", color: "amber" },
  { key: "SUCCESS", label: "Success", color: "emerald" },
  { key: "RETURNING", label: "Returning", color: "red" },
  { key: "CANCELED", label: "Canceled", color: "red" },
];

function stepIndex(status: string) {
  const idx = ORDER_STEPS.findIndex((s) => s.key === status);
  return idx >= 0 ? idx : 0;
}

function Stepper({ status }: { status: string }) {
  const activeIdx = stepIndex(status);

  const isCanceled = status === "CANCELED";
  const isReturning = status === "RETURNING";

  const colorClasses = (c: StepDef["color"]) => {
    switch (c) {
      case "blue":
        return { on: "bg-blue-600 text-white border-blue-600", off: "bg-zinc-100 text-zinc-600 border-zinc-200" };
      case "amber":
        return { on: "bg-amber-500 text-white border-amber-500", off: "bg-zinc-100 text-zinc-600 border-zinc-200" };
      case "emerald":
        return { on: "bg-emerald-600 text-white border-emerald-600", off: "bg-zinc-100 text-zinc-600 border-zinc-200" };
      case "red":
        return { on: "bg-red-600 text-white border-red-600", off: "bg-zinc-100 text-zinc-600 border-zinc-200" };
      default:
        return { on: "bg-zinc-900 text-white border-zinc-900", off: "bg-zinc-100 text-zinc-600 border-zinc-200" };
    }
  };

  const isDone = (s: StepDef, idx: number) => {
    if (isCanceled) return s.key === "CANCELED";
    if (isReturning) return s.key === "RETURNING";
    return idx <= activeIdx;
  };

  return (
    <div className="border-b border-zinc-200 px-6 py-3">
      <div className="flex flex-wrap items-center gap-2">
        {ORDER_STEPS.map((s, idx) => {
          const done = isDone(s, idx);
          const cls = colorClasses(s.color);
          return (
            <Badge key={s.key} className={done ? cls.on : cls.off}>
              {s.label}
            </Badge>
          );
        })}
      </div>
    </div>
  );
}

// =====================
// Main
// =====================

type EditingField = null | "company" | "client" | "delivery" | "discount" | "comment";

export function OrderModal({
  apiBaseUrl,
  orderId,
  onClose,
  onSaved,
  prefill,
  onOpenCompany,
  onOpenContact,
}: OrderModalProps) {
  const isCreate = orderId === null;

  const [order, setOrder] = useState<OrderDetails | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [saving, setSaving] = useState(false);
  const [editing, setEditing] = useState<EditingField>(null);

  const [companies, setCompanies] = useState<CompanyOption[]>([]);
  const [contacts, setContacts] = useState<ContactOption[]>([]);
  const [loadingCompanies, setLoadingCompanies] = useState(false);
  const [loadingContacts, setLoadingContacts] = useState(false);

  // local editable values
  const [companyId, setCompanyId] = useState<string | null>(null);
  const [clientId, setClientId] = useState<string | null>(null);
  const [deliveryMethod, setDeliveryMethod] = useState<string>("PICKUP");
  const [discountAmount, setDiscountAmount] = useState<number>(0);
  const [comment, setComment] = useState<string>("");

  // Add Item
  const [showAddForm, setShowAddForm] = useState(false);
  const [search, setSearch] = useState("");
  const [searchResults, setSearchResults] = useState<ProductSearchItem[]>([]);
  const [searchLoading, setSearchLoading] = useState(false);
  const [searchError, setSearchError] = useState<string | null>(null);
  const [selectedProduct, setSelectedProduct] = useState<ProductSearchItem | null>(null);
  const [qty, setQty] = useState(1);
  const [price, setPrice] = useState(0);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [submittingItem, setSubmittingItem] = useState(false);

  // Timeline
  const [timeline, setTimeline] = useState<TimelineItem[]>([]);
  const [timelineLoading, setTimelineLoading] = useState(false);
  const [timelineError, setTimelineError] = useState<string | null>(null);

  // TTN
  const [showTtnModal, setShowTtnModal] = useState(false);

  const canClose = !saving && !submittingItem;

  const fetchCompanies = useCallback(async () => {
    setLoadingCompanies(true);
    try {
      const r = await fetch(`${apiBaseUrl}/companies?page=1&pageSize=200`, { cache: "no-store" });
      if (!r.ok) {
        setCompanies([]);
        return;
      }
      const data = await r.json();
      setCompanies(Array.isArray(data?.items) ? data.items : []);
    } finally {
      setLoadingCompanies(false);
    }
  }, [apiBaseUrl]);

  const fetchContacts = useCallback(
    async (cid: string | null) => {
      setLoadingContacts(true);
      setContacts([]);
      try {
        const url = cid
          ? `${apiBaseUrl}/contacts?companyId=${encodeURIComponent(cid)}&page=1&pageSize=200`
          : `${apiBaseUrl}/contacts?page=1&pageSize=200`;
        const r = await fetch(url, { cache: "no-store" });
        if (!r.ok) return;
        const data = await r.json();
        setContacts(Array.isArray(data?.items) ? data.items : []);
      } finally {
        setLoadingContacts(false);
      }
    },
    [apiBaseUrl],
  );

  const refreshOrder = useCallback(async () => {
    if (!orderId) return;
    setLoading(true);
    setError(null);
    try {
      const r = await fetch(`${apiBaseUrl}/orders/${orderId}`, {
        credentials: "include",
        cache: "no-store",
      });
      if (!r.ok) throw new Error(`Failed to load order (${r.status})`);
      const data = (await r.json()) as OrderDetails;
      setOrder(data);
      setCompanyId(data.companyId ?? null);
      setClientId(data.clientId ?? null);
      setDeliveryMethod(data.deliveryMethod ?? "PICKUP");
      setDiscountAmount(Number(data.discountAmount ?? 0));
      setComment(data.comment ?? "");
    } catch (e) {
      setOrder(null);
      setError(e instanceof Error ? e.message : "Failed to load order");
    } finally {
      setLoading(false);
    }
  }, [apiBaseUrl, orderId]);

  const refreshTimeline = useCallback(async () => {
    if (!orderId) return;
    setTimelineLoading(true);
    setTimelineError(null);
    try {
      const r = await fetch(`${apiBaseUrl}/orders/${orderId}/timeline`, { cache: "no-store" });
      if (!r.ok) throw new Error(`Failed to load timeline (${r.status})`);
      const data = (await r.json()) as TimelineResponse;
      setTimeline(data.items || []);
    } catch (e) {
      setTimeline([]);
      setTimelineError(e instanceof Error ? e.message : "Failed to load timeline");
    } finally {
      setTimelineLoading(false);
    }
  }, [apiBaseUrl, orderId]);

  // init
  useEffect(() => {
    setError(null);
    setTimelineError(null);
    setEditing(null);
    setShowAddForm(false);
    setSelectedProduct(null);
    setSearch("");
    setSearchResults([]);
    setQty(1);
    setPrice(0);
    setSubmitError(null);

    if (isCreate) {
      const pCompanyId = prefill?.companyId ?? null;
      const pClientId = prefill?.clientId ?? null;
      setCompanyId(pCompanyId);
      setClientId(pClientId);
      setDeliveryMethod("PICKUP");
      setDiscountAmount(0);
      setComment("");
      void fetchCompanies();
      void fetchContacts(pCompanyId);
      setOrder(null);
      setTimeline([]);
      return;
    }

    void refreshOrder();
    void refreshTimeline();
  }, [
    isCreate,
    orderId,
    prefill?.companyId,
    prefill?.clientId,
    fetchCompanies,
    fetchContacts,
    refreshOrder,
    refreshTimeline,
  ]);

  // ESC
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return;
      if (editing) {
        setEditing(null);
        return;
      }
      if (canClose) onClose();
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [editing, canClose, onClose]);

  const patchOrder = useCallback(
    async (payload: Record<string, any>) => {
      if (!orderId) return;
      setSaving(true);
      try {
        const r = await fetch(`${apiBaseUrl}/orders/${orderId}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
          credentials: "include",
          cache: "no-store",
        });
        if (!r.ok) {
          const data = await r.json().catch(() => ({}));
          throw new Error(data?.message || `Failed to update order (${r.status})`);
        }
        await Promise.all([refreshOrder(), refreshTimeline()]);
        onSaved?.();
      } catch (e) {
        alert(e instanceof Error ? e.message : "Failed to save");
        // rollback view to server state
        await refreshOrder();
      } finally {
        setSaving(false);
      }
    },
    [apiBaseUrl, onSaved, orderId, refreshOrder, refreshTimeline],
  );

  const createOrder = useCallback(async () => {
    setSaving(true);
    try {
      const r = await fetch(`${apiBaseUrl}/orders`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          companyId,
          clientId,
          contactId: clientId,
          deliveryMethod,
          paymentMethod: "CASH",
          comment: comment.trim() ? comment.trim() : null,
          discountAmount: Number(discountAmount) || 0,
        }),
        credentials: "include",
        cache: "no-store",
      });
      if (!r.ok) {
        const data = await r.json().catch(() => ({}));
        throw new Error(data?.message || `Failed to create order (${r.status})`);
      }
      onSaved?.();
      onClose();
    } catch (e) {
      alert(e instanceof Error ? e.message : "Failed to create order");
    } finally {
      setSaving(false);
    }
  }, [apiBaseUrl, clientId, comment, companyId, deliveryMethod, discountAmount, onClose, onSaved]);

  // product search debounce
  useEffect(() => {
    if (!showAddForm || !orderId || selectedProduct) return;
    if (search.trim().length === 0) {
      setSearchResults([]);
      setSearchError(null);
      return;
    }
    let alive = true;
    const t = setTimeout(async () => {
      setSearchLoading(true);
      setSearchError(null);
      try {
        const r = await fetch(
          `${apiBaseUrl}/products?search=${encodeURIComponent(search)}&page=1&pageSize=10`,
          { cache: "no-store" },
        );
        if (!r.ok) throw new Error(`Failed to load products (${r.status})`);
        const data = (await r.json()) as ProductsResponse;
        if (alive) setSearchResults(data.items || []);
      } catch (e) {
        if (alive) {
          setSearchResults([]);
          setSearchError(e instanceof Error ? e.message : "Failed to load products");
        }
      } finally {
        if (alive) setSearchLoading(false);
      }
    }, 300);
    return () => {
      alive = false;
      clearTimeout(t);
    };
  }, [apiBaseUrl, orderId, showAddForm, search, selectedProduct]);

  const handleSelectProduct = (p: ProductSearchItem) => {
    setSelectedProduct(p);
    setPrice(p.basePrice);
    setSearch(p.name);
    setSearchResults([]);
    setSearchError(null);
  };

  const handleAddItemSubmit = async () => {
    if (!orderId || !selectedProduct) return;

    if (!Number.isFinite(qty) || qty < 1) {
      setSubmitError("Qty must be at least 1");
      return;
    }
    if (!Number.isFinite(price) || price < 0) {
      setSubmitError("Price must be 0 or more");
      return;
    }

    setSubmittingItem(true);
    setSubmitError(null);
    try {
      const r = await fetch(`${apiBaseUrl}/orders/${orderId}/items`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ productId: selectedProduct.id, qty, price }),
        cache: "no-store",
      });
      if (!r.ok) throw new Error(`Failed to add item (${r.status})`);

      setShowAddForm(false);
      setSelectedProduct(null);
      setSearch("");
      setSearchResults([]);
      setQty(1);
      setPrice(0);

      await Promise.all([refreshOrder(), refreshTimeline()]);
      onSaved?.();
    } catch (e) {
      setSubmitError(e instanceof Error ? e.message : "Failed to add item");
    } finally {
      setSubmittingItem(false);
    }
  };

  const headerTitle = useMemo(() => {
    if (isCreate) return "Create order";
    return order?.orderNumber ?? "…";
  }, [isCreate, order?.orderNumber]);

  const formatDt = (iso: string) => {
    try {
      return new Date(iso).toLocaleString();
    } catch {
      return iso;
    }
  };

  const np = (order as any)?.deliveryData?.novaPoshta;
  const ttnNumber: string | null = np?.ttn?.number ?? null;
  const ttnStatusText: string | null = np?.status?.Status ?? np?.status?.statusText ?? null;
  const ttnStatusCode: string | null = np?.status?.StatusCode ?? np?.status?.statusCode ?? null;
  const ttnStatusLabel = ttnStatusText ? (ttnStatusCode ? `${ttnStatusText} (code ${ttnStatusCode})` : ttnStatusText) : null;

  const canShowCreateTtnButton = useMemo(() => {
    return !isCreate && !loading && !!order && order.deliveryMethod === "NOVA_POSHTA";
  }, [isCreate, loading, order]);

  const ensureListsForCompanyClient = useCallback(
    async (cid: string | null) => {
      if (companies.length === 0) await fetchCompanies();
      await fetchContacts(cid);
    },
    [companies.length, fetchCompanies, fetchContacts],
  );

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 px-4"
      onClick={() => {
        if (canClose) onClose();
      }}
      role="presentation"
    >
      <div
        className="w-full max-w-6xl max-h-[90vh] overflow-hidden rounded-xl bg-white shadow-xl"
        onClick={(e) => e.stopPropagation()}
        role="presentation"
      >
        {/* HEADER */}
        <div className="flex items-center justify-between border-b border-zinc-200 px-6 py-4">
          <div>
            <p className="text-sm text-zinc-500">Order</p>
            <h2 className="text-lg font-semibold text-zinc-900">{headerTitle}</h2>
          </div>
          <div className="flex items-center gap-2">
            {canShowCreateTtnButton ? (
              <button
                type="button"
                onClick={() => setShowTtnModal(true)}
                className="rounded-md bg-emerald-600 px-3 py-1 text-sm font-medium text-white hover:bg-emerald-500"
              >
                Create TTN (NP)
              </button>
            ) : null}

            <button
              type="button"
              onClick={() => {
                if (canClose) onClose();
              }}
              className="rounded-md px-3 py-1 text-sm text-zinc-600 hover:bg-zinc-100 disabled:text-zinc-400"
              disabled={!canClose}
            >
              Close
            </button>
          </div>
        </div>

        {/* STATUS BAR (only existing order) */}
        {!isCreate && order ? <Stepper status={order.status} /> : null}

        {/* BODY */}
        <div className="px-6 py-4 max-h-[calc(90vh-64px)] overflow-auto">
          {isCreate ? (
            <div className="rounded-md border border-zinc-200 bg-zinc-50 p-4">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-medium text-zinc-600 mb-1">Company</label>
                  <SearchableSelectLite
                    options={companies.map((c) => ({ id: c.id, label: c.name }))}
                    value={companyId}
                    onChange={(id) => {
                      setCompanyId(id);
                      setClientId(null);
                      void fetchContacts(id);
                    }}
                    disabled={loadingCompanies}
                    isLoading={loadingCompanies}
                    placeholder="Select company…"
                    onCreate={onOpenCompany ? () => onOpenCompany("new") : undefined}
                    createLabel="Create company"
                  />
                </div>

                <div>
                  <label className="block text-xs font-medium text-zinc-600 mb-1">Client</label>
                  <SearchableSelectLite
                    options={contacts.map((c) => ({
                      id: c.id,
                      label: `${c.firstName} ${c.lastName} — ${c.phone}${!companyId && c.companyId ? " (Has Company)" : ""}`,
                    }))}
                    value={clientId}
                    onChange={(id) => {
                      setClientId(id);
                      if (id) {
                        const c = contacts.find((x) => x.id === id);
                        if (c?.companyId) setCompanyId(c.companyId);
                      }
                    }}
                    disabled={loadingContacts}
                    isLoading={loadingContacts}
                    placeholder="Select client…"
                    onCreate={onOpenContact ? () => onOpenContact("new") : undefined}
                    createLabel="Create contact"
                  />
                </div>

                <div>
                  <label className="block text-xs font-medium text-zinc-600">Delivery</label>
                  <select
                    value={deliveryMethod}
                    onChange={(e) => setDeliveryMethod(e.target.value)}
                    className="mt-1 w-full rounded-md border border-zinc-300 px-3 py-2 text-sm focus:border-zinc-500 focus:outline-none"
                  >
                    <option value="PICKUP">Pickup</option>
                    <option value="NOVA_POSHTA">Nova Poshta</option>
                  </select>
                </div>

                <div>
                  <label className="block text-xs font-medium text-zinc-600">Discount</label>
                  <input
                    type="number"
                    min={0}
                    value={discountAmount}
                    onChange={(e) => setDiscountAmount(Math.max(0, Number(e.target.value)))}
                    className="mt-1 w-full rounded-md border border-zinc-300 px-3 py-2 text-sm focus:border-zinc-500 focus:outline-none"
                  />
                </div>
              </div>

              <div className="mt-4">
                <label className="block text-xs font-medium text-zinc-600">Comment</label>
                <textarea
                  rows={3}
                  value={comment}
                  onChange={(e) => setComment(e.target.value)}
                  className="mt-1 w-full rounded-md border border-zinc-300 px-3 py-2 text-sm focus:border-zinc-500 focus:outline-none"
                />
              </div>

              <div className="mt-4 flex justify-end gap-2">
                <button
                  type="button"
                  onClick={onClose}
                  disabled={saving}
                  className="rounded-md border border-zinc-200 px-3 py-2 text-sm text-zinc-700 hover:bg-white disabled:opacity-50"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={() => void createOrder()}
                  disabled={saving}
                  className="rounded-md bg-zinc-900 px-3 py-2 text-sm font-medium text-white hover:bg-zinc-800 disabled:opacity-50"
                >
                  {saving ? "Saving…" : "Create"}
                </button>
              </div>
            </div>
          ) : loading ? (
            <p className="text-sm text-zinc-500">Loading order…</p>
          ) : error ? (
            <p className="text-sm text-red-600">{error}</p>
          ) : !order ? (
            <p className="text-sm text-zinc-500">Order not found</p>
          ) : (
            <div className="grid grid-cols-12 gap-6">
              {/* LEFT */}
              <div className="col-span-12 lg:col-span-7">
                <div className="space-y-6">
                  {/* DETAILS */}
                  <div className="rounded-md border border-zinc-200 bg-white p-4">
                    <div className="grid grid-cols-2 gap-4 text-sm">
                      <div>
                        <div className="text-xs text-zinc-500">Company</div>
                        {editing === "company" ? (
                          <div className="mt-1">
                            <SearchableSelectLite
                              value={companyId}
                              options={companies.map((c) => ({ id: c.id, label: c.name }))}
                              placeholder="Select company…"
                              disabled={saving}
                              isLoading={loadingCompanies}
                              onChange={async (id) => {
                                setCompanyId(id);
                                setClientId(null);
                                const selectedCompany = id ? companies.find((c) => c.id === id) : null;
                                try {
                                  await patchOrder({
                                    companyId: id,
                                    clientId: null,
                                    contactId: null,
                                  });
                                  if (order && id && selectedCompany) {
                                    setOrder((prev) =>
                                      prev
                                        ? {
                                            ...prev,
                                            companyId: id,
                                            company: {
                                              id: selectedCompany.id,
                                              name: selectedCompany.name,
                                            },
                                          }
                                        : prev,
                                    );
                                  }
                                  await fetchContacts(id);
                                } finally {
                                  setEditing(null);
                                }
                              }}
                              onCreate={onOpenCompany ? () => onOpenCompany("new") : undefined}
                              createLabel="Create company"
                            />
                            <div className="mt-1 text-xs text-zinc-500">ESC — cancel</div>
                          </div>
                        ) : (
                          <button
                            type="button"
                            onClick={async () => {
                              setEditing("company");
                              await ensureListsForCompanyClient(companyId);
                            }}
                            className="mt-1 w-full text-left font-medium text-zinc-900 hover:underline"
                          >
                            {order.company ? order.company.name : "—"}
                          </button>
                        )}
                      </div>

                      <div>
                        <div className="text-xs text-zinc-500">Client</div>
                        {editing === "client" ? (
                          <div className="mt-1">
                            <SearchableSelectLite
                              value={clientId}
                              options={contacts.map((c) => ({
                                id: c.id,
                                label: `${c.firstName} ${c.lastName} — ${c.phone}${!companyId && c.companyId ? " (Has Company)" : ""}`,
                              }))}
                              placeholder="Select client…"
                              disabled={saving}
                              isLoading={loadingContacts}
                              onChange={async (id) => {
                                setClientId(id);
                                let nextCompanyId = companyId;
                                const selectedContact = id ? contacts.find((x) => x.id === id) : null;
                                if (selectedContact?.companyId) {
                                  nextCompanyId = selectedContact.companyId;
                                  setCompanyId(selectedContact.companyId);
                                }
                                try {
                                  await patchOrder({
                                    clientId: id,
                                    contactId: id,
                                    companyId: nextCompanyId,
                                  });
                                  // Оптимистично обновляем order.client, чтобы кнопка сразу показала выбранного клиента
                                  if (order && id && selectedContact) {
                                    setOrder((prev) =>
                                      prev
                                        ? {
                                            ...prev,
                                            clientId: id,
                                            client: {
                                              id: selectedContact.id,
                                              firstName: selectedContact.firstName,
                                              lastName: selectedContact.lastName,
                                              phone: selectedContact.phone,
                                            },
                                          }
                                        : prev,
                                    );
                                  }
                                } finally {
                                  setEditing(null);
                                }
                              }}
                              onCreate={onOpenContact ? () => onOpenContact("new") : undefined}
                              createLabel="Create contact"
                            />
                            <div className="mt-1 text-xs text-zinc-500">ESC — cancel</div>
                          </div>
                        ) : (
                          <button
                            type="button"
                            onClick={async () => {
                              setEditing("client");
                              await ensureListsForCompanyClient(companyId);
                            }}
                            className="mt-1 w-full text-left font-medium text-zinc-900 hover:underline"
                          >
                            {order.client
                              ? `${order.client.firstName} ${order.client.lastName} — ${order.client.phone}`
                              : "—"}
                          </button>
                        )}
                      </div>

                      <div>
                        <div className="text-xs text-zinc-500">Delivery</div>
                        {editing === "delivery" ? (
                          <div className="mt-1">
                            <select
                              value={deliveryMethod}
                              onChange={async (e) => {
                                const v = e.target.value;
                                setDeliveryMethod(v);
                                try {
                                  await patchOrder({ deliveryMethod: v });
                                  if (order) {
                                    setOrder((prev) => (prev ? { ...prev, deliveryMethod: v } : prev));
                                  }
                                } finally {
                                  setEditing(null);
                                }
                              }}
                              className="w-full rounded-md border border-zinc-300 px-3 py-2 text-sm focus:border-zinc-500 focus:outline-none"
                              disabled={saving}
                            >
                              <option value="PICKUP">Pickup</option>
                              <option value="NOVA_POSHTA">Nova Poshta</option>
                            </select>
                          </div>
                        ) : (
                          <button
                            type="button"
                            onClick={() => {
                              setDeliveryMethod(order.deliveryMethod ?? "PICKUP");
                              setEditing("delivery");
                            }}
                            className="mt-1 font-medium text-zinc-900 hover:underline"
                          >
                            {order.deliveryMethod ?? "—"}
                          </button>
                        )}
                      </div>

                      <div>
                        <div className="text-xs text-zinc-500">TTN</div>
                        <div className="mt-1 font-medium text-zinc-900">{ttnNumber ? `№ ${ttnNumber}` : "—"}</div>
                      </div>

                      <div className="col-span-2">
                        <div className="text-xs text-zinc-500">NP status</div>
                        <div className="mt-1 text-zinc-700">{ttnStatusLabel ?? "—"}</div>
                      </div>

                      <div>
                        <div className="text-xs text-zinc-500">Status</div>
                        <div className="mt-1 font-medium text-zinc-900">{order.status}</div>
                      </div>

                      <div>
                        <div className="text-xs text-zinc-500">Created</div>
                        <div className="mt-1 text-zinc-700">{formatDt(order.createdAt)}</div>
                      </div>

                      <div>
                        <div className="text-xs text-zinc-500">Discount</div>
                        {editing === "discount" ? (
                          <input
                            type="number"
                            min={0}
                            value={discountAmount}
                            onChange={(e) => setDiscountAmount(Math.max(0, Number(e.target.value)))}
                            onKeyDown={async (e) => {
                              if (e.key === "Enter") {
                                const val = Number(discountAmount) || 0;
                                try {
                                  await patchOrder({ discountAmount: val });
                                  if (order) {
                                    setOrder((prev) => (prev ? { ...prev, discountAmount: val } : prev));
                                  }
                                } finally {
                                  setEditing(null);
                                }
                              }
                            }}
                            onBlur={async () => {
                              const val = Number(discountAmount) || 0;
                              try {
                                await patchOrder({ discountAmount: val });
                                if (order) {
                                  setOrder((prev) => (prev ? { ...prev, discountAmount: val } : prev));
                                }
                              } finally {
                                setEditing(null);
                              }
                            }}
                            className="mt-1 w-full rounded-md border border-zinc-300 px-3 py-2 text-sm focus:border-zinc-500 focus:outline-none"
                            disabled={saving}
                            autoFocus
                          />
                        ) : (
                          <button
                            type="button"
                            onClick={() => {
                              setDiscountAmount(Number(order.discountAmount ?? 0));
                              setEditing("discount");
                            }}
                            className="mt-1 text-left text-zinc-700 hover:underline"
                          >
                            {Number(order.discountAmount ?? 0).toFixed(2)}
                          </button>
                        )}
                      </div>

                      <div>
                        <div className="text-xs text-zinc-500">Total</div>
                        <div className="mt-1 font-semibold text-zinc-900">
                          {order.totalAmount.toFixed(2)} {order.currency}
                        </div>
                      </div>
                    </div>

                    <div className="mt-4">
                      <div className="text-xs text-zinc-500">Comment</div>
                      {editing === "comment" ? (
                        <textarea
                          rows={3}
                          value={comment}
                          onChange={(e) => setComment(e.target.value)}
                          onKeyDown={async (e) => {
                            if ((e.ctrlKey || e.metaKey) && e.key === "Enter") {
                              const val = comment.trim() ? comment.trim() : null;
                              try {
                                await patchOrder({ comment: val });
                                if (order) {
                                  setOrder((prev) => (prev ? { ...prev, comment: val } : prev));
                                }
                              } finally {
                                setEditing(null);
                              }
                            }
                          }}
                          onBlur={async () => {
                            const val = comment.trim() ? comment.trim() : null;
                            try {
                              await patchOrder({ comment: val });
                              if (order) {
                                setOrder((prev) => (prev ? { ...prev, comment: val } : prev));
                              }
                            } finally {
                              setEditing(null);
                            }
                          }}
                          className="mt-1 w-full rounded-md border border-zinc-300 px-3 py-2 text-sm focus:border-zinc-500 focus:outline-none"
                          disabled={saving}
                          autoFocus
                        />
                      ) : (
                        <button
                          type="button"
                          onClick={() => {
                            setComment(order.comment ?? "");
                            setEditing("comment");
                          }}
                          className="mt-1 w-full text-left text-sm text-zinc-800 hover:bg-zinc-50 rounded-md px-2 py-1"
                        >
                          {order.comment ? (
                            <span className="whitespace-pre-wrap">{order.comment}</span>
                          ) : (
                            <span className="text-zinc-400">Click to add comment…</span>
                          )}
                        </button>
                      )}
                      {editing === "comment" ? (
                        <div className="mt-1 text-xs text-zinc-500">Blur — save • Ctrl/⌘ + Enter — save</div>
                      ) : null}
                    </div>
                  </div>

                  {/* ITEMS */}
                  <div className="rounded-md border border-zinc-200 bg-white p-4">
                    <div className="flex items-center justify-between">
                      <h3 className="text-sm font-semibold text-zinc-900">Items</h3>
                      <button
                        type="button"
                        onClick={() => setShowAddForm((v) => !v)}
                        className="rounded-md border border-zinc-200 px-3 py-1 text-xs font-medium text-zinc-700 hover:bg-zinc-50"
                      >
                        {showAddForm ? "Close" : "+ Add item"}
                      </button>
                    </div>

                    {showAddForm ? (
                      <div className="mt-4 rounded-md border border-zinc-200 bg-zinc-50 p-3">
                        <div className="grid grid-cols-12 gap-3">
                          <div className="col-span-12">
                            <label className="block text-xs font-medium text-zinc-600 mb-1">Product</label>
                            <input
                              value={search}
                              onChange={(e) => {
                                setSearch(e.target.value);
                                setSelectedProduct(null);
                              }}
                              placeholder="Search product…"
                              className="w-full rounded-md border border-zinc-300 px-3 py-2 text-sm"
                            />
                            {searchLoading ? <div className="mt-2 text-xs text-zinc-500">Searching…</div> : null}
                            {searchError ? <div className="mt-2 text-xs text-red-600">{searchError}</div> : null}
                            {!selectedProduct && searchResults.length > 0 ? (
                              <div className="mt-2 max-h-40 overflow-auto rounded-md border bg-white">
                                {searchResults.map((p) => (
                                  <button
                                    key={p.id}
                                    type="button"
                                    onClick={() => handleSelectProduct(p)}
                                    className="flex w-full items-center justify-between px-3 py-2 text-left text-sm hover:bg-zinc-50"
                                  >
                                    <span className="font-medium text-zinc-900">{p.name}</span>
                                    <span className="text-xs text-zinc-500">{p.sku}</span>
                                  </button>
                                ))}
                              </div>
                            ) : null}
                            {selectedProduct ? (
                              <div className="mt-2 text-xs text-zinc-600">
                                Selected: <span className="font-medium text-zinc-900">{selectedProduct.name}</span>
                              </div>
                            ) : null}
                          </div>

                          <div className="col-span-6">
                            <label className="block text-xs font-medium text-zinc-600 mb-1">Qty</label>
                            <input
                              type="number"
                              min={1}
                              value={qty}
                              onChange={(e) => setQty(Math.max(1, Number(e.target.value)))}
                              className="w-full rounded-md border border-zinc-300 px-3 py-2 text-sm"
                            />
                          </div>

                          <div className="col-span-6">
                            <label className="block text-xs font-medium text-zinc-600 mb-1">Price</label>
                            <input
                              type="number"
                              min={0}
                              value={price}
                              onChange={(e) => setPrice(Math.max(0, Number(e.target.value)))}
                              className="w-full rounded-md border border-zinc-300 px-3 py-2 text-sm"
                            />
                          </div>
                        </div>

                        {submitError ? <div className="mt-3 text-xs text-red-600">{submitError}</div> : null}

                        <div className="mt-3 flex justify-end">
                          <button
                            type="button"
                            disabled={!selectedProduct || submittingItem}
                            onClick={() => void handleAddItemSubmit()}
                            className="rounded-md bg-zinc-900 px-3 py-2 text-sm font-medium text-white hover:bg-zinc-800 disabled:opacity-50"
                          >
                            {submittingItem ? "Adding…" : "Add"}
                          </button>
                        </div>
                      </div>
                    ) : null}

                    <div className="mt-4 overflow-hidden rounded-md border border-zinc-200">
                      <table className="w-full text-sm">
                        <thead className="bg-zinc-50 text-xs uppercase text-zinc-500">
                          <tr>
                            <th className="px-3 py-2 text-left">Product</th>
                            <th className="px-3 py-2 text-right">Qty</th>
                            <th className="px-3 py-2 text-right">Price</th>
                            <th className="px-3 py-2 text-right">Total</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-zinc-100">
                          {order.items.length === 0 ? (
                            <tr>
                              <td className="px-3 py-3 text-zinc-500" colSpan={4}>
                                No items
                              </td>
                            </tr>
                          ) : (
                            order.items.map((it) => (
                              <tr key={it.id}>
                                <td className="px-3 py-2">
                                  <div className="font-medium text-zinc-900">
                                    {it.product?.name || it.productName || it.productId}
                                  </div>
                                  {it.product?.sku ? <div className="text-xs text-zinc-500">{it.product.sku}</div> : null}
                                </td>
                                <td className="px-3 py-2 text-right text-zinc-700">{it.qty}</td>
                                <td className="px-3 py-2 text-right text-zinc-700">{it.price.toFixed(2)}</td>
                                <td className="px-3 py-2 text-right font-medium text-zinc-900">{it.lineTotal.toFixed(2)}</td>
                              </tr>
                            ))
                          )}
                        </tbody>
                      </table>
                    </div>
                  </div>
                </div>
              </div>

              {/* RIGHT */}
              <div className="col-span-12 lg:col-span-5">
                <div className="rounded-md border border-zinc-200 bg-white p-4">
                  <div className="flex items-center justify-between">
                    <h3 className="text-sm font-semibold text-zinc-900">Timeline</h3>
                    <button
                      type="button"
                      onClick={() => void refreshTimeline()}
                      className="rounded-md border border-zinc-200 px-3 py-1 text-xs font-medium text-zinc-700 hover:bg-zinc-50"
                      disabled={timelineLoading}
                    >
                      {timelineLoading ? "…" : "Refresh"}
                    </button>
                  </div>

                  <div className="mt-4">
                    {timelineError ? (
                      <div className="text-sm text-red-600">{timelineError}</div>
                    ) : timelineLoading ? (
                      <div className="text-sm text-zinc-500">Loading timeline…</div>
                    ) : timeline.length === 0 ? (
                      <div className="text-sm text-zinc-500">No events yet</div>
                    ) : (
                      <div className="space-y-3">
                        {timeline.map((t) => (
                          <div key={t.id} className="rounded-md border border-zinc-200 p-3">
                            <div className="flex items-start justify-between gap-3">
                              <div>
                                <div className="text-xs text-zinc-500">
                                  {t.source} • {t.type}
                                </div>
                                <div className="text-sm font-medium text-zinc-900">{t.title}</div>
                              </div>
                              <div className="text-xs text-zinc-500 whitespace-nowrap">{formatDt(t.occurredAt)}</div>
                            </div>
                            <div className="mt-2 text-sm text-zinc-800 whitespace-pre-wrap">
                              {renderValue(t.body)}
                            </div>
                            <div className="mt-2 text-xs text-zinc-500">by {renderValue(t.createdBy)}</div>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                </div>
              </div>
            </div>
          )}

          {!isCreate && orderId && order ? (
            <TtnModal
              apiBaseUrl={apiBaseUrl}
              open={showTtnModal}
              onClose={() => setShowTtnModal(false)}
              orderId={orderId}
              contactId={(order as any).contactId ?? order.clientId ?? ""}
              onCreated={async () => {
                setShowTtnModal(false);
                await Promise.all([refreshOrder(), refreshTimeline()]);
                onSaved?.();
              }}
            />
          ) : null}
        </div>
      </div>
    </div>
  );
}

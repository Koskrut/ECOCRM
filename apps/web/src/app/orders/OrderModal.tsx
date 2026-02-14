"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { SearchableSelect } from "../../components/SearchableSelect";
import { TtnModal } from "./TtnModal";


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
  deliveryMethod: string | null; // ✅ NEW

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

  // --- Edit / Create form fields (shared) ---
  const [isEditingOrder, setIsEditingOrder] = useState(false);
  const [editCompanyId, setEditCompanyId] = useState<string | null>(null);
  const [editClientId, setEditClientId] = useState<string | null>(null);
  const [editDeliveryMethod, setEditDeliveryMethod] = useState<string>("PICKUP"); // ✅ NEW
  const [editComment, setEditComment] = useState("");
  const [editDiscount, setEditDiscount] = useState(0);
  const [savingOrder, setSavingOrder] = useState(false);

  const [companies, setCompanies] = useState<CompanyOption[]>([]);
  const [contacts, setContacts] = useState<ContactOption[]>([]);
  const [loadingCompanies, setLoadingCompanies] = useState(false);
  const [loadingContacts, setLoadingContacts] = useState(false);

  // --- Add Item (only for existing orders) ---
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

  // --- Timeline (only for existing orders) ---
  const [timeline, setTimeline] = useState<TimelineItem[]>([]);
  const [timelineLoading, setTimelineLoading] = useState(false);
  const [timelineError, setTimelineError] = useState<string | null>(null);

  const canClose = !submittingItem && !savingOrder;


  const [showTtnModal, setShowTtnModal] = useState(false);

  const fetchCompanies = useCallback(async () => {
    setLoadingCompanies(true);
    try {
      const r = await fetch(`${apiBaseUrl}/companies?page=1&pageSize=100`, { cache: "no-store" });
      if (r.ok) {
        const data = await r.json();
        setCompanies(data.items || []);
      } else {
        setCompanies([]);
      }
    } finally {
      setLoadingCompanies(false);
    }
  }, [apiBaseUrl]);

  const fetchContacts = useCallback(
    async (companyId: string | null) => {
      setLoadingContacts(true);
      setContacts([]);
      const url = companyId
        ? `${apiBaseUrl}/contacts?companyId=${companyId}&pageSize=100`
        : `${apiBaseUrl}/contacts?pageSize=100`;
      try {
        const r = await fetch(url, { cache: "no-store" });
        if (r.ok) {
          const data = await r.json();
          setContacts(data.items || []);
        }
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
      const r = await fetch(`${apiBaseUrl}/orders/${orderId}`, { cache: "no-store" });
      if (!r.ok) throw new Error(`Failed to load order (${r.status})`);
      const data = (await r.json()) as OrderDetails;
      setOrder(data);
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

  // init / switch mode
  useEffect(() => {
    setError(null);
    setTimelineError(null);
    setShowAddForm(false);
    setSelectedProduct(null);
    setSearch("");
    setSearchResults([]);
    setQty(1);
    setPrice(0);
    setSubmitError(null);

    if (isCreate) {
      // create mode => сразу открываем edit-форму
      setOrder(null);
      setTimeline([]);
      setIsEditingOrder(true);

      const pCompanyId = prefill?.companyId ?? null;
      const pClientId = prefill?.clientId ?? null;

      setEditCompanyId(pCompanyId);
      setEditClientId(pClientId);
      setEditDeliveryMethod("PICKUP"); // ✅ NEW default
      setEditComment("");
      setEditDiscount(0);

      void fetchCompanies();
      void fetchContacts(pCompanyId);

      return;
    }

    // view mode
    setIsEditingOrder(false);
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

      if (isEditingOrder && !isCreate) {
        setIsEditingOrder(false);
        return;
      }
      if (canClose) onClose();
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [isEditingOrder, isCreate, canClose, onClose]);

  const handleCompanyChange = (newCompanyId: string | null) => {
    setEditCompanyId(newCompanyId);
    // если компания поменялась — клиент сбрасываем
    setEditClientId(null);
    void fetchContacts(newCompanyId);
  };

  const handleClientChange = (contactId: string | null) => {
    setEditClientId(contactId);
    if (contactId) {
      const c = contacts.find((x) => x.id === contactId);
      if (c?.companyId) setEditCompanyId(c.companyId);
    }
  };

  const handleStartEdit = () => {
    if (!order) return;
    setIsEditingOrder(true);
    setEditCompanyId(order.companyId);
    setEditClientId(order.clientId);
    setEditDeliveryMethod(order.deliveryMethod ?? "PICKUP"); // ✅ NEW
    setEditComment(order.comment || "");
    setEditDiscount(order.discountAmount || 0);
    void fetchCompanies();
    void fetchContacts(order.companyId);
  };

  const handleSaveOrder = async () => {
    setSavingOrder(true);
    try {
      // ✅ create mode
      if (isCreate) {
        const r = await fetch(`${apiBaseUrl}/orders`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            companyId: editCompanyId,
            clientId: editClientId,
            deliveryMethod: editDeliveryMethod, // ✅ NEW
            comment: editComment || null,
            discountAmount: Number(editDiscount) || 0,
          }),
          cache: "no-store",
        });

        if (!r.ok) {
          const data = await r.json().catch(() => ({}));
          throw new Error(data?.message || `Failed to create order (${r.status})`);
        }

        onSaved?.();
        onClose();
        return;
      }

      // ✅ update mode
      if (!orderId) return;

      const r = await fetch(`${apiBaseUrl}/orders/${orderId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          companyId: editCompanyId,
          clientId: editClientId,
          deliveryMethod: editDeliveryMethod, // ✅ NEW
          comment: editComment,
          discountAmount: Number(editDiscount),
        }),
        cache: "no-store",
      });

      if (!r.ok) {
        const data = await r.json().catch(() => ({}));
        throw new Error(data?.message || `Failed to update order (${r.status})`);
      }

      setIsEditingOrder(false);
      await Promise.all([refreshOrder(), refreshTimeline()]);
      onSaved?.();
    } catch (e) {
      alert(e instanceof Error ? e.message : "Failed to save");
    } finally {
      setSavingOrder(false);
    }
  };

  // product search debounce (only existing order)
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

  const formatDt = (iso: string) => {
    try {
      return new Date(iso).toLocaleString();
    } catch {
      return iso;
    }
  };

  const headerTitle = useMemo(() => {
    if (isCreate) return "Create order";
    return order?.orderNumber ?? "…";
  }, [isCreate, order?.orderNumber]);

  const np = (order as any)?.deliveryData?.novaPoshta;
  const ttnNumber: string | null = np?.ttn?.number ?? null;
  const ttnStatusText: string | null = np?.status?.Status ?? np?.status?.statusText ?? null;
  const ttnStatusCode: string | null = np?.status?.StatusCode ?? np?.status?.statusCode ?? null;

  const ttnStatusLabel =
    ttnStatusText
      ? (ttnStatusCode ? `${ttnStatusText} (code ${ttnStatusCode})` : ttnStatusText)
      : null;

  const canShowCreateTtnButton = useMemo(() => {
    return !isCreate && !loading && !!order && !isEditingOrder && order.deliveryMethod === "NOVA_POSHTA";
  }, [isCreate, loading, order, isEditingOrder]);

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 px-4"
      onClick={() => {
        if (canClose) onClose();
      }}
      role="presentation"
    >
      <div
        className="w-full max-w-6xl max-h-[90vh] overflow-hidden rounded-lg bg-white shadow-lg"
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
            {canShowCreateTtnButton && (
              <button
                type="button"
                onClick={() => setShowTtnModal(true)}
                className="rounded-md bg-emerald-600 px-3 py-1 text-sm font-medium text-white hover:bg-emerald-500"
              >
                Create TTN (NP)
              </button>
            )}

            {!isCreate && !loading && order && !isEditingOrder && (
              <button
                type="button"
                onClick={handleStartEdit}
                className="rounded-md border border-zinc-200 px-3 py-1 text-sm font-medium text-zinc-700 hover:bg-zinc-50"
              >
                Edit
              </button>
            )}

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

        {/* BODY */}
        <div className="px-6 py-4 max-h-[calc(90vh-64px)] overflow-auto">
          {/* CREATE MODE = always show edit form */}
          {isCreate ? (
            <div className="rounded-md border border-zinc-200 bg-zinc-50 p-4">
              <div className="grid grid-cols-2 gap-4">
                {/* Company */}
                <div>
                  <label className="block text-xs font-medium text-zinc-600 mb-1">Company</label>
                  <SearchableSelect
                    options={companies.map((c) => ({ id: c.id, label: c.name }))}
                    value={editCompanyId}
                    onChange={(val) => handleCompanyChange(val || null)}
                    disabled={loadingCompanies}
                    isLoading={loadingCompanies}
                    placeholder="Select company…"
                  />
                </div>

                {/* Client */}
                <div>
                  <label className="block text-xs font-medium text-zinc-600 mb-1">Client</label>
                  <SearchableSelect
                    options={contacts.map((c) => ({
                      id: c.id,
                      label: `${c.firstName} ${c.lastName} — ${c.phone}${!editCompanyId && c.companyId ? " (Has Company)" : ""
                        }`,
                    }))}
                    value={editClientId}
                    onChange={(val) => handleClientChange(val || null)}
                    disabled={loadingContacts}
                    isLoading={loadingContacts}
                    placeholder="Select client…"
                  />
                </div>

                {/* Delivery */}
                <div>
                  <label className="block text-xs font-medium text-zinc-600">Delivery</label>
                  <select
                    value={editDeliveryMethod}
                    onChange={(e) => setEditDeliveryMethod(e.target.value)}
                    className="mt-1 w-full rounded-md border border-zinc-300 px-3 py-2 text-sm focus:border-zinc-500 focus:outline-none"
                  >
                    <option value="PICKUP">Pickup</option>
                    <option value="NOVA_POSHTA">Nova Poshta</option>
                  </select>
                </div>

                {/* Discount */}
                <div>
                  <label className="block text-xs font-medium text-zinc-600">Discount</label>
                  <input
                    type="number"
                    min={0}
                    value={editDiscount}
                    onChange={(e) => setEditDiscount(Math.max(0, Number(e.target.value)))}
                    className="mt-1 w-full rounded-md border border-zinc-300 px-3 py-2 text-sm focus:border-zinc-500 focus:outline-none"
                  />
                </div>
              </div>

              {/* Comment */}
              <div className="mt-4">
                <label className="block text-xs font-medium text-zinc-600">Comment</label>
                <textarea
                  rows={3}
                  value={editComment}
                  onChange={(e) => setEditComment(e.target.value)}
                  className="mt-1 w-full rounded-md border border-zinc-300 px-3 py-2 text-sm focus:border-zinc-500 focus:outline-none"
                />
              </div>

              <div className="mt-4 flex justify-end gap-2">
                <button
                  type="button"
                  onClick={onClose}
                  disabled={savingOrder}
                  className="rounded-md border border-zinc-200 px-3 py-2 text-sm text-zinc-700 hover:bg-white disabled:opacity-50"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={handleSaveOrder}
                  disabled={savingOrder}
                  className="rounded-md bg-zinc-900 px-3 py-2 text-sm font-medium text-white hover:bg-zinc-800 disabled:opacity-50"
                >
                  {savingOrder ? "Saving…" : "Create"}
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
                  {/* DETAILS / EDIT */}
                  {isEditingOrder ? (
                    <div className="rounded-md border border-zinc-200 bg-zinc-50 p-4">
                      <div className="grid grid-cols-2 gap-4">
                        {/* Company */}
                        <div>
                          <label className="block text-xs font-medium text-zinc-600 mb-1">
                            Company
                          </label>
                          <SearchableSelect
                            options={companies.map((c) => ({ id: c.id, label: c.name }))}
                            value={editCompanyId}
                            onChange={(val) => handleCompanyChange(val || null)}
                            disabled={loadingCompanies}
                            isLoading={loadingCompanies}
                            placeholder="Select company…"
                          />
                        </div>

                        {/* Client */}
                        <div>
                          <label className="block text-xs font-medium text-zinc-600 mb-1">
                            Client
                          </label>
                          <SearchableSelect
                            options={contacts.map((c) => ({
                              id: c.id,
                              label: `${c.firstName} ${c.lastName} — ${c.phone}${!editCompanyId && c.companyId ? " (Has Company)" : ""
                                }`,
                            }))}
                            value={editClientId}
                            onChange={(val) => handleClientChange(val || null)}
                            disabled={loadingContacts}
                            isLoading={loadingContacts}
                            placeholder="Select client…"
                          />
                        </div>

                        {/* Delivery */}
                        <div>
                          <label className="block text-xs font-medium text-zinc-600">Delivery</label>
                          <select
                            value={editDeliveryMethod}
                            onChange={(e) => setEditDeliveryMethod(e.target.value)}
                            className="mt-1 w-full rounded-md border border-zinc-300 px-3 py-2 text-sm focus:border-zinc-500 focus:outline-none"
                          >
                            <option value="PICKUP">Pickup</option>
                            <option value="NOVA_POSHTA">Nova Poshta</option>
                          </select>
                        </div>

                        {/* Discount */}
                        <div>
                          <label className="block text-xs font-medium text-zinc-600">Discount</label>
                          <input
                            type="number"
                            min={0}
                            value={editDiscount}
                            onChange={(e) => setEditDiscount(Math.max(0, Number(e.target.value)))}
                            className="mt-1 w-full rounded-md border border-zinc-300 px-3 py-2 text-sm focus:border-zinc-500 focus:outline-none"
                          />
                        </div>

                        {/* Status */}
                        <div>
                          <label className="block text-xs font-medium text-zinc-600">Status</label>
                          <div className="mt-1 px-3 py-2 text-sm text-zinc-600">{order.status}</div>
                        </div>
                      </div>

                      {/* Comment */}
                      <div className="mt-4">
                        <label className="block text-xs font-medium text-zinc-600">Comment</label>
                        <textarea
                          rows={3}
                          value={editComment}
                          onChange={(e) => setEditComment(e.target.value)}
                          className="mt-1 w-full rounded-md border border-zinc-300 px-3 py-2 text-sm focus:border-zinc-500 focus:outline-none"
                        />
                      </div>

                      <div className="mt-4 flex justify-end gap-2">
                        <button
                          type="button"
                          onClick={() => setIsEditingOrder(false)}
                          disabled={savingOrder}
                          className="rounded-md border border-zinc-200 px-3 py-2 text-sm text-zinc-700 hover:bg-white disabled:opacity-50"
                        >
                          Cancel
                        </button>
                        <button
                          type="button"
                          onClick={handleSaveOrder}
                          disabled={savingOrder}
                          className="rounded-md bg-zinc-900 px-3 py-2 text-sm font-medium text-white hover:bg-zinc-800 disabled:opacity-50"
                        >
                          {savingOrder ? "Saving…" : "Save"}
                        </button>
                      </div>
                    </div>
                  ) : (
                    <div className="rounded-md border border-zinc-200 bg-white p-4">
                      <div className="grid grid-cols-2 gap-4 text-sm">
                        <div>
                          <div className="text-xs text-zinc-500">Company</div>
                          {order.company ? (
                            <button
                              type="button"
                              onClick={() => onOpenCompany?.(order.company!.id)}
                              className="mt-1 text-left font-medium text-zinc-900 hover:underline"
                            >
                              {order.company.name}
                            </button>
                          ) : (
                            <div className="mt-1 text-zinc-600">—</div>
                          )}
                        </div>

                        <div>
                          <div className="text-xs text-zinc-500">Client</div>
                          {order.client ? (
                            <button
                              type="button"
                              onClick={() => onOpenContact?.(order.client!.id)}
                              className="mt-1 text-left font-medium text-zinc-900 hover:underline"
                            >
                              {order.client.firstName} {order.client.lastName} — {order.client.phone}
                            </button>
                          ) : (
                            <div className="mt-1 text-zinc-600">—</div>
                          )}
                        </div>

                        <div>
                          <div className="text-xs text-zinc-500">Delivery</div>
                          <div className="mt-1 font-medium text-zinc-900">
                            {order.deliveryMethod ?? "—"}
                          </div>
                        </div>
                        <div>
                          <div className="text-xs text-zinc-500">TTN</div>
                          <div className="mt-1 font-medium text-zinc-900">
                            {ttnNumber ? `№ ${ttnNumber}` : "—"}
                          </div>
                        </div>

                        <div className="col-span-2">
                          <div className="text-xs text-zinc-500">NP status</div>
                          <div className="mt-1 text-zinc-700">
                            {ttnStatusLabel ?? "—"}
                          </div>
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
                          <div className="mt-1 text-zinc-700">{order.discountAmount.toFixed(2)}</div>
                        </div>

                        <div>
                          <div className="text-xs text-zinc-500">Total</div>
                          <div className="mt-1 font-semibold text-zinc-900">
                            {order.totalAmount.toFixed(2)} {order.currency}
                          </div>
                        </div>
                      </div>

                      {order.comment ? (
                        <div className="mt-4">
                          <div className="text-xs text-zinc-500">Comment</div>
                          <div className="mt-1 text-sm text-zinc-800 whitespace-pre-wrap">
                            {order.comment}
                          </div>
                        </div>
                      ) : null}
                    </div>
                  )}

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

                    {/* Add item form */}
                    {showAddForm && (
                      <div className="mt-4 rounded-md border border-zinc-200 bg-zinc-50 p-3">
                        <div className="grid grid-cols-12 gap-3">
                          <div className="col-span-12">
                            <label className="block text-xs font-medium text-zinc-600 mb-1">
                              Product
                            </label>
                            <input
                              value={search}
                              onChange={(e) => {
                                setSearch(e.target.value);
                                setSelectedProduct(null);
                              }}
                              placeholder="Search product…"
                              className="w-full rounded-md border border-zinc-300 px-3 py-2 text-sm"
                            />
                            {searchLoading && (
                              <div className="mt-2 text-xs text-zinc-500">Searching…</div>
                            )}
                            {searchError && (
                              <div className="mt-2 text-xs text-red-600">{searchError}</div>
                            )}
                            {!selectedProduct && searchResults.length > 0 && (
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
                            )}
                            {selectedProduct && (
                              <div className="mt-2 text-xs text-zinc-600">
                                Selected:{" "}
                                <span className="font-medium text-zinc-900">
                                  {selectedProduct.name}
                                </span>
                              </div>
                            )}
                          </div>

                          <div className="col-span-6">
                            <label className="block text-xs font-medium text-zinc-600 mb-1">
                              Qty
                            </label>
                            <input
                              type="number"
                              min={1}
                              value={qty}
                              onChange={(e) => setQty(Math.max(1, Number(e.target.value)))}
                              className="w-full rounded-md border border-zinc-300 px-3 py-2 text-sm"
                            />
                          </div>

                          <div className="col-span-6">
                            <label className="block text-xs font-medium text-zinc-600 mb-1">
                              Price
                            </label>
                            <input
                              type="number"
                              min={0}
                              value={price}
                              onChange={(e) => setPrice(Math.max(0, Number(e.target.value)))}
                              className="w-full rounded-md border border-zinc-300 px-3 py-2 text-sm"
                            />
                          </div>
                        </div>

                        {submitError && <div className="mt-3 text-xs text-red-600">{submitError}</div>}

                        <div className="mt-3 flex justify-end">
                          <button
                            type="button"
                            disabled={!selectedProduct || submittingItem}
                            onClick={handleAddItemSubmit}
                            className="rounded-md bg-zinc-900 px-3 py-2 text-sm font-medium text-white hover:bg-zinc-800 disabled:opacity-50"
                          >
                            {submittingItem ? "Adding…" : "Add"}
                          </button>
                        </div>
                      </div>
                    )}

                    {/* items list */}
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
                                  {it.product?.sku ? (
                                    <div className="text-xs text-zinc-500">{it.product.sku}</div>
                                  ) : null}
                                </td>
                                <td className="px-3 py-2 text-right text-zinc-700">{it.qty}</td>
                                <td className="px-3 py-2 text-right text-zinc-700">{it.price.toFixed(2)}</td>
                                <td className="px-3 py-2 text-right font-medium text-zinc-900">
                                  {it.lineTotal.toFixed(2)}
                                </td>
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
                              <div className="text-xs text-zinc-500 whitespace-nowrap">
                                {formatDt(t.occurredAt)}
                              </div>
                            </div>
                            <div className="mt-2 text-sm text-zinc-800 whitespace-pre-wrap">{t.body}</div>
                            <div className="mt-2 text-xs text-zinc-500">by {t.createdBy}</div>
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
              // ✅ ВАЖНО: backend TTN требует order.contactId
              // если contactId ещё не заполнен — используем clientId как fallback (временно)
              contactId={(order as any).contactId ?? order.clientId ?? ""}
              onCreated={async (res) => {
                console.log("TTN created:", res);

                // ✅ закрываем модалку
                setShowTtnModal(false);

                // ✅ подтягиваем изменения (deliveryData.novaPoshta.ttn.number + статус)
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

"use client";

import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { EntityModalShell } from "@/components/modals/EntityModalShell";
import { EntitySection } from "@/components/sections/EntitySection";
import { SearchableSelectLite, type Option } from "@/components/inputs/SearchableSelectLite";
import { apiHttp } from "@/lib/api/client";
import { OrderPaymentBlock } from "./OrderPaymentBlock";
import { OrderTimeline } from "./OrderTimeline";
import { TtnModal } from "./TtnModal";
import { EntityTasksList } from "@/components/EntityTasksList";

// =====================
// Small local UI helpers
// =====================

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
    stock?: number;
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
  paymentType?: string | null;
  documentsRequested?: boolean | null;
  paidAmount?: number;
  debtAmount?: number;

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
  stock?: number;
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
  /** Role from parent (e.g. from /auth/me on page). When set, used for admin actions and internal fetch is skipped. */
  userRole?: string | null;
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
  { key: "CONTROL_PAYMENT", label: "Payment", color: "amber" },
  { key: "SUCCESS", label: "Success", color: "emerald" },
  { key: "RETURNING", label: "Returning", color: "red" },
  { key: "CANCELED", label: "Canceled", color: "red" },
];

function stepIndex(status: string) {
  const idx = ORDER_STEPS.findIndex((s) => s.key === status);
  return idx >= 0 ? idx : 0;
}

function Stepper({
  status,
  onStepClick,
  disabled,
  hasPayment,
}: {
  status: string;
  onStepClick?: (stepKey: string) => void;
  disabled?: boolean;
  /** When true, Payment step is shown green (paid). */
  hasPayment?: boolean;
}) {
  const activeIdx = stepIndex(status);

  const isCanceled = status === "CANCELED";
  const isReturning = status === "RETURNING";

  const colorClasses = (c: StepDef["color"], stepKey?: string) => {
    const usePaymentGreen = stepKey === "CONTROL_PAYMENT" && hasPayment;
    if (usePaymentGreen) {
      return {
        on: "bg-emerald-600 text-white border-emerald-600",
        off: "bg-zinc-100 text-zinc-600 border-zinc-200",
      };
    }
    switch (c) {
      case "blue":
        return {
          on: "bg-blue-600 text-white border-blue-600",
          off: "bg-zinc-100 text-zinc-600 border-zinc-200",
        };
      case "amber":
        return {
          on: "bg-amber-500 text-white border-amber-500",
          off: "bg-zinc-100 text-zinc-600 border-zinc-200",
        };
      case "emerald":
        return {
          on: "bg-emerald-600 text-white border-emerald-600",
          off: "bg-zinc-100 text-zinc-600 border-zinc-200",
        };
      case "red":
        return {
          on: "bg-red-600 text-white border-red-600",
          off: "bg-zinc-100 text-zinc-600 border-zinc-200",
        };
      default:
        return {
          on: "bg-zinc-900 text-white border-zinc-900",
          off: "bg-zinc-100 text-zinc-600 border-zinc-200",
        };
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
          const cls = colorClasses(s.color, s.key);
          const canClick = onStepClick && !disabled;
          const showOn = s.key === "CONTROL_PAYMENT" && hasPayment ? true : done;
          const badge = <Badge className={showOn ? cls.on : cls.off}>{s.label}</Badge>;
          return canClick ? (
            <button
              key={s.key}
              type="button"
              onClick={() => onStepClick(s.key)}
              className="rounded focus:outline-none focus:ring-2 focus:ring-zinc-400"
            >
              {badge}
            </button>
          ) : (
            <span key={s.key}>{badge}</span>
          );
        })}
      </div>
    </div>
  );
}

// =====================
// Main
// =====================

type EditingField = null | "company" | "client" | "paymentType" | "documents" | "delivery" | "discount" | "comment";

export function OrderModal({
  apiBaseUrl,
  orderId,
  onClose,
  onSaved,
  prefill,
  onOpenCompany,
  onOpenContact,
  userRole: userRoleProp,
}: OrderModalProps) {
  const isCreate = orderId === null;

  const [order, setOrder] = useState<OrderDetails | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [editing, setEditing] = useState<EditingField>(null);
  const [userRole, setUserRole] = useState<string | null>(null);

  const [companies, setCompanies] = useState<CompanyOption[]>([]);
  const [contacts, setContacts] = useState<ContactOption[]>([]);
  const [loadingCompanies, setLoadingCompanies] = useState(false);
  const [loadingContacts, setLoadingContacts] = useState(false);

  // local editable values
  const [companyId, setCompanyId] = useState<string | null>(null);
  const [clientId, setClientId] = useState<string | null>(null);
  const [deliveryMethod, setDeliveryMethod] = useState<string>("PICKUP");
  const [paymentType, setPaymentType] = useState<string | null>(null);
  const [documentsRequested, setDocumentsRequested] = useState<boolean | null>(null);
  const [discountAmount, setDiscountAmount] = useState<number>(0);
  const [comment, setComment] = useState<string>("");

  // Add Item
  const [showAddForm, setShowAddForm] = useState(false);
  const searchInputRef = useRef<HTMLInputElement>(null);
  const qtyInputRef = useRef<HTMLInputElement>(null);
  const [search, setSearch] = useState("");
  const [searchResults, setSearchResults] = useState<ProductSearchItem[]>([]);
  const [searchLoading, setSearchLoading] = useState(false);
  const [searchError, setSearchError] = useState<string | null>(null);
  const [selectedProduct, setSelectedProduct] = useState<ProductSearchItem | null>(null);
  const [qty, setQty] = useState(1);
  const [price, setPrice] = useState(0);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [submittingItem, setSubmittingItem] = useState(false);
  const [editingItem, setEditingItem] = useState<{
    itemId: string;
    field: "qty" | "price";
    value: string;
  } | null>(null);

  // Timeline
  const [timeline, setTimeline] = useState<TimelineItem[]>([]);
  const [timelineLoading, setTimelineLoading] = useState(false);
  const [timelineError, setTimelineError] = useState<string | null>(null);

  // TTN
  const [showTtnModal, setShowTtnModal] = useState(false);

  const [statusUpdating, setStatusUpdating] = useState(false);
  const [leftTab, setLeftTab] = useState<"main" | "items" | "activity" | "tasks">("main");

  const canClose = !saving && !submittingItem && !statusUpdating && !deleting;

  const effectiveRole = userRoleProp !== undefined ? userRoleProp : userRole;
  const isAdmin = effectiveRole != null && String(effectiveRole).trim().toUpperCase() === "ADMIN";

  useEffect(() => {
    // #region agent log
    if (typeof console !== "undefined" && console.debug) {
      console.debug("[OrderModal delete condition]", { effectiveRole, hasOrder: !!order, isCreate, isAdmin, showDelete: !!(!isCreate && order && isAdmin) });
    }
    fetch('http://127.0.0.1:7242/ingest/6d5146b2-d2ee-43a9-ac82-5385935623c0',{method:'POST',headers:{'Content-Type':'application/json','X-Debug-Session-Id':'d4138d'},body:JSON.stringify({sessionId:'d4138d',location:'OrderModal.tsx:headerActions',message:'delete button condition',data:{effectiveRole,hasOrder:!!order,isCreate,isAdmin,showDelete:!!(!isCreate&&order&&isAdmin)},timestamp:Date.now(),hypothesisId:'H3-H5'})}).catch(()=>{});
    // #endregion
  }, [effectiveRole, order, isCreate, isAdmin]);

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
      setPaymentType(data.paymentType ?? null);
      setDocumentsRequested(data.documentsRequested ?? null);
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

  const setOrderStatus = useCallback(
    async (toStatus: string) => {
      if (!orderId) return;
      setStatusUpdating(true);
      try {
        const r = await fetch(`${apiBaseUrl}/orders/${orderId}/status`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ toStatus }),
          credentials: "include",
        });
        if (!r.ok) throw new Error(`Failed to update status (${r.status})`);
        await refreshOrder();
        onSaved?.();
      } finally {
        setStatusUpdating(false);
      }
    },
    [apiBaseUrl, orderId, refreshOrder, onSaved],
  );

  // init
  useEffect(() => {
    setError(null);
    setTimelineError(null);
    setEditing(null);
    setEditingItem(null);
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
      setPaymentType(null);
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

  useEffect(() => {
    if (userRoleProp !== undefined) return;
    apiHttp
      .get<{ user?: { role?: string } }>("/auth/me")
      .then((res) => {
        const role = res.data?.user?.role ?? null;
        // #region agent log
        if (typeof console !== "undefined" && console.debug) {
          console.debug("[OrderModal auth/me]", { role, rawUser: res.data?.user });
        }
        fetch('http://127.0.0.1:7242/ingest/6d5146b2-d2ee-43a9-ac82-5385935623c0',{method:'POST',headers:{'Content-Type':'application/json','X-Debug-Session-Id':'d4138d'},body:JSON.stringify({sessionId:'d4138d',location:'OrderModal.tsx:auth/me',message:'auth/me response',data:{role,rawUser:res.data?.user,roleType:typeof role},timestamp:Date.now(),hypothesisId:'H1-H2'})}).catch(()=>{});
        // #endregion
        setUserRole(role);
      })
      .catch((err) => {
        // #region agent log
        if (typeof console !== "undefined" && console.debug) {
          console.debug("[OrderModal auth/me failed]", err?.message, (err as any)?.response?.status);
        }
        fetch('http://127.0.0.1:7242/ingest/6d5146b2-d2ee-43a9-ac82-5385935623c0',{method:'POST',headers:{'Content-Type':'application/json','X-Debug-Session-Id':'d4138d'},body:JSON.stringify({sessionId:'d4138d',location:'OrderModal.tsx:auth/me',message:'auth/me failed',data:{errMsg:err?.message,status:(err as any)?.response?.status},timestamp:Date.now(),hypothesisId:'H1'})}).catch(()=>{});
        // #endregion
        setUserRole(null);
      });
  }, [userRoleProp]);

  // ESC
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return;
      if (editingItem) {
        setEditingItem(null);
        return;
      }
      if (editing) {
        setEditing(null);
        return;
      }
      if (canClose) onClose();
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [editing, editingItem, canClose, onClose]);

  const patchOrderItem = useCallback(
    async (itemId: string, payload: { qty?: number; price?: number }) => {
      if (!orderId) return;
      setSaving(true);
      try {
        const r = await fetch(`${apiBaseUrl}/orders/${orderId}/items/${itemId}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
          credentials: "include",
          cache: "no-store",
        });
        if (!r.ok) {
          const data = await r.json().catch(() => ({}));
          throw new Error(data?.message || `Failed to update item (${r.status})`);
        }
        setEditingItem(null);
        await Promise.all([refreshOrder(), refreshTimeline()]);
        onSaved?.();
      } catch (e) {
        alert(e instanceof Error ? e.message : "Failed to save");
        await refreshOrder();
      } finally {
        setSaving(false);
      }
    },
    [apiBaseUrl, onSaved, orderId, refreshOrder, refreshTimeline],
  );

  const deleteOrderItem = useCallback(
    async (itemId: string) => {
      if (!orderId) return;
      if (!confirm("Удалить позицию?")) return;
      setSaving(true);
      try {
        const r = await fetch(`${apiBaseUrl}/orders/${orderId}/items/${itemId}`, {
          method: "DELETE",
          credentials: "include",
          cache: "no-store",
        });
        if (!r.ok) throw new Error(`Failed to delete item (${r.status})`);
        setEditingItem(null);
        await Promise.all([refreshOrder(), refreshTimeline()]);
        onSaved?.();
      } catch (e) {
        alert(e instanceof Error ? e.message : "Failed to delete");
        await refreshOrder();
      } finally {
        setSaving(false);
      }
    },
    [apiBaseUrl, onSaved, orderId, refreshOrder, refreshTimeline],
  );

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
          documentsRequested: documentsRequested ?? undefined,
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
  }, [apiBaseUrl, clientId, comment, companyId, deliveryMethod, discountAmount, documentsRequested, onClose, onSaved]);

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
    requestAnimationFrame(() => qtyInputRef.current?.focus());
  };

  const addItemToOrder = useCallback(
    async (productId: string, itemQty: number, itemPrice: number) => {
      if (!orderId) return;
      const payload = { productId, qty: itemQty, price: itemPrice };
      const r = await fetch(`${apiBaseUrl}/orders/${orderId}/items`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
        credentials: "include",
        cache: "no-store",
      });
      if (!r.ok) throw new Error(`Failed to add item (${r.status})`);
      await Promise.all([refreshOrder(), refreshTimeline()]);
      onSaved?.();
    },
    [apiBaseUrl, orderId, refreshOrder, refreshTimeline, onSaved],
  );

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
      await addItemToOrder(selectedProduct.id, qty, price);
      // Add & add another: keep form open, reset only product/search, keep qty/price
      setSelectedProduct(null);
      setSearch("");
      setSearchResults([]);
      requestAnimationFrame(() => searchInputRef.current?.focus());
    } catch (e) {
      setSubmitError(e instanceof Error ? e.message : "Failed to add item");
    } finally {
      setSubmittingItem(false);
    }
  };

  const handleAddItemQuick = useCallback(
    async (p: ProductSearchItem) => {
      if (!orderId) return;
      setSubmittingItem(true);
      setSubmitError(null);
      try {
        await addItemToOrder(p.id, 1, p.basePrice);
        setSelectedProduct(null);
        setSearch("");
        setSearchResults([]);
        requestAnimationFrame(() => searchInputRef.current?.focus());
      } catch (e) {
        setSubmitError(e instanceof Error ? e.message : "Failed to add item");
      } finally {
        setSubmittingItem(false);
      }
    },
    [orderId, addItemToOrder],
  );

  const headerTitle = useMemo(() => {
    if (isCreate) return "New order";
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

  const deleteOrder = useCallback(async () => {
    if (!orderId || !order || !confirm("Удалить заказ? Это действие нельзя отменить.")) return;
    setDeleting(true);
    setError(null);
    try {
      const r = await fetch(`${apiBaseUrl}/orders/${orderId}`, {
        method: "DELETE",
        credentials: "include",
        cache: "no-store",
      });
      if (!r.ok) {
        const data = await r.json().catch(() => ({}));
        throw new Error(data?.message ?? `Failed to delete order (${r.status})`);
      }
      onSaved?.();
      onClose();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Не удалось удалить заказ");
    } finally {
      setDeleting(false);
    }
  }, [apiBaseUrl, orderId, order, onClose, onSaved]);

  const orderHeaderActions = (
    <>
      {!isCreate && order && isAdmin && (
        <button
          type="button"
          onClick={() => void deleteOrder()}
          disabled={deleting}
          className="rounded-md border border-red-200 bg-red-50 px-2 py-1 text-xs text-red-700 hover:bg-red-100 disabled:opacity-50"
        >
          {deleting ? "Удаление…" : "Удалить заказ"}
        </button>
      )}
    </>
  );

  const tabsUnderHeader =
    !isCreate && order ? (
      <div className="space-y-2">
        <Stepper
          status={order.status}
          onStepClick={setOrderStatus}
          disabled={statusUpdating}
          hasPayment={Number(order.paidAmount ?? 0) > 0}
        />
        <div className="flex gap-1 border-b border-zinc-200 pb-2">
          <button
            type="button"
            onClick={() => setLeftTab("main")}
            className={`rounded px-2 py-1 text-sm font-medium ${leftTab === "main" ? "bg-accent-gradient text-white" : "text-zinc-600 hover:bg-zinc-100"}`}
          >
            Main
          </button>
          <button
            type="button"
            onClick={() => setLeftTab("items")}
            className={`rounded px-2 py-1 text-sm font-medium ${leftTab === "items" ? "bg-accent-gradient text-white" : "text-zinc-600 hover:bg-zinc-100"}`}
          >
            Items
          </button>
          <button
            type="button"
            onClick={() => setLeftTab("activity")}
            className={`rounded px-2 py-1 text-sm font-medium ${leftTab === "activity" ? "bg-accent-gradient text-white" : "text-zinc-600 hover:bg-zinc-100"}`}
          >
            Activity
          </button>
          <button
            type="button"
            onClick={() => setLeftTab("tasks")}
            className={`rounded px-2 py-1 text-sm font-medium ${leftTab === "tasks" ? "bg-accent-gradient text-white" : "text-zinc-600 hover:bg-zinc-100"}`}
          >
            Tasks
          </button>
        </div>
      </div>
    ) : null;

  return (
    <>
      <EntityModalShell
        title={headerTitle}
        subtitle={!isCreate && order ? formatDt(order.createdAt) : undefined}
        headerActions={orderHeaderActions}
        tabsUnderHeader={tabsUnderHeader}
        left={(
          isCreate ? (
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
                  className="btn-primary"
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
            leftTab === "activity" ? (
              <EntitySection title="Activity">
                <OrderTimeline orderId={orderId!} />
              </EntitySection>
            ) : leftTab === "tasks" ? (
              <EntitySection title="Tasks">
                <EntityTasksList orderId={orderId!} />
              </EntitySection>
            ) : leftTab === "items" ? (
              <EntitySection title="Items">
                <div className="rounded-md border border-zinc-200 bg-white p-4">
                  <div className="flex items-center justify-between">
                    <h3 className="text-sm font-semibold text-zinc-900">Items</h3>
                    <button
                      type="button"
                      onClick={() => setShowAddForm((v) => !v)}
                      className="rounded-md border border-zinc-200 px-3 py-1 text-xs font-medium text-zinc-700 hover:bg-zinc-50"
                    >
                      {showAddForm ? "Done" : "+ Add item"}
                    </button>
                  </div>
                  {showAddForm ? (
                    <div className="mt-4 rounded-md border border-zinc-200 bg-zinc-50 p-3">
                      <div className="grid grid-cols-12 gap-3">
                        <div className="col-span-12">
                          <label className="block text-xs font-medium text-zinc-600 mb-1">Product</label>
                          <input
                            ref={searchInputRef}
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
                                  onDoubleClick={(e) => {
                                    e.preventDefault();
                                    void handleAddItemQuick(p);
                                  }}
                                  className="flex w-full items-center justify-between gap-2 px-3 py-2 text-left text-sm hover:bg-zinc-50"
                                >
                                  <span className="font-medium text-zinc-900">{p.name}</span>
                                  <span className="flex shrink-0 items-center gap-2 text-xs text-zinc-500">
                                    {p.sku}
                                    {p.stock !== undefined && (
                                      <span className="text-zinc-400">Ост.: {p.stock}</span>
                                    )}
                                  </span>
                                </button>
                              ))}
                            </div>
                          ) : null}
                          {selectedProduct ? (
                            <div className="mt-2 text-xs text-zinc-600">
                              Selected: <span className="font-medium text-zinc-900">{selectedProduct.name}</span>
                              {selectedProduct.stock !== undefined && (
                                <span className="ml-2 text-zinc-500">Остаток: {selectedProduct.stock}</span>
                              )}
                            </div>
                          ) : null}
                        </div>
                        <div className="col-span-6">
                          <label className="block text-xs font-medium text-zinc-600 mb-1">Qty</label>
                          <input
                            ref={qtyInputRef}
                            type="number"
                            min={1}
                            value={qty}
                            onChange={(e) => setQty(Math.max(1, Number(e.target.value)))}
                            onKeyDown={(e) => {
                              if (e.key === "Enter") {
                                e.preventDefault();
                                void handleAddItemSubmit();
                              }
                            }}
                            className="w-full rounded-md border border-zinc-300 px-3 py-2 text-sm"
                          />
                        </div>
                        <div className="col-span-6">
                          <label className="block text-xs font-medium text-zinc-600 mb-1">Price</label>
                          <div className="flex items-center gap-3">
                            <input
                              type="number"
                              min={0}
                              value={price}
                              onChange={(e) => setPrice(Math.max(0, Number(e.target.value)))}
                              onKeyDown={(e) => {
                                if (e.key === "Enter") {
                                  e.preventDefault();
                                  void handleAddItemSubmit();
                                }
                              }}
                              className="w-full rounded-md border border-zinc-300 px-3 py-2 text-sm"
                            />
                            {selectedProduct && selectedProduct.stock !== undefined ? (
                              <span className="shrink-0 text-xs text-zinc-500">
                                Остаток: {selectedProduct.stock}
                              </span>
                            ) : null}
                          </div>
                        </div>
                      </div>
                      {submitError ? <div className="mt-3 text-xs text-red-600">{submitError}</div> : null}
                      <div className="mt-3 flex justify-end">
                        <button
                          type="button"
                          disabled={!selectedProduct || submittingItem}
                          onClick={() => void handleAddItemSubmit()}
                          className="btn-primary"
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
                          <th className="px-3 py-2 text-right">Остаток</th>
                          <th className="px-3 py-2 text-right">Total</th>
                          <th className="w-10 px-2 py-2"></th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-zinc-100">
                        {order.items.length === 0 ? (
                          <tr>
                            <td className="px-3 py-3 text-zinc-500" colSpan={6}>
                              No items
                            </td>
                          </tr>
                        ) : (
                          order.items.map((it) => (
                            <tr key={it.id} className="hover:bg-zinc-50/50">
                              <td className="px-3 py-2">
                                <div className="font-medium text-zinc-900">
                                  {it.product?.name || it.productName || it.productId}
                                </div>
                                {it.product?.sku ? (
                                  <div className="text-xs text-zinc-500">{it.product.sku}</div>
                                ) : null}
                              </td>
                              <td className="px-3 py-2 text-right">
                                {editingItem?.itemId === it.id && editingItem?.field === "qty" ? (
                                  <input
                                    type="number"
                                    min={1}
                                    value={editingItem.value}
                                    onChange={(e) =>
                                      setEditingItem((prev) =>
                                        prev ? { ...prev, value: e.target.value } : null,
                                      )
                                    }
                                    onBlur={async () => {
                                      const val = Math.max(1, Number(editingItem?.value) || 1);
                                      await patchOrderItem(it.id, { qty: val });
                                    }}
                                    onKeyDown={(e) => {
                                      if (e.key === "Enter") {
                                        e.preventDefault();
                                        const val = Math.max(1, Number(editingItem?.value) || 1);
                                        void patchOrderItem(it.id, { qty: val });
                                      }
                                      if (e.key === "Escape") setEditingItem(null);
                                    }}
                                    autoFocus
                                    className="w-16 rounded border border-zinc-300 px-2 py-1 text-right text-sm"
                                  />
                                ) : (
                                  <button
                                    type="button"
                                    onClick={() =>
                                      setEditingItem({
                                        itemId: it.id,
                                        field: "qty",
                                        value: String(it.qty),
                                      })
                                    }
                                    className="text-zinc-700 hover:underline"
                                  >
                                    {it.qty}
                                  </button>
                                )}
                              </td>
                              <td className="px-3 py-2 text-right">
                                {editingItem?.itemId === it.id && editingItem?.field === "price" ? (
                                  <input
                                    type="number"
                                    min={0}
                                    step={0.01}
                                    value={editingItem.value}
                                    onChange={(e) =>
                                      setEditingItem((prev) =>
                                        prev ? { ...prev, value: e.target.value } : null,
                                      )
                                    }
                                    onBlur={async () => {
                                      const val = Math.max(0, Number(editingItem?.value) || 0);
                                      await patchOrderItem(it.id, { price: val });
                                    }}
                                    onKeyDown={(e) => {
                                      if (e.key === "Enter") {
                                        e.preventDefault();
                                        const val = Math.max(0, Number(editingItem?.value) || 0);
                                        void patchOrderItem(it.id, { price: val });
                                      }
                                      if (e.key === "Escape") setEditingItem(null);
                                    }}
                                    autoFocus
                                    className="w-20 rounded border border-zinc-300 px-2 py-1 text-right text-sm"
                                  />
                                ) : (
                                  <button
                                    type="button"
                                    onClick={() =>
                                      setEditingItem({
                                        itemId: it.id,
                                        field: "price",
                                        value: String(it.price),
                                      })
                                    }
                                    className="text-zinc-700 hover:underline"
                                  >
                                    {it.price.toFixed(2)}
                                  </button>
                                )}
                              </td>
                              <td className="px-3 py-2 text-right text-zinc-600">
                                {it.product?.stock !== undefined ? it.product.stock : <span className="font-normal text-zinc-400">Не указано</span>}
                              </td>
                              <td className="px-3 py-2 text-right font-medium text-zinc-900">
                                {it.lineTotal.toFixed(2)}
                              </td>
                              <td className="px-2 py-2">
                                <button
                                  type="button"
                                  onClick={() => void deleteOrderItem(it.id)}
                                  disabled={saving}
                                  className="rounded p-1.5 text-zinc-500 hover:bg-red-50 hover:text-red-600 disabled:opacity-50"
                                  title="Delete"
                                  aria-label="Delete"
                                >
                                  <svg
                                    className="h-4 w-4"
                                    fill="none"
                                    stroke="currentColor"
                                    viewBox="0 0 24 24"
                                  >
                                    <path
                                      strokeLinecap="round"
                                      strokeLinejoin="round"
                                      strokeWidth={2}
                                      d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"
                                    />
                                  </svg>
                                </button>
                              </td>
                            </tr>
                          ))
                        )}
                      </tbody>
                    </table>
                  </div>
                </div>
              </EntitySection>
            ) : (
              <>
              <EntitySection title="About order">
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
                            {order.company ? order.company.name : <span className="font-normal text-zinc-400">Нажмите, чтобы выбрать компанию...</span>}
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
                                  // Optimistically update order.client so the button shows the selected client
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
                              : <span className="font-normal text-zinc-400">Нажмите, чтобы выбрать клиента...</span>}
                          </button>
                        )}
                      </div>

                      <div>
                        <div className="text-xs text-zinc-500">Payment type</div>
                        {editing === "paymentType" ? (
                          <div className="mt-1">
                            <select
                              value={paymentType ?? ""}
                              onChange={async (e) => {
                                const v = e.target.value || null;
                                setPaymentType(v);
                                try {
                                  await patchOrder({ paymentType: v });
                                  if (order) {
                                    setOrder((prev) => (prev ? { ...prev, paymentType: v } : prev));
                                  }
                                } finally {
                                  setEditing(null);
                                }
                              }}
                              className="w-full rounded-md border border-zinc-300 px-3 py-2 text-sm focus:border-zinc-500 focus:outline-none"
                              disabled={saving}
                            >
                              <option value="">Выберите...</option>
                              <option value="PREPAYMENT">Предоплата</option>
                              <option value="DEFERRED">Отсрочка</option>
                            </select>
                          </div>
                        ) : (
                          <button
                            type="button"
                            onClick={() => {
                              setPaymentType(order.paymentType ?? null);
                              setEditing("paymentType");
                            }}
                            className="mt-1 font-medium text-zinc-900 hover:underline"
                          >
                            {order.paymentType === "PREPAYMENT"
                              ? "Предоплата"
                              : order.paymentType === "DEFERRED"
                                ? "Отсрочка"
                                : <span className="font-normal text-zinc-400">Выберите тип оплаты...</span>}
                          </button>
                        )}
                      </div>

                      <div>
                        <div className="text-xs text-zinc-500">Документы</div>
                        {editing === "documents" ? (
                          <div className="mt-1">
                            <select
                              value={documentsRequested === true ? "yes" : documentsRequested === false ? "no" : ""}
                              onChange={async (e) => {
                                const raw = e.target.value;
                                const v = raw === "yes" ? true : raw === "no" ? false : null;
                                setDocumentsRequested(v);
                                try {
                                  await patchOrder({ documentsRequested: v });
                                  if (order) {
                                    setOrder((prev) => (prev ? { ...prev, documentsRequested: v } : prev));
                                  }
                                } finally {
                                  setEditing(null);
                                }
                              }}
                              className="w-full rounded-md border border-zinc-300 px-3 py-2 text-sm focus:border-zinc-500 focus:outline-none"
                              disabled={saving}
                            >
                              <option value="">Выберите...</option>
                              <option value="yes">Да</option>
                              <option value="no">Нет</option>
                            </select>
                          </div>
                        ) : (
                          <button
                            type="button"
                            onClick={() => {
                              setDocumentsRequested(order.documentsRequested ?? null);
                              setEditing("documents");
                            }}
                            className="mt-1 font-medium text-zinc-900 hover:underline"
                          >
                            {order.documentsRequested === true
                              ? "Да"
                              : order.documentsRequested === false
                                ? "Нет"
                                : <span className="font-normal text-zinc-400">Выберите...</span>}
                          </button>
                        )}
                      </div>

                      <div>
                        <div className="text-xs text-zinc-500">Paid / Debt</div>
                        <div className="mt-1 text-zinc-700">
                          {order.currency ?? "UAH"} {Number(order.paidAmount ?? 0).toFixed(2)} /{" "}
                          {Number(order.debtAmount ?? 0).toFixed(2)}
                        </div>
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
                            {order.deliveryMethod ?? <span className="font-normal text-zinc-400">Выберите метод доставки...</span>}
                          </button>
                        )}
                      </div>

                      {order.deliveryMethod === "NOVA_POSHTA" ? (
                        <div>
                          <div className="text-xs text-zinc-500">TTN</div>
                          <div className="mt-1 flex items-center gap-2">
                            <span className="font-medium text-zinc-900">{ttnNumber ? `№ ${ttnNumber}` : <span className="font-normal text-zinc-400">Не указано</span>}</span>
                            {canShowCreateTtnButton ? (
                              <button
                                type="button"
                                onClick={() => setShowTtnModal(true)}
                                className="rounded p-1.5 text-emerald-600 hover:bg-emerald-50"
                                title="Create TTN (NP)"
                                aria-label="Create TTN"
                              >
                                <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
                                </svg>
                              </button>
                            ) : null}
                            {ttnNumber && orderId ? (
                              <button
                                type="button"
                                onClick={async () => {
                                  if (!confirm("Удалить ТТН из заказа?")) return;
                                  try {
                                    await apiHttp.delete(`orders/${orderId}/np/ttn`);
                                    await refreshOrder();
                                    onSaved?.();
                                  } catch {
                                    // ignore
                                  }
                                }}
                                className="rounded p-1.5 text-zinc-500 hover:bg-red-50 hover:text-red-600"
                                title="Delete TTN"
                                aria-label="Delete TTN"
                              >
                                <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                  <path
                                    strokeLinecap="round"
                                    strokeLinejoin="round"
                                    strokeWidth={2}
                                    d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"
                                  />
                                </svg>
                              </button>
                            ) : null}
                          </div>
                        </div>
                      ) : null}

                      {order.deliveryMethod === "NOVA_POSHTA" ? (
                        <div className="col-span-2">
                          <div className="text-xs text-zinc-500">NP status</div>
                          <div className="mt-1 text-zinc-700">{ttnStatusLabel ?? <span className="font-normal text-zinc-400">Нет данных</span>}</div>
                        </div>
                      ) : null}

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
              </EntitySection>
              <EntitySection title="Payment">
                <OrderPaymentBlock
                  orderId={orderId!}
                  apiBaseUrl={apiBaseUrl}
                  paidAmount={Number(order.paidAmount ?? 0)}
                  totalAmount={Number(order.totalAmount ?? 0)}
                  paymentStatus={(order as { paymentStatus?: string }).paymentStatus}
                  currency={order.currency}
                  onSaved={async () => {
                    await refreshOrder();
                    onSaved?.();
                  }}
                />
              </EntitySection>
            </>
            )
          )
        )}
        right={
          !isCreate && order && orderId && leftTab === "main" ? (
            <EntitySection title="Activity">
              <OrderTimeline orderId={orderId} />
            </EntitySection>
          ) : null
        }
        canClose={canClose}
        onClose={onClose}
      />
      {!isCreate && orderId && order ? (
            <TtnModal
              apiBaseUrl={apiBaseUrl}
              open={showTtnModal}
              onClose={() => setShowTtnModal(false)}
              orderId={orderId}
              contactId={(order as any).contactId ?? order.clientId ?? ""}
              defaultPerson={
                order.client
                  ? {
                      firstName: order.client.firstName ?? "",
                      lastName: order.client.lastName ?? "",
                      phone: order.client.phone ?? "",
                    }
                  : undefined
              }
              onCreated={async () => {
                setShowTtnModal(false);
                await Promise.all([refreshOrder(), refreshTimeline()]);
                onSaved?.();
              }}
            />
          ) : null}
      </>
  );
}

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
  deliveryMethod: string | null;
  paymentMethod?: string | null;

  discountAmount: number;
  totalAmount: number;
  paidAmount?: number;
  debtAmount?: number;
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
  position?: string | null;
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

type EditFieldKey =
  | null
  | "company"
  | "client"
  | "deliveryMethod"
  | "paymentMethod"
  | "discount"
  | "comment";

function safeJson<T = any>(text: string): T | null {
  try {
    return text ? (JSON.parse(text) as T) : null;
  } catch {
    return null;
  }
}

function looksLikePhone(input: string) {
  const digits = input.replace(/\D/g, "");
  return digits.length >= 8;
}

function formatDt(iso: string) {
  try {
    return new Date(iso).toLocaleString();
  } catch {
    return iso;
  }
}

function StatusStepper({ status }: { status: string }) {
  const flow = [
    "NEW",
    "IN_WORK",
    "READY_TO_SHIP",
    "SHIPPED",
    "CONTROL_PAYMENT",
    "SUCCESS",
  ] as const;

  const labels: Record<string, string> = {
    NEW: "New",
    IN_WORK: "In work",
    READY_TO_SHIP: "Ready",
    SHIPPED: "Shipped",
    CONTROL_PAYMENT: "Control payment",
    SUCCESS: "Success",
    RETURNING: "Returning",
    CANCELED: "Canceled",
  };

  const colors: Record<string, string> = {
    NEW: "bg-blue-600",
    IN_WORK: "bg-indigo-600",
    READY_TO_SHIP: "bg-amber-600",
    SHIPPED: "bg-sky-600",
    CONTROL_PAYMENT: "bg-violet-600",
    SUCCESS: "bg-emerald-600",
    RETURNING: "bg-orange-600",
    CANCELED: "bg-red-600",
  };

  const idx = flow.indexOf(status as any);
  const inFlow = idx !== -1;

  return (
    <div className="border-b border-zinc-200 px-6 py-3">
      <div className="flex flex-wrap gap-2">
        {flow.map((s, i) => {
          const done = inFlow && i <= idx;
          const isCurrent = status === s;
          return (
            <div
              key={s}
              className={`inline-flex items-center gap-2 rounded-full px-3 py-1 text-xs font-medium border ${
                done
                  ? `${colors[s]} text-white border-transparent`
                  : "bg-zinc-100 text-zinc-600 border-zinc-200"
              } ${isCurrent ? "ring-2 ring-zinc-900/10" : ""}`}
              title={labels[s] ?? s}
            >
              <span className={`h-2 w-2 rounded-full ${done ? "bg-white/90" : "bg-zinc-400"}`} />
              {labels[s] ?? s}
            </div>
          );
        })}

        {!inFlow ? (
          <div
            className={`inline-flex items-center gap-2 rounded-full px-3 py-1 text-xs font-medium text-white ${
              colors[status] ?? "bg-zinc-600"
            }`}
            title={labels[status] ?? status}
          >
            <span className="h-2 w-2 rounded-full bg-white/90" />
            {labels[status] ?? status}
          </div>
        ) : null}
      </div>
    </div>
  );
}

function CreateContactModal(props: {
  open: boolean;
  companies: CompanyOption[];
  defaultCompanyId: string | null;
  query: string;
  onClose: () => void;
  onCreated: (c: ContactOption) => void;
  apiBaseUrl: string;
}) {
  const { open, companies, defaultCompanyId, query, onClose, onCreated, apiBaseUrl } = props;

  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const [attachCompany, setAttachCompany] = useState(true);
  const [companyId, setCompanyId] = useState<string | null>(defaultCompanyId);

  const [phone, setPhone] = useState("");
  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [role, setRole] = useState<"DOCTOR" | "TECHNICIAN">("DOCTOR");

  const [region, setRegion] = useState("");
  const [city, setCity] = useState("");

  const [showMore, setShowMore] = useState(false);
  const [email, setEmail] = useState("");
  const [jobTitle, setJobTitle] = useState("");

  useEffect(() => {
    if (!open) return;

    setErr(null);
    setSaving(false);

    const q = (query || "").trim();
    const isPhone = looksLikePhone(q);

    setAttachCompany(true);
    setCompanyId(defaultCompanyId);

    setPhone(isPhone ? q : "");

    if (!isPhone && q) {
      const parts = q.split(/\s+/).filter(Boolean);
      setFirstName(parts[0] ?? "");
      setLastName(parts.slice(1).join(" ") ?? "");
    } else {
      setFirstName("");
      setLastName("");
    }

    setRole("DOCTOR");
    setRegion("");
    setCity("");
    setShowMore(false);
    setEmail("");
    setJobTitle("");
  }, [open, query, defaultCompanyId]);

  const canClose = !saving;

  const submit = async () => {
    setErr(null);

    const p = phone.trim();
    const fn = firstName.trim();
    const ln = lastName.trim();

    if (!p) return setErr("Phone is required");
    if (!fn) return setErr("First name is required");
    if (!ln) return setErr("Last name is required");

    // временно кладем область/город/роль в position, чтобы не ломать схему.
    const roleLabel = role === "DOCTOR" ? "Doctor" : "Technician";
    const geo = [city.trim(), region.trim()].filter(Boolean).join(", ");
    const extra = jobTitle.trim();
    const position = [roleLabel, geo, extra].filter(Boolean).join("; ");

    setSaving(true);
    try {
      const r = await fetch(`${apiBaseUrl}/contacts`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          companyId: attachCompany ? companyId : null,
          firstName: fn,
          lastName: ln,
          phone: p,
          email: email.trim() || null,
          position: position || null,
        }),
        cache: "no-store",
      });

      const text = await r.text();
      if (!r.ok) {
        const j = safeJson<any>(text);
        throw new Error(j?.message || text || `Failed (${r.status})`);
      }

      const created = safeJson<any>(text);
      if (!created?.id) throw new Error("Contact created but response is empty");

      onCreated({
        id: created.id,
        firstName: created.firstName,
        lastName: created.lastName,
        phone: created.phone,
        companyId: created.companyId ?? null,
        position: created.position ?? null,
      });
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Failed to create contact");
    } finally {
      setSaving(false);
    }
  };

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-[60] flex items-center justify-center bg-black/40 px-4"
      role="presentation"
      onClick={() => canClose && onClose()}
    >
      <div
        className="w-full max-w-xl overflow-hidden rounded-xl bg-white shadow-xl"
        onClick={(e) => e.stopPropagation()}
        role="presentation"
      >
        <div className="flex items-center justify-between border-b border-zinc-200 px-5 py-4">
          <div>
            <div className="text-base font-semibold text-zinc-900">Create contact</div>
            <div className="mt-0.5 text-sm text-zinc-500">Minimum required fields</div>
          </div>
          <button
            type="button"
            className="rounded-md border border-zinc-200 px-2 py-1 text-sm text-zinc-700 hover:bg-zinc-50"
            onClick={() => canClose && onClose()}
          >
            ✕
          </button>
        </div>

        <div className="max-h-[80vh] overflow-auto p-5">
          {err ? (
            <div className="mb-4 rounded-md border border-red-100 bg-red-50 p-3 text-sm text-red-700">
              {err}
            </div>
          ) : null}

          <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
            <div>
              <label className="block text-sm font-medium text-zinc-700">Phone *</label>
              <input
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
                className="mt-1 w-full rounded-md border border-zinc-200 px-3 py-2 text-sm outline-none focus:border-zinc-400"
                placeholder="+380…"
                disabled={saving}
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-zinc-700">Role *</label>
              <select
                value={role}
                onChange={(e) => setRole(e.target.value as any)}
                className="mt-1 w-full rounded-md border border-zinc-200 px-3 py-2 text-sm outline-none focus:border-zinc-400"
                disabled={saving}
              >
                <option value="DOCTOR">Doctor</option>
                <option value="TECHNICIAN">Technician</option>
              </select>
            </div>

            <div>
              <label className="block text-sm font-medium text-zinc-700">First name *</label>
              <input
                value={firstName}
                onChange={(e) => setFirstName(e.target.value)}
                className="mt-1 w-full rounded-md border border-zinc-200 px-3 py-2 text-sm outline-none focus:border-zinc-400"
                placeholder="Ivan"
                disabled={saving}
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-zinc-700">Last name *</label>
              <input
                value={lastName}
                onChange={(e) => setLastName(e.target.value)}
                className="mt-1 w-full rounded-md border border-zinc-200 px-3 py-2 text-sm outline-none focus:border-zinc-400"
                placeholder="Petrenko"
                disabled={saving}
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-zinc-700">Region</label>
              <input
                value={region}
                onChange={(e) => setRegion(e.target.value)}
                className="mt-1 w-full rounded-md border border-zinc-200 px-3 py-2 text-sm outline-none focus:border-zinc-400"
                placeholder="Kyivska"
                disabled={saving}
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-zinc-700">City</label>
              <input
                value={city}
                onChange={(e) => setCity(e.target.value)}
                className="mt-1 w-full rounded-md border border-zinc-200 px-3 py-2 text-sm outline-none focus:border-zinc-400"
                placeholder="Kyiv"
                disabled={saving}
              />
            </div>
          </div>

          <div className="mt-4 rounded-lg border border-zinc-200 bg-zinc-50 p-4">
            <label className="flex items-center gap-2 text-sm text-zinc-800">
              <input
                type="checkbox"
                checked={attachCompany}
                onChange={(e) => setAttachCompany(e.target.checked)}
                disabled={saving}
              />
              Attach to company
            </label>

            {attachCompany ? (
              <div className="mt-3">
                <label className="block text-sm font-medium text-zinc-700">Company</label>
                <SearchableSelect
                  options={companies.map((c) => ({ id: c.id, label: c.name }))}
                  value={companyId}
                  onChange={(val) => setCompanyId(val || null)}
                  disabled={saving}
                  placeholder="Select company…"
                />
                <div className="mt-2 text-xs text-zinc-500">
                  If you don’t have a company yet — uncheck and add later.
                </div>
              </div>
            ) : null}
          </div>

          <button
            type="button"
            onClick={() => setShowMore((v) => !v)}
            className="mt-4 text-sm font-medium text-zinc-700 hover:underline"
          >
            {showMore ? "Hide additional" : "Show additional"}
          </button>

          {showMore ? (
            <div className="mt-3 grid grid-cols-1 gap-4 md:grid-cols-2">
              <div>
                <label className="block text-sm font-medium text-zinc-700">Email</label>
                <input
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  className="mt-1 w-full rounded-md border border-zinc-200 px-3 py-2 text-sm outline-none focus:border-zinc-400"
                  placeholder="ivan@test.com"
                  disabled={saving}
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-zinc-700">Position</label>
                <input
                  value={jobTitle}
                  onChange={(e) => setJobTitle(e.target.value)}
                  className="mt-1 w-full rounded-md border border-zinc-200 px-3 py-2 text-sm outline-none focus:border-zinc-400"
                  placeholder="Chief doctor"
                  disabled={saving}
                />
              </div>
            </div>
          ) : null}

          <div className="mt-5 flex justify-end gap-2">
            <button
              type="button"
              onClick={() => canClose && onClose()}
              disabled={!canClose}
              className="rounded-md border border-zinc-200 px-3 py-2 text-sm text-zinc-700 hover:bg-white disabled:opacity-50"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={submit}
              disabled={saving}
              className="rounded-md bg-zinc-900 px-3 py-2 text-sm font-medium text-white hover:bg-zinc-800 disabled:opacity-50"
            >
              {saving ? "Creating…" : "Create"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

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

  // create form fields
  const [editCompanyId, setEditCompanyId] = useState<string | null>(null);
  const [editClientId, setEditClientId] = useState<string | null>(null);
  const [editDeliveryMethod, setEditDeliveryMethod] = useState<string>("PICKUP");
  const [editPaymentMethod, setEditPaymentMethod] = useState<string>("CASH");
  const [editComment, setEditComment] = useState("");
  const [editDiscount, setEditDiscount] = useState(0);
  const [savingOrder, setSavingOrder] = useState(false);

  // for inline edit (existing order)
  const [editingField, setEditingField] = useState<EditFieldKey>(null);
  const [fieldSaving, setFieldSaving] = useState<EditFieldKey>(null);

  const [companies, setCompanies] = useState<CompanyOption[]>([]);
  const [contacts, setContacts] = useState<ContactOption[]>([]);
  const [loadingCompanies, setLoadingCompanies] = useState(false);
  const [loadingContacts, setLoadingContacts] = useState(false);

  // Create contact
  const [createContactOpen, setCreateContactOpen] = useState(false);
  const [createContactQuery, setCreateContactQuery] = useState("");
  const [createContactDefaultCompanyId, setCreateContactDefaultCompanyId] = useState<string | null>(
    null,
  );
  const [createContactTarget, setCreateContactTarget] = useState<"create" | "edit">("create");

  // Add Item (only for existing orders)
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

  const [showTtnModal, setShowTtnModal] = useState(false);

  const canClose = !submittingItem && !savingOrder && !fieldSaving && !createContactOpen;

  const fetchCompanies = useCallback(async () => {
    setLoadingCompanies(true);
    try {
      const r = await fetch(`${apiBaseUrl}/companies?page=1&pageSize=200`, { cache: "no-store" });
      if (r.ok) {
        const data = await r.json().catch(() => ({ items: [] }));
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
        ? `${apiBaseUrl}/contacts?companyId=${companyId}&page=1&pageSize=200`
        : `${apiBaseUrl}/contacts?page=1&pageSize=200`;
      try {
        const r = await fetch(url, { cache: "no-store" });
        if (r.ok) {
          const data = await r.json().catch(() => ({ items: [] }));
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
      const text = await r.text();
      if (!r.ok) throw new Error(text || `Failed to load order (${r.status})`);
      const data = safeJson<OrderDetails>(text);
      if (!data) throw new Error("Failed to parse order");
      setOrder(data);

      // sync inline draft values
      setEditCompanyId(data.companyId ?? null);
      setEditClientId(data.clientId ?? null);
      setEditDeliveryMethod(data.deliveryMethod ?? "PICKUP");
      setEditPaymentMethod((data as any).paymentMethod ?? "CASH");
      setEditComment(data.comment ?? "");
      setEditDiscount(Number(data.discountAmount ?? 0));

      void fetchContacts(data.companyId ?? null);
    } catch (e) {
      setOrder(null);
      setError(e instanceof Error ? e.message : "Failed to load order");
    } finally {
      setLoading(false);
    }
  }, [apiBaseUrl, orderId, fetchContacts]);

  const refreshTimeline = useCallback(async () => {
    if (!orderId) return;
    setTimelineLoading(true);
    setTimelineError(null);
    try {
      const r = await fetch(`${apiBaseUrl}/orders/${orderId}/timeline`, { cache: "no-store" });
      const text = await r.text();
      if (!r.ok) throw new Error(text || `Failed to load timeline (${r.status})`);
      const data = safeJson<TimelineResponse>(text);
      setTimeline(data?.items || []);
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
    setEditingField(null);
    setFieldSaving(null);

    void fetchCompanies();

    if (isCreate) {
      setOrder(null);
      setTimeline([]);

      const pCompanyId = prefill?.companyId ?? null;
      const pClientId = prefill?.clientId ?? null;

      setEditCompanyId(pCompanyId);
      setEditClientId(pClientId);
      setEditDeliveryMethod("PICKUP");
      setEditPaymentMethod("CASH");
      setEditComment("");
      setEditDiscount(0);

      void fetchContacts(pCompanyId);
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

      if (createContactOpen) {
        setCreateContactOpen(false);
        return;
      }

      if (editingField) {
        setEditingField(null);
        if (order) {
          setEditCompanyId(order.companyId ?? null);
          setEditClientId(order.clientId ?? null);
          setEditDeliveryMethod(order.deliveryMethod ?? "PICKUP");
          setEditPaymentMethod((order as any).paymentMethod ?? "CASH");
          setEditComment(order.comment ?? "");
          setEditDiscount(Number(order.discountAmount ?? 0));
        }
        return;
      }

      if (canClose) onClose();
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [createContactOpen, editingField, canClose, onClose, order]);

  const openCreateContact = (query: string, target: "create" | "edit") => {
    setCreateContactQuery(query);
    setCreateContactTarget(target);

    const companyId = target === "create" ? editCompanyId : (order?.companyId ?? null);
    setCreateContactDefaultCompanyId(companyId);

    setCreateContactOpen(true);
  };

  const patchOrder = useCallback(
    async (patch: any) => {
      if (!orderId) return;
      const r = await fetch(`${apiBaseUrl}/orders/${orderId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(patch),
        cache: "no-store",
      });
      const text = await r.text();
      if (!r.ok) {
        const j = safeJson<any>(text);
        throw new Error(j?.message || text || `Failed (${r.status})`);
      }
      const updated = safeJson<OrderDetails>(text);
      if (updated) setOrder(updated);
      await refreshTimeline();
      onSaved?.();
    },
    [apiBaseUrl, orderId, refreshTimeline, onSaved],
  );

  const handleCompanyChange = (newCompanyId: string | null) => {
    setEditCompanyId(newCompanyId);
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

  const handleSaveOrder = async () => {
    setSavingOrder(true);
    try {
      const r = await fetch(`${apiBaseUrl}/orders`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          companyId: editCompanyId,
          clientId: editClientId,
          contactId: editClientId, // ✅ sync for TTN
          deliveryMethod: editDeliveryMethod,
          paymentMethod: editPaymentMethod,
          comment: editComment || null,
          discountAmount: Number(editDiscount) || 0,
        }),
        cache: "no-store",
      });

      const text = await r.text();
      if (!r.ok) {
        const data = safeJson<any>(text);
        throw new Error(data?.message || text || `Failed to create order (${r.status})`);
      }

      onSaved?.();
      onClose();
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
          {
            cache: "no-store",
          },
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

  const np = (order as any)?.deliveryData?.novaPoshta;
  const ttnNumber: string | null = np?.ttn?.number ?? null;
  const ttnStatusText: string | null = np?.status?.Status ?? np?.status?.statusText ?? null;
  const ttnStatusCode: string | null = np?.status?.StatusCode ?? np?.status?.statusCode ?? null;

  const ttnStatusLabel = ttnStatusText
    ? ttnStatusCode
      ? `${ttnStatusText} (code ${ttnStatusCode})`
      : ttnStatusText
    : null;

  const canShowCreateTtnButton = useMemo(() => {
    return !isCreate && !loading && !!order && order.deliveryMethod === "NOVA_POSHTA";
  }, [isCreate, loading, order]);

  const startInlineEdit = (field: EditFieldKey) => {
    if (!order || fieldSaving) return;
    setEditingField(field);
    void fetchCompanies();
    void fetchContacts(order.companyId ?? null);
  };

  const stopInlineEdit = () => {
    setEditingField(null);
    if (order) {
      setEditCompanyId(order.companyId ?? null);
      setEditClientId(order.clientId ?? null);
      setEditDeliveryMethod(order.deliveryMethod ?? "PICKUP");
      setEditPaymentMethod((order as any).paymentMethod ?? "CASH");
      setEditComment(order.comment ?? "");
      setEditDiscount(Number(order.discountAmount ?? 0));
    }
  };

  const saveInline = async (field: Exclude<EditFieldKey, null>, patch: any) => {
    setFieldSaving(field);
    try {
      await patchOrder(patch);
      setEditingField(null);
      await refreshOrder();
    } catch (e) {
      alert(e instanceof Error ? e.message : "Failed to save");
    } finally {
      setFieldSaving(null);
    }
  };

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

        {/* статусная полоска */}
        {!isCreate && order ? <StatusStepper status={order.status} /> : null}

        {/* BODY */}
        <div className="px-6 py-4 max-h-[calc(90vh-64px)] overflow-auto">
          {/* CREATE MODE */}
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
                      label: `${c.firstName} ${c.lastName} — ${c.phone}`,
                    }))}
                    value={editClientId}
                    onChange={(val) => handleClientChange(val || null)}
                    disabled={loadingContacts}
                    isLoading={loadingContacts}
                    placeholder="Search contact…"
                    createLabel="Create contact"
                    onCreateNew={(q) => openCreateContact(q, "create")}
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

                {/* Payment */}
                <div>
                  <label className="block text-xs font-medium text-zinc-600">Payment</label>
                  <select
                    value={editPaymentMethod}
                    onChange={(e) => setEditPaymentMethod(e.target.value)}
                    className="mt-1 w-full rounded-md border border-zinc-300 px-3 py-2 text-sm focus:border-zinc-500 focus:outline-none"
                  >
                    <option value="CASH">Cash</option>
                    <option value="FOP">FOP</option>
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

              <div className="mt-3 text-xs text-zinc-500">
                After creation you’ll be able to add items and create TTN.
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
                      {/* Company */}
                      <div>
                        <div className="text-xs text-zinc-500">Company</div>
                        {editingField === "company" ? (
                          <div className="mt-1">
                            <SearchableSelect
                              options={companies.map((c) => ({ id: c.id, label: c.name }))}
                              value={editCompanyId}
                              onChange={(val) => {
                                const next = val || null;
                                setEditCompanyId(next);
                                setEditClientId(null);
                                void fetchContacts(next);
                                void saveInline("company", {
                                  companyId: next,
                                  clientId: null,
                                  contactId: null,
                                });
                              }}
                              disabled={loadingCompanies || fieldSaving === "company"}
                              isLoading={loadingCompanies}
                              placeholder="Select company…"
                            />
                            <button
                              type="button"
                              onClick={stopInlineEdit}
                              className="mt-2 text-xs text-zinc-600 hover:underline"
                            >
                              Cancel
                            </button>
                          </div>
                        ) : order.company ? (
                          <div className="mt-1 flex items-center gap-2">
                            <button
                              type="button"
                              onClick={() => onOpenCompany?.(order.company!.id)}
                              className="text-left font-medium text-zinc-900 hover:underline"
                            >
                              {order.company.name}
                            </button>
                            <button
                              type="button"
                              onClick={() => startInlineEdit("company")}
                              className="text-xs text-zinc-500 hover:text-zinc-900"
                              title="Edit"
                            >
                              ✎
                            </button>
                          </div>
                        ) : (
                          <button
                            type="button"
                            onClick={() => startInlineEdit("company")}
                            className="mt-1 text-left text-zinc-600 hover:underline"
                          >
                            —
                          </button>
                        )}
                      </div>

                      {/* Client */}
                      <div>
                        <div className="text-xs text-zinc-500">Client</div>
                        {editingField === "client" ? (
                          <div className="mt-1">
                            <SearchableSelect
                              options={contacts.map((c) => ({
                                id: c.id,
                                label: `${c.firstName} ${c.lastName} — ${c.phone}`,
                              }))}
                              value={editClientId}
                              onChange={(val) => {
                                const next = val || null;
                                setEditClientId(next);
                                void saveInline("client", { clientId: next, contactId: next });
                              }}
                              disabled={loadingContacts || fieldSaving === "client"}
                              isLoading={loadingContacts}
                              placeholder="Search contact…"
                              createLabel="Create contact"
                              onCreateNew={(q) => openCreateContact(q, "edit")}
                            />
                            <button
                              type="button"
                              onClick={stopInlineEdit}
                              className="mt-2 text-xs text-zinc-600 hover:underline"
                            >
                              Cancel
                            </button>
                          </div>
                        ) : order.client ? (
                          <div className="mt-1 flex items-center gap-2">
                            <button
                              type="button"
                              onClick={() => onOpenContact?.(order.client!.id)}
                              className="text-left font-medium text-zinc-900 hover:underline"
                            >
                              {order.client.firstName} {order.client.lastName} —{" "}
                              {order.client.phone}
                            </button>
                            <button
                              type="button"
                              onClick={() => startInlineEdit("client")}
                              className="text-xs text-zinc-500 hover:text-zinc-900"
                              title="Edit"
                            >
                              ✎
                            </button>
                          </div>
                        ) : (
                          <button
                            type="button"
                            onClick={() => startInlineEdit("client")}
                            className="mt-1 text-left text-zinc-600 hover:underline"
                          >
                            —
                          </button>
                        )}
                      </div>

                      {/* Delivery */}
                      <div>
                        <div className="text-xs text-zinc-500">Delivery</div>
                        {editingField === "deliveryMethod" ? (
                          <div className="mt-1">
                            <select
                              value={editDeliveryMethod}
                              onChange={(e) => {
                                const v = e.target.value;
                                setEditDeliveryMethod(v);
                                void saveInline("deliveryMethod", { deliveryMethod: v });
                              }}
                              className="w-full rounded-md border border-zinc-300 px-3 py-2 text-sm focus:border-zinc-500 focus:outline-none"
                              disabled={fieldSaving === "deliveryMethod"}
                            >
                              <option value="PICKUP">Pickup</option>
                              <option value="NOVA_POSHTA">Nova Poshta</option>
                            </select>
                            <button
                              type="button"
                              onClick={stopInlineEdit}
                              className="mt-2 text-xs text-zinc-600 hover:underline"
                            >
                              Cancel
                            </button>
                          </div>
                        ) : (
                          <div className="mt-1 flex items-center gap-2">
                            <div className="font-medium text-zinc-900">
                              {order.deliveryMethod ?? "—"}
                            </div>
                            <button
                              type="button"
                              onClick={() => startInlineEdit("deliveryMethod")}
                              className="text-xs text-zinc-500 hover:text-zinc-900"
                              title="Edit"
                            >
                              ✎
                            </button>
                          </div>
                        )}
                      </div>

                      {/* Payment */}
                      <div>
                        <div className="text-xs text-zinc-500">Payment</div>
                        {editingField === "paymentMethod" ? (
                          <div className="mt-1">
                            <select
                              value={editPaymentMethod}
                              onChange={(e) => {
                                const v = e.target.value;
                                setEditPaymentMethod(v);
                                void saveInline("paymentMethod", { paymentMethod: v });
                              }}
                              className="w-full rounded-md border border-zinc-300 px-3 py-2 text-sm focus:border-zinc-500 focus:outline-none"
                              disabled={fieldSaving === "paymentMethod"}
                            >
                              <option value="CASH">Cash</option>
                              <option value="FOP">FOP</option>
                            </select>
                            <button
                              type="button"
                              onClick={stopInlineEdit}
                              className="mt-2 text-xs text-zinc-600 hover:underline"
                            >
                              Cancel
                            </button>
                          </div>
                        ) : (
                          <div className="mt-1 flex items-center gap-2">
                            <div className="font-medium text-zinc-900">
                              {(order as any).paymentMethod ?? "—"}
                            </div>
                            <button
                              type="button"
                              onClick={() => startInlineEdit("paymentMethod")}
                              className="text-xs text-zinc-500 hover:text-zinc-900"
                              title="Edit"
                            >
                              ✎
                            </button>
                          </div>
                        )}
                      </div>

                      {/* TTN */}
                      <div>
                        <div className="text-xs text-zinc-500">TTN</div>
                        <div className="mt-1 font-medium text-zinc-900">
                          {ttnNumber ? `№ ${ttnNumber}` : "—"}
                        </div>
                      </div>

                      {/* NP status */}
                      <div className="col-span-2">
                        <div className="text-xs text-zinc-500">NP status</div>
                        <div className="mt-1 text-zinc-700">{ttnStatusLabel ?? "—"}</div>
                      </div>

                      {/* Status */}
                      <div>
                        <div className="text-xs text-zinc-500">Status</div>
                        <div className="mt-1 font-medium text-zinc-900">{order.status}</div>
                      </div>

                      {/* Created */}
                      <div>
                        <div className="text-xs text-zinc-500">Created</div>
                        <div className="mt-1 text-zinc-700">{formatDt(order.createdAt)}</div>
                      </div>

                      {/* Discount */}
                      <div>
                        <div className="text-xs text-zinc-500">Discount</div>
                        {editingField === "discount" ? (
                          <div className="mt-1 flex items-center gap-2">
                            <input
                              type="number"
                              min={0}
                              value={editDiscount}
                              onChange={(e) => setEditDiscount(Math.max(0, Number(e.target.value)))}
                              className="w-32 rounded-md border border-zinc-300 px-3 py-2 text-sm"
                              disabled={fieldSaving === "discount"}
                            />
                            <button
                              type="button"
                              onClick={() =>
                                void saveInline("discount", {
                                  discountAmount: Number(editDiscount) || 0,
                                })
                              }
                              className="rounded-md bg-zinc-900 px-3 py-2 text-sm font-medium text-white hover:bg-zinc-800 disabled:opacity-50"
                              disabled={fieldSaving === "discount"}
                            >
                              Save
                            </button>
                            <button
                              type="button"
                              onClick={stopInlineEdit}
                              className="text-sm text-zinc-600 hover:underline"
                            >
                              Cancel
                            </button>
                          </div>
                        ) : (
                          <div className="mt-1 flex items-center gap-2">
                            <div className="text-zinc-700">{order.discountAmount.toFixed(2)}</div>
                            <button
                              type="button"
                              onClick={() => startInlineEdit("discount")}
                              className="text-xs text-zinc-500 hover:text-zinc-900"
                              title="Edit"
                            >
                              ✎
                            </button>
                          </div>
                        )}
                      </div>

                      {/* Total */}
                      <div>
                        <div className="text-xs text-zinc-500">Total</div>
                        <div className="mt-1 font-semibold text-zinc-900">
                          {order.totalAmount.toFixed(2)} {order.currency}
                        </div>
                      </div>
                    </div>

                    {/* Comment */}
                    <div className="mt-4">
                      <div className="flex items-center justify-between">
                        <div className="text-xs text-zinc-500">Comment</div>
                        {editingField !== "comment" ? (
                          <button
                            type="button"
                            onClick={() => startInlineEdit("comment")}
                            className="text-xs text-zinc-500 hover:text-zinc-900"
                            title="Edit"
                          >
                            ✎
                          </button>
                        ) : null}
                      </div>

                      {editingField === "comment" ? (
                        <div className="mt-1">
                          <textarea
                            rows={3}
                            value={editComment}
                            onChange={(e) => setEditComment(e.target.value)}
                            className="w-full rounded-md border border-zinc-300 px-3 py-2 text-sm"
                            disabled={fieldSaving === "comment"}
                          />
                          <div className="mt-2 flex justify-end gap-2">
                            <button
                              type="button"
                              onClick={stopInlineEdit}
                              className="rounded-md border border-zinc-200 px-3 py-2 text-sm text-zinc-700 hover:bg-zinc-50"
                            >
                              Cancel
                            </button>
                            <button
                              type="button"
                              onClick={() =>
                                void saveInline("comment", { comment: editComment.trim() || null })
                              }
                              className="rounded-md bg-zinc-900 px-3 py-2 text-sm font-medium text-white hover:bg-zinc-800"
                              disabled={fieldSaving === "comment"}
                            >
                              Save
                            </button>
                          </div>
                        </div>
                      ) : order.comment ? (
                        <div className="mt-1 text-sm text-zinc-800 whitespace-pre-wrap">
                          {order.comment}
                        </div>
                      ) : (
                        <div className="mt-1 text-sm text-zinc-500">—</div>
                      )}
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

                        {submitError && (
                          <div className="mt-3 text-xs text-red-600">{submitError}</div>
                        )}

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
                                <td className="px-3 py-2 text-right text-zinc-700">
                                  {it.price.toFixed(2)}
                                </td>
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
                            <div className="mt-2 text-sm text-zinc-800 whitespace-pre-wrap">
                              {t.body}
                            </div>
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
              contactId={(order as any).contactId ?? order.clientId ?? ""}
              onCreated={async (res) => {
                console.log("TTN created:", res);
                setShowTtnModal(false);
                await Promise.all([refreshOrder(), refreshTimeline()]);
                onSaved?.();
              }}
            />
          ) : null}
        </div>

        {/* Create contact overlay */}
        <CreateContactModal
          open={createContactOpen}
          apiBaseUrl={apiBaseUrl}
          companies={companies}
          defaultCompanyId={createContactDefaultCompanyId}
          query={createContactQuery}
          onClose={() => setCreateContactOpen(false)}
          onCreated={(c) => {
            setContacts((prev) => {
              const exists = prev.some((x) => x.id === c.id);
              if (exists) return prev;
              return [c, ...prev];
            });

            if (c.companyId) setEditCompanyId((prev) => prev ?? c.companyId ?? null);

            if (createContactTarget === "create") {
              setEditClientId(c.id);
            } else {
              setEditClientId(c.id);
              void saveInline("client", { clientId: c.id, contactId: c.id });
            }

            setCreateContactOpen(false);
          }}
        />
      </div>
    </div>
  );
}

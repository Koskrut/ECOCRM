"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { CompanyTimeline } from "./CompanyTimeline";
import { EntityOrdersList } from "@/components/EntityOrdersList";
import { OrderModal } from "../orders/OrderModal";

type Company = {
  id: string;
  name: string;
  edrpou?: string | null;
  taxId?: string | null;
  createdAt: string;
  updatedAt: string;
};

type Props = {
  apiBaseUrl: string;
  companyId: string;
  onClose: () => void;
  onUpdate: () => void;
};

type TabKey = "general" | "orders";

function Tabs({ value, onChange }: { value: TabKey; onChange: (v: TabKey) => void }) {
  const tabs: { key: TabKey; label: string }[] = [
    { key: "general", label: "General" },
    { key: "orders", label: "Orders" },
  ];

  return (
    <div className="border-b border-zinc-200 px-5">
      <div className="flex gap-6">
        {tabs.map((t) => (
          <button
            key={t.key}
            type="button"
            onClick={() => onChange(t.key)}
            className={`-mb-px border-b-2 py-3 text-sm font-medium ${
              value === t.key
                ? "border-zinc-900 text-zinc-900"
                : "border-transparent text-zinc-500 hover:text-zinc-700"
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>
    </div>
  );
}

export function CompanyModal({ apiBaseUrl, companyId, onClose, onUpdate }: Props) {
  const [tab, setTab] = useState<TabKey>("general");

  const [company, setCompany] = useState<Company | null>(null);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);

  const [isEditing, setIsEditing] = useState(false);
  const [saving, setSaving] = useState(false);

  const [name, setName] = useState("");
  const [edrpou, setEdrpou] = useState("");
  const [taxId, setTaxId] = useState("");

  // Orders
  const [orderId, setOrderId] = useState<string | null>(null);
  const [creatingOrder, setCreatingOrder] = useState(false);
  const [ordersReloadKey, setOrdersReloadKey] = useState(0);

  const canClose = !saving && !creatingOrder;

  const title = useMemo(() => (isEditing ? "Edit company" : "Company"), [isEditing]);

  const refresh = useCallback(async () => {
    setLoading(true);
    setErr(null);
    try {
      const r = await fetch(`${apiBaseUrl}/companies/${companyId}`, { cache: "no-store" });
      const t = await r.text();
      if (!r.ok) throw new Error(t || `Failed (${r.status})`);
      const data = JSON.parse(t) as Company;

      setCompany(data);
      setName(data.name ?? "");
      setEdrpou((data.edrpou ?? "") as string);
      setTaxId((data.taxId ?? "") as string);
    } catch (e) {
      setCompany(null);
      setErr(e instanceof Error ? e.message : "Failed to load company");
    } finally {
      setLoading(false);
    }
  }, [apiBaseUrl, companyId]);

  useEffect(() => {
    setIsEditing(false);
    setTab("general");
    void refresh();
  }, [refresh]);

  // ESC: если открыт заказ — закрываем его первым
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return;

      if (orderId) {
        setOrderId(null);
        return;
      }

      if (isEditing) setIsEditing(false);
      else if (canClose) onClose();
    };

    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [isEditing, canClose, onClose, orderId]);

  const startEdit = () => {
    if (!company) return;
    setIsEditing(true);
    setName(company.name ?? "");
    setEdrpou((company.edrpou ?? "") as string);
    setTaxId((company.taxId ?? "") as string);
  };

  const save = async () => {
    setSaving(true);
    setErr(null);
    try {
      const payload = {
        name: name.trim(),
        edrpou: edrpou.trim() || null,
        taxId: taxId.trim() || null,
      };
      if (!payload.name) throw new Error("Name is required");

      const r = await fetch(`${apiBaseUrl}/companies/${companyId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
        cache: "no-store",
      });
      const t = await r.text();
      if (!r.ok) throw new Error(t || `Failed (${r.status})`);

      setIsEditing(false);
      await refresh();
      onUpdate();
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Failed");
    } finally {
      setSaving(false);
    }
  };

  // ✅ Create order from company modal
  const createOrder = async () => {
    setCreatingOrder(true);
    setErr(null);
    try {
      const r = await fetch(`${apiBaseUrl}/orders`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        cache: "no-store",
        body: JSON.stringify({
          companyId,
          clientId: null,
          comment: "",
          discountAmount: 0,
        }),
      });

      const t = await r.text();
      if (!r.ok) throw new Error(t || `Failed (${r.status})`);

      const created = JSON.parse(t) as { id: string };
      setTab("orders");
      setOrdersReloadKey((x) => x + 1);
      setOrderId(created.id);
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Failed to create order");
    } finally {
      setCreatingOrder(false);
    }
  };

  return (
    <>
      <div
        className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 px-4"
        role="presentation"
        onClick={() => canClose && onClose()}
      >
        <div
          className="w-full max-w-5xl max-h-[90vh] overflow-hidden rounded-xl bg-white shadow-xl"
          onClick={(e) => e.stopPropagation()}
        >
          {/* Header */}
          <div className="flex items-center justify-between border-b border-zinc-200 px-5 py-4">
            <div className="min-w-0">
              <div className="text-base font-semibold text-zinc-900">{title}</div>
              {company?.name ? (
                <div className="mt-0.5 text-sm text-zinc-500">{company.name}</div>
              ) : null}
            </div>

            <div className="flex items-center gap-2">
              {/* ✅ + Order moved to header */}
              <button
                type="button"
                disabled={loading || !!err || creatingOrder}
                onClick={() => void createOrder()}
                className="rounded-md bg-zinc-900 px-3 py-1.5 text-sm font-medium text-white hover:bg-zinc-800 disabled:opacity-60"
              >
                {creatingOrder ? "Creating…" : "+ Order"}
              </button>

              {!isEditing && !loading && !err ? (
                <button
                  type="button"
                  onClick={startEdit}
                  className="rounded-md border border-zinc-200 px-3 py-1.5 text-sm text-zinc-700 hover:bg-zinc-50"
                >
                  Edit
                </button>
              ) : null}

              <button
                type="button"
                className="rounded-md border border-zinc-200 px-2 py-1 text-sm text-zinc-700 hover:bg-zinc-50"
                onClick={() => canClose && onClose()}
              >
                ✕
              </button>
            </div>
          </div>

          {/* Tabs */}
          <Tabs value={tab} onChange={setTab} />

          {/* Content */}
          <div className="flex-1 min-h-0 overflow-hidden">
            {tab === "general" ? (
              <div className="grid h-full grid-cols-1 gap-6 p-5 lg:grid-cols-2">
                {/* Left */}
                <div className="min-h-0 overflow-auto">
                  {loading ? (
                    <div className="text-sm text-zinc-500">Loading…</div>
                  ) : err ? (
                    <div className="rounded-md border border-red-100 bg-red-50 p-3 text-sm text-red-700">
                      {err}
                    </div>
                  ) : !company ? (
                    <div className="text-sm text-zinc-500">Not found</div>
                  ) : isEditing ? (
                    <>
                      <label className="block text-sm font-medium text-zinc-700">Name</label>
                      <input
                        className="mt-1 w-full rounded-md border border-zinc-200 px-3 py-2 text-sm outline-none focus:border-zinc-400"
                        value={name}
                        onChange={(e) => setName(e.target.value)}
                        placeholder="SUPREX"
                        disabled={saving}
                      />

                      <label className="mt-3 block text-sm font-medium text-zinc-700">EDRPOU</label>
                      <input
                        className="mt-1 w-full rounded-md border border-zinc-200 px-3 py-2 text-sm outline-none focus:border-zinc-400"
                        value={edrpou}
                        onChange={(e) => setEdrpou(e.target.value)}
                        placeholder="12345678"
                        disabled={saving}
                      />

                      <label className="mt-3 block text-sm font-medium text-zinc-700">Tax ID</label>
                      <input
                        className="mt-1 w-full rounded-md border border-zinc-200 px-3 py-2 text-sm outline-none focus:border-zinc-400"
                        value={taxId}
                        onChange={(e) => setTaxId(e.target.value)}
                        placeholder="UA…"
                        disabled={saving}
                      />

                      <div className="mt-5 flex gap-2">
                        <button
                          type="button"
                          onClick={() => void save()}
                          disabled={saving}
                          className="rounded-md bg-zinc-900 px-3 py-2 text-sm text-white hover:bg-zinc-800 disabled:opacity-60"
                        >
                          {saving ? "Saving…" : "Save"}
                        </button>
                        <button
                          type="button"
                          onClick={() => !saving && setIsEditing(false)}
                          className="rounded-md border border-zinc-200 px-3 py-2 text-sm text-zinc-700 hover:bg-zinc-50"
                        >
                          Cancel
                        </button>
                      </div>
                    </>
                  ) : (
                    <div className="rounded-lg border border-zinc-200 bg-white p-4">
                      <div className="text-sm font-semibold text-zinc-900">Details</div>

                      <div className="mt-3 space-y-2 text-sm">
                        <div className="flex items-center justify-between gap-4">
                          <div className="text-zinc-500">Name</div>
                          <div className="text-zinc-900">{company.name || "—"}</div>
                        </div>

                        <div className="flex items-center justify-between gap-4">
                          <div className="text-zinc-500">EDRPOU</div>
                          <div className="text-zinc-900">{company.edrpou || "—"}</div>
                        </div>

                        <div className="flex items-center justify-between gap-4">
                          <div className="text-zinc-500">Tax ID</div>
                          <div className="text-zinc-900">{company.taxId || "—"}</div>
                        </div>

                        <div className="pt-2 text-xs text-zinc-500">
                          Created: {new Date(company.createdAt).toLocaleString()}
                          <br />
                          Updated: {new Date(company.updatedAt).toLocaleString()}
                        </div>
                      </div>
                    </div>
                  )}
                </div>

                {/* Right: timeline */}
                <div className="flex min-h-0 flex-col">
                  <div className="text-sm font-semibold text-zinc-900">Timeline</div>
                  <div className="mt-3 flex-1 min-h-0 overflow-auto">
                    <CompanyTimeline apiBaseUrl={apiBaseUrl} companyId={companyId} />
                  </div>
                </div>
              </div>
            ) : (
              // ✅ Orders tab: only list (no timeline)
              <div className="h-full p-5">
                <div className="min-h-0 h-full overflow-auto">
                  <EntityOrdersList
                    key={ordersReloadKey}
                    apiBaseUrl={apiBaseUrl}
                    query={`companyId=${companyId}&pageSize=50`}
                    onOpenOrder={(id) => setOrderId(id)}
                  />
                </div>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* ✅ Nested OrderModal OUTSIDE overlay (must-have) */}
      {orderId ? (
        <OrderModal apiBaseUrl={apiBaseUrl} orderId={orderId} onClose={() => setOrderId(null)} />
      ) : null}
    </>
  );
}

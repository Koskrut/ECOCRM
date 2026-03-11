"use client";

import { useCallback, useEffect, useState } from "react";
import { apiHttp } from "@/lib/api/client";
import type { LeadSource, Lead } from "@/lib/api";

type CompanyOption = { id: string; name: string };

type EditItem = { productId: string; productName?: string; qty: number; price: number };

const API_BASE = "/api";

type Props = {
  onClose: () => void;
  onCreated: (lead: Lead) => void;
};

export function CreateLeadModal({ onClose, onCreated }: Props) {
  const [companies, setCompanies] = useState<CompanyOption[]>([]);
  const [loadingCompanies, setLoadingCompanies] = useState(false);

  const [companyId, setCompanyId] = useState<string>("");
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [email, setEmail] = useState("");
  const [companyName, setCompanyName] = useState("");
  const [message, setMessage] = useState("");
  const [source, setSource] = useState<LeadSource>("OTHER");

  const [createItems, setCreateItems] = useState<EditItem[]>([]);
  const [productSearch, setProductSearch] = useState("");
  const [productResults, setProductResults] = useState<Array<{ id: string; name: string; sku: string; basePrice: number }>>([]);
  const [selectedProduct, setSelectedProduct] = useState<{ id: string; name: string; sku: string; basePrice: number } | null>(null);
  const [newItemQty, setNewItemQty] = useState(1);
  const [newItemPrice, setNewItemPrice] = useState(0);

  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const canClose = !saving;

  const loadCompanies = useCallback(async () => {
    setLoadingCompanies(true);
    try {
      const res = await apiHttp.get<{ items?: CompanyOption[] }>("/companies?page=1&pageSize=200");
      setCompanies(Array.isArray(res.data?.items) ? res.data.items : []);
    } finally {
      setLoadingCompanies(false);
    }
  }, []);

  useEffect(() => {
    void loadCompanies();
  }, [loadCompanies]);

  useEffect(() => {
    if (!productSearch.trim()) {
      setProductResults([]);
      return;
    }
    let alive = true;
    const t = setTimeout(async () => {
      try {
        const r = await fetch(
          `${API_BASE}/products?search=${encodeURIComponent(productSearch)}&page=1&pageSize=10`,
          { cache: "no-store" },
        );
        if (!r.ok) throw new Error("Failed");
        const data = (await r.json()) as { items?: Array<{ id: string; name: string; sku: string; basePrice: number }> };
        if (alive) setProductResults(data.items ?? []);
      } catch {
        if (alive) setProductResults([]);
      }
    }, 300);
    return () => {
      alive = false;
      clearTimeout(t);
    };
  }, [productSearch]);

  const addItem = () => {
    if (!selectedProduct || newItemQty < 1 || newItemPrice < 0) return;
    setCreateItems((prev) => [
      ...prev,
      { productId: selectedProduct.id, productName: selectedProduct.name, qty: newItemQty, price: newItemPrice },
    ]);
    setSelectedProduct(null);
    setProductSearch("");
    setProductResults([]);
    setNewItemQty(1);
    setNewItemPrice(selectedProduct.basePrice);
  };

  const removeItem = (index: number) => {
    setCreateItems((prev) => prev.filter((_, i) => i !== index));
  };

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return;
      if (canClose) onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [canClose, onClose]);

  const submit = async () => {
    setErr(null);
    if (!companyId) {
      setErr("Select a company");
      return;
    }
    if (!phone.trim() && !email.trim()) {
      setErr("Phone or email is required");
      return;
    }

    setSaving(true);
    try {
      const payload: Record<string, unknown> = {
        companyId,
        source,
        name: name.trim() || undefined,
        phone: phone.trim() || undefined,
        email: email.trim() || undefined,
        companyName: companyName.trim() || undefined,
        message: message.trim() || undefined,
      };
      if (createItems.length > 0) {
        payload.items = createItems.map((it) => ({ productId: it.productId, qty: it.qty, price: it.price }));
      }

      const res = await apiHttp.post<Lead>("/leads", payload);
      onCreated(res.data);
      onClose();
    } catch (e) {
      const msg =
        (e as { response?: { data?: { message?: string } } })?.response?.data?.message ??
        (e instanceof Error ? e.message : "Failed to create lead");
      setErr(msg);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/30 px-4 backdrop-blur-sm"
      role="presentation"
      onClick={() => canClose && onClose()}
    >
      <div
        className="w-full max-w-lg overflow-hidden rounded-2xl bg-white shadow-xl"
        onClick={(e) => e.stopPropagation()}
        role="presentation"
      >
        <div className="flex items-center justify-between border-b border-zinc-200 px-5 py-4">
          <div className="text-base font-semibold text-zinc-900">New lead</div>
          <button
            type="button"
            onClick={() => canClose && onClose()}
            className="rounded-md border border-zinc-200 px-2 py-1 text-sm text-zinc-700 hover:bg-zinc-50"
          >
            ✕
          </button>
        </div>

        <div className="max-h-[70vh] overflow-auto px-5 py-4 text-sm">
          {err && (
            <div className="mb-3 rounded-md border border-red-200 bg-red-50 p-2 text-xs text-red-700">
              {err}
            </div>
          )}

          <label className="block text-xs font-medium text-zinc-600">Company</label>
          <select
            className="mt-1 w-full rounded-md border border-zinc-200 px-3 py-2 text-sm outline-none focus:border-zinc-400"
            value={companyId}
            onChange={(e) => setCompanyId(e.target.value)}
            disabled={loadingCompanies || saving}
          >
            <option value="">— select company —</option>
            {companies.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </select>

          <div className="mt-3 grid gap-3 md:grid-cols-2">
            <div>
              <label className="block text-xs font-medium text-zinc-600">Name</label>
              <input
                className="mt-1 w-full rounded-md border border-zinc-200 px-3 py-2 text-sm outline-none focus:border-zinc-400"
                value={name}
                onChange={(e) => setName(e.target.value)}
                disabled={saving}
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-zinc-600">Phone</label>
              <input
                className="mt-1 w-full rounded-md border border-zinc-200 px-3 py-2 text-sm outline-none focus:border-zinc-400"
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
                disabled={saving}
                placeholder="+380…"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-zinc-600">Email</label>
              <input
                className="mt-1 w-full rounded-md border border-zinc-200 px-3 py-2 text-sm outline-none focus:border-zinc-400"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                disabled={saving}
                placeholder="email@example.com"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-zinc-600">
                Company (text)
              </label>
              <input
                className="mt-1 w-full rounded-md border border-zinc-200 px-3 py-2 text-sm outline-none focus:border-zinc-400"
                value={companyName}
                onChange={(e) => setCompanyName(e.target.value)}
                disabled={saving}
                placeholder="Name from source"
              />
            </div>
          </div>

          <label className="mt-3 block text-xs font-medium text-zinc-600">Source</label>
          <select
            className="mt-1 w-full rounded-md border border-zinc-200 px-3 py-2 text-sm outline-none focus:border-zinc-400"
            value={source}
            onChange={(e) => setSource(e.target.value as LeadSource)}
            disabled={saving}
          >
            <option value="FACEBOOK">Facebook</option>
            <option value="TELEGRAM">Telegram</option>
            <option value="INSTAGRAM">Instagram</option>
<option value="WEBSITE">Website</option>
              <option value="OTHER">Other</option>
          </select>

          <label className="mt-3 block text-xs font-medium text-zinc-600">
            Message / comment
          </label>
          <textarea
            rows={3}
            className="mt-1 w-full rounded-md border border-zinc-200 px-3 py-2 text-sm outline-none focus:border-zinc-400"
            value={message}
            onChange={(e) => setMessage(e.target.value)}
            disabled={saving}
          />

          <div className="mt-4">
            <div className="text-xs font-medium text-zinc-600 mb-2">Products (optional)</div>
            {createItems.length > 0 ? (
              <div className="rounded border border-zinc-200 overflow-hidden mb-2">
                <table className="w-full text-sm">
                  <tbody className="divide-y divide-zinc-100">
                    {createItems.map((it, idx) => (
                      <tr key={`${it.productId}-${idx}`}>
                        <td className="px-2 py-1.5">{it.productName ?? it.productId}</td>
                        <td className="px-2 py-1.5 text-right">{it.qty}</td>
                        <td className="px-2 py-1.5 text-right">{it.price.toFixed(2)}</td>
                        <td className="px-2 py-1.5 w-14">
                          <button
                            type="button"
                            onClick={() => removeItem(idx)}
                            className="text-zinc-500 hover:text-red-600 text-xs"
                            disabled={saving}
                          >
                            Remove
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : null}
            <div className="flex flex-wrap items-end gap-2">
              <div className="min-w-[160px]">
                <input
                  type="text"
                  placeholder="Search product…"
                  className="w-full rounded-md border border-zinc-200 px-2 py-1.5 text-sm"
                  value={productSearch}
                  onChange={(e) => setProductSearch(e.target.value)}
                  disabled={saving}
                />
                {productResults.length > 0 ? (
                  <ul className="mt-1 max-h-28 overflow-auto rounded border border-zinc-200 bg-white shadow text-sm">
                    {productResults.map((p) => (
                      <li key={p.id}>
                        <button
                          type="button"
                          className="w-full px-2 py-1 text-left hover:bg-zinc-50 flex justify-between"
                          onClick={() => {
                            setSelectedProduct(p);
                            setProductSearch(p.name);
                            setProductResults([]);
                            setNewItemPrice(p.basePrice);
                          }}
                        >
                          <span>{p.name}</span>
                          <span className="text-zinc-500 text-xs">{p.sku}</span>
                        </button>
                      </li>
                    ))}
                  </ul>
                ) : null}
              </div>
              <div className="w-14">
                <label className="block text-[10px] text-zinc-500">Qty</label>
                <input
                  type="number"
                  min={1}
                  className="w-full rounded-md border border-zinc-200 px-2 py-1.5 text-sm"
                  value={newItemQty}
                  onChange={(e) => setNewItemQty(Math.max(1, parseInt(e.target.value, 10) || 1))}
                  disabled={saving}
                />
              </div>
              <div className="w-20">
                <label className="block text-[10px] text-zinc-500">Price</label>
                <input
                  type="number"
                  min={0}
                  step={0.01}
                  className="w-full rounded-md border border-zinc-200 px-2 py-1.5 text-sm"
                  value={newItemPrice}
                  onChange={(e) => setNewItemPrice(parseFloat(e.target.value) || 0)}
                  disabled={saving}
                />
              </div>
              <button
                type="button"
                onClick={addItem}
                disabled={!selectedProduct || saving}
                className="rounded-md border border-zinc-300 px-2 py-1.5 text-sm text-zinc-700 hover:bg-zinc-50 disabled:opacity-50"
              >
                Add
              </button>
            </div>
          </div>
        </div>

        <div className="flex items-center justify-end gap-2 border-t border-zinc-200 bg-zinc-50 px-5 py-3">
          <button
            type="button"
            onClick={() => canClose && onClose()}
            className="rounded-md border border-zinc-200 px-3 py-2 text-sm text-zinc-700 hover:bg-white"
            disabled={saving}
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={() => void submit()}
            className="btn-primary"
            disabled={saving}
          >
            {saving ? "Creating…" : "Create"}
          </button>
        </div>
      </div>
    </div>
  );
}

export default CreateLeadModal;


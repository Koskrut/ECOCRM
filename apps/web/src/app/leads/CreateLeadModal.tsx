"use client";

import { useEffect, useState } from "react";
import { apiHttp } from "@/lib/api/client";
import { formatPhoneInputMask, normalizePhone } from "@/lib/formatPhone";
import { scheduleModalClose } from "@/lib/modal/scheduleModalClose";
import type { LeadSource, Lead } from "@/lib/api";
import { strings } from "@/locales";

type EditItem = { productId: string; productName?: string; qty: number; price: number };

const API_BASE = "/api";
const t = strings.leads;
const SOURCE_OPTIONS: LeadSource[] = [
  "META",
  "FACEBOOK",
  "TELEGRAM",
  "INSTAGRAM",
  "WEBSITE",
  "RINGOSTAT",
  "KYIVSTAR",
  "OTHER",
];

type Props = {
  onClose: () => void;
  onCreated: (lead: Lead) => void;
};

export function CreateLeadModal({ onClose, onCreated }: Props) {
  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [middleName, setMiddleName] = useState("");
  const [phone, setPhone] = useState("");
  const [email, setEmail] = useState("");
  const [companyName, setCompanyName] = useState("");
  const [message, setMessage] = useState("");
  const [source, setSource] = useState<LeadSource>("OTHER");

  const [createItems, setCreateItems] = useState<EditItem[]>([]);
  const [productSearch, setProductSearch] = useState("");
  const [productResults, setProductResults] = useState<
    Array<{ id: string; name: string; sku: string; basePrice: number }>
  >([]);
  const [selectedProduct, setSelectedProduct] = useState<{
    id: string;
    name: string;
    sku: string;
    basePrice: number;
  } | null>(null);
  const [newItemQty, setNewItemQty] = useState(1);
  const [newItemPrice, setNewItemPrice] = useState(0);

  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const canClose = !saving;

  useEffect(() => {
    if (!productSearch.trim()) {
      setProductResults([]);
      return;
    }
    let alive = true;
    const timer = setTimeout(async () => {
      try {
        const r = await fetch(
          `${API_BASE}/products?search=${encodeURIComponent(productSearch)}&page=1&pageSize=10`,
          { cache: "no-store" },
        );
        if (!r.ok) throw new Error("Не вдалося виконати запит");
        const data = (await r.json()) as {
          items?: Array<{ id: string; name: string; sku: string; basePrice: number }>;
        };
        if (alive) setProductResults(data.items ?? []);
      } catch {
        if (alive) setProductResults([]);
      }
    }, 300);
    return () => {
      alive = false;
      clearTimeout(timer);
    };
  }, [productSearch]);

  const addItem = () => {
    if (!selectedProduct || newItemQty < 1 || newItemPrice < 0) return;
    setCreateItems((prev) => [
      ...prev,
      {
        productId: selectedProduct.id,
        productName: selectedProduct.name,
        qty: newItemQty,
        price: newItemPrice,
      },
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
    if (!phone.replace(/\D/g, "").length && !email.trim()) {
      setErr(t.create.phoneOrEmail);
      return;
    }

    setSaving(true);
    try {
      const fn = firstName.trim();
      const ln = lastName.trim();
      const mn = middleName.trim();
      const fullName = [ln, fn, mn].filter(Boolean).join(" ").trim();
      const payload: Record<string, unknown> = {
        source,
        firstName: fn || undefined,
        lastName: ln || undefined,
        middleName: mn || undefined,
        fullName: fullName || undefined,
        name: fullName || fn || undefined,
        phone: (normalizePhone(phone) ?? phone.trim()) || undefined,
        email: email.trim() || undefined,
        companyName: companyName.trim() || undefined,
        message: message.trim() || undefined,
      };
      if (createItems.length > 0) {
        payload.items = createItems.map((it) => ({
          productId: it.productId,
          qty: it.qty,
          price: it.price,
        }));
      }

      const res = await apiHttp.post<Lead>("/leads", payload);
      onCreated(res.data);
      onClose();
    } catch (e) {
      const msg =
        (e as { response?: { data?: { message?: string } } })?.response?.data?.message ??
        (e instanceof Error ? e.message : t.create.failed);
      setErr(typeof msg === "string" ? msg : t.create.failed);
    } finally {
      setSaving(false);
    }
  };

  const requestClose = () => {
    if (canClose) scheduleModalClose(onClose);
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/30 px-4 backdrop-blur-sm"
      role="presentation"
      onMouseDown={(e) => e.stopPropagation()}
      onClick={(e) => {
        e.stopPropagation();
        requestClose();
      }}
    >
      <div
        className="w-full max-w-lg overflow-hidden rounded-2xl bg-white shadow-xl"
        onClick={(e) => e.stopPropagation()}
        role="presentation"
      >
        <div className="flex items-center justify-between border-b border-zinc-200 px-5 py-4">
          <div className="text-base font-semibold text-zinc-900">{t.newLead}</div>
          <button
            type="button"
            onClick={requestClose}
            className="rounded-md border border-zinc-200 px-2 py-1 text-sm text-zinc-700 hover:bg-zinc-50"
          >
            ✕
          </button>
        </div>

        <div className="max-h-[70vh] overflow-auto px-5 py-4 text-sm">
          {err ? (
            <div className="mb-3 rounded-md border border-red-200 bg-red-50 p-2 text-xs text-red-700">
              {err}
            </div>
          ) : null}

          <div className="grid gap-3 md:grid-cols-2">
            <div>
              <label className="block text-xs font-medium text-zinc-600">{t.create.firstName}</label>
              <input
                className="mt-1 w-full rounded-md border border-zinc-200 px-3 py-2 text-sm outline-none focus:border-zinc-400"
                value={firstName}
                onChange={(e) => setFirstName(e.target.value)}
                disabled={saving}
                autoComplete="given-name"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-zinc-600">{t.create.lastName}</label>
              <input
                className="mt-1 w-full rounded-md border border-zinc-200 px-3 py-2 text-sm outline-none focus:border-zinc-400"
                value={lastName}
                onChange={(e) => setLastName(e.target.value)}
                disabled={saving}
                autoComplete="family-name"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-zinc-600">{t.create.middleName}</label>
              <input
                className="mt-1 w-full rounded-md border border-zinc-200 px-3 py-2 text-sm outline-none focus:border-zinc-400"
                value={middleName}
                onChange={(e) => setMiddleName(e.target.value)}
                disabled={saving}
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-zinc-600">{t.create.phone}</label>
              <input
                type="tel"
                inputMode="tel"
                autoComplete="tel"
                className="mt-1 w-full rounded-md border border-zinc-200 px-3 py-2 text-sm outline-none focus:border-zinc-400"
                value={phone}
                onChange={(e) => setPhone(formatPhoneInputMask(e.target.value))}
                disabled={saving}
                placeholder="+38 (0__) ___-__-__"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-zinc-600">{t.create.email}</label>
              <input
                className="mt-1 w-full rounded-md border border-zinc-200 px-3 py-2 text-sm outline-none focus:border-zinc-400"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                disabled={saving}
                placeholder="name@example.com"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-zinc-600">{t.create.company}</label>
              <input
                className="mt-1 w-full rounded-md border border-zinc-200 px-3 py-2 text-sm outline-none focus:border-zinc-400"
                value={companyName}
                onChange={(e) => setCompanyName(e.target.value)}
                disabled={saving}
                placeholder={t.create.companyPlaceholder}
                autoComplete="off"
              />
            </div>
          </div>

          <label className="mt-3 block text-xs font-medium text-zinc-600">{t.create.source}</label>
          <select
            className="mt-1 w-full rounded-md border border-zinc-200 px-3 py-2 text-sm outline-none focus:border-zinc-400"
            value={source}
            onChange={(e) => setSource(e.target.value as LeadSource)}
            disabled={saving}
          >
            {SOURCE_OPTIONS.map((s) => (
              <option key={s} value={s}>
                {t.sources[s]}
              </option>
            ))}
          </select>

          <label className="mt-3 block text-xs font-medium text-zinc-600">{t.create.message}</label>
          <textarea
            rows={3}
            className="mt-1 w-full rounded-md border border-zinc-200 px-3 py-2 text-sm outline-none focus:border-zinc-400"
            value={message}
            onChange={(e) => setMessage(e.target.value)}
            disabled={saving}
          />

          <div className="mt-4">
            <div className="mb-2 text-xs font-medium text-zinc-600">{t.create.products}</div>
            {createItems.length > 0 ? (
              <div className="mb-2 overflow-hidden rounded border border-zinc-200">
                <table className="w-full text-sm">
                  <tbody className="divide-y divide-zinc-100">
                    {createItems.map((it, idx) => (
                      <tr key={`${it.productId}-${idx}`}>
                        <td className="px-2 py-1.5">{it.productName ?? it.productId}</td>
                        <td className="px-2 py-1.5 text-right">{it.qty}</td>
                        <td className="px-2 py-1.5 text-right">{it.price.toFixed(2)}</td>
                        <td className="w-14 px-2 py-1.5">
                          <button
                            type="button"
                            onClick={() => removeItem(idx)}
                            className="text-xs text-zinc-500 hover:text-red-600"
                            disabled={saving}
                          >
                            ×
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
                  placeholder="…"
                  className="w-full rounded-md border border-zinc-200 px-2 py-1.5 text-sm"
                  value={productSearch}
                  onChange={(e) => setProductSearch(e.target.value)}
                  disabled={saving}
                />
                {productResults.length > 0 ? (
                  <ul className="mt-1 max-h-28 overflow-auto rounded border border-zinc-200 bg-white text-sm shadow">
                    {productResults.map((p) => (
                      <li key={p.id}>
                        <button
                          type="button"
                          className="flex w-full justify-between px-2 py-1 text-left hover:bg-zinc-50"
                          onClick={() => {
                            setSelectedProduct(p);
                            setProductSearch(p.name);
                            setProductResults([]);
                            setNewItemPrice(p.basePrice);
                          }}
                        >
                          <span>{p.name}</span>
                          <span className="text-xs text-zinc-500">{p.sku}</span>
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
                <label className="block text-[10px] text-zinc-500">₴</label>
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
                +
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
            {t.create.cancel}
          </button>
          <button
            type="button"
            onClick={() => void submit()}
            className="btn-primary"
            disabled={saving}
          >
            {saving ? t.create.submitting : t.create.submit}
          </button>
        </div>
      </div>
    </div>
  );
}

export default CreateLeadModal;

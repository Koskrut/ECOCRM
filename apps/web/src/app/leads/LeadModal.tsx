"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { EntityModalShell } from "@/components/modals/EntityModalShell";
import { FeedTabsScaffold } from "@/components/modals/FeedTabsScaffold";
import { EntitySection } from "@/components/sections/EntitySection";
import { apiHttp } from "@/lib/api/client";
import type { Lead, LeadItem, LeadStatus, LeadSource } from "@/lib/api";

type Props = {
  apiBaseUrl: string;
  leadId: string;
  onClose: () => void;
  onUpdated: () => void;
};

type ActivityItem = {
  id: string;
  type: string;
  title: string | null;
  body: string;
  occurredAt: string | null;
  createdAt: string;
};

type ContactSuggestion = {
  id: string;
  firstName: string;
  lastName: string;
  phone: string;
  email?: string | null;
};

export function LeadModal({ apiBaseUrl, leadId, onClose, onUpdated }: Props) {
  const [lead, setLead] = useState<Lead | null>(null);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);

  const [showConvertWizard, setShowConvertWizard] = useState(false);
  const [leadTab, setLeadTab] = useState<"main" | "products" | "activity">("main");

  const [saving, setSaving] = useState(false);
  const [statusUpdating, setStatusUpdating] = useState(false);

  const [editName, setEditName] = useState("");
  const [editPhone, setEditPhone] = useState("");
  const [editEmail, setEditEmail] = useState("");
  const [editCompanyName, setEditCompanyName] = useState("");
  const [editMessage, setEditMessage] = useState("");
  const [editSource, setEditSource] = useState<LeadSource>("OTHER");
  const [_editStatus, setEditStatus] = useState<LeadStatus>("NEW");

  const [timeline, setTimeline] = useState<ActivityItem[]>([]);
  const [timelineLoading, setTimelineLoading] = useState(false);
  const [timelineError, setTimelineError] = useState<string | null>(null);

  // Convert
  const [suggestions, setSuggestions] = useState<ContactSuggestion[]>([]);
  const [suggestionsLoading, setSuggestionsLoading] = useState(false);
  const [selectedContactId, setSelectedContactId] = useState<string | null>(null);

  const [createContact, setCreateContact] = useState(false);
  const [newContactFirstName, setNewContactFirstName] = useState("");
  const [newContactLastName, setNewContactLastName] = useState("");
  const [newContactPhone, setNewContactPhone] = useState("");
  const [newContactEmail, setNewContactEmail] = useState("");
  const [newContactCompanyName, setNewContactCompanyName] = useState("");

  const [createDeal, setCreateDeal] = useState(true);
  const [dealTitle, setDealTitle] = useState("");
  const [dealAmount, setDealAmount] = useState<number | undefined>(undefined);
  const [dealComment, setDealComment] = useState("");

  const [converting, setConverting] = useState(false);
  const [convertError, setConvertError] = useState<string | null>(null);
  const [createdOrderId, setCreatedOrderId] = useState<string | null>(null);

  // Товары лида (локальный список для редактирования)
  type EditItem = { productId: string; productName?: string; qty: number; price: number };
  const [editItems, setEditItems] = useState<EditItem[]>([]);
  const [productSearch, setProductSearch] = useState("");
  const [productResults, setProductResults] = useState<Array<{ id: string; name: string; sku: string; basePrice: number }>>([]);
  const [_productSearchLoading, setProductSearchLoading] = useState(false);
  const [selectedProduct, setSelectedProduct] = useState<{ id: string; name: string; sku: string; basePrice: number } | null>(null);
  const [newItemQty, setNewItemQty] = useState(1);
  const [newItemPrice, setNewItemPrice] = useState(0);
  const [savingItems, setSavingItems] = useState(false);

  const canClose = !saving && !converting && !statusUpdating;

  const title = useMemo(() => {
    if (!lead) return "Lead";
    return lead.name || lead.companyName || "Lead";
  }, [lead]);

  const loadLead = useCallback(async () => {
    setLoading(true);
    setErr(null);
    try {
      const r = await apiHttp.get<Lead>(`/leads/${leadId}`);
      const data = r.data as Lead;
      setLead(data);

      setEditName(data.name ?? "");
      setEditPhone(data.phone ?? "");
      setEditEmail(data.email ?? "");
      setEditCompanyName(data.companyName ?? "");
      setEditMessage(data.message ?? "");
      setEditSource(data.source);
      setEditStatus(data.status);

      const items = data.items ?? [];
      setEditItems(
        items.map((it: LeadItem) => ({
          productId: it.productId,
          productName: it.product?.name ?? undefined,
          qty: it.qty,
          price: it.price,
        })),
      );

      setNewContactFirstName(data.name ?? "");
      setNewContactPhone(data.phone ?? "");
      setNewContactEmail(data.email ?? "");
      setNewContactCompanyName(data.companyName ?? "");
    } catch (e) {
      const raw =
        (e as { response?: { data?: { message?: string } } })?.response?.data?.message ??
        (e instanceof Error ? e.message : "Failed to load lead");
      const msg = raw;
      setErr(msg);
      setLead(null);
    } finally {
      setLoading(false);
    }
  }, [leadId]);

  // Поиск продуктов для добавления товара
  useEffect(() => {
    if (!productSearch.trim()) {
      setProductResults([]);
      return;
    }
    let alive = true;
    const t = setTimeout(async () => {
      setProductSearchLoading(true);
      try {
        const r = await fetch(
          `${apiBaseUrl}/products?search=${encodeURIComponent(productSearch)}&page=1&pageSize=10`,
          { cache: "no-store" },
        );
        if (!r.ok) throw new Error("Failed to load products");
        const data = (await r.json()) as { items?: Array<{ id: string; name: string; sku: string; basePrice: number }> };
        if (alive) setProductResults(data.items ?? []);
      } catch {
        if (alive) setProductResults([]);
      } finally {
        if (alive) setProductSearchLoading(false);
      }
    }, 300);
    return () => {
      alive = false;
      clearTimeout(t);
    };
  }, [apiBaseUrl, productSearch]);

  const saveItems = useCallback(async () => {
    if (!lead) return;
    setSavingItems(true);
    setErr(null);
    try {
      await apiHttp.patch<Lead>(`/leads/${lead.id}`, {
        items: editItems.map((it) => ({ productId: it.productId, qty: it.qty, price: it.price })),
      });
      await loadLead();
      onUpdated();
    } catch (e) {
      const msg =
        (e as { response?: { data?: { message?: string } } })?.response?.data?.message ??
        (e instanceof Error ? e.message : "Failed to save items");
      setErr(msg);
    } finally {
      setSavingItems(false);
    }
  }, [lead, editItems, loadLead, onUpdated]);

  const addItemToLead = () => {
    if (!selectedProduct || newItemQty < 1 || newItemPrice < 0) return;
    setEditItems((prev) => [
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

  const removeItemFromLead = (index: number) => {
    setEditItems((prev) => prev.filter((_, i) => i !== index));
  };

  const loadTimeline = useCallback(async () => {
    if (!lead) return;
    setTimelineLoading(true);
    setTimelineError(null);
    try {
      const r = await apiHttp.get<{ items: ActivityItem[] }>(
        `/orders/${lead.contactId ?? ""}/activities`,
      );
      setTimeline(Array.isArray(r.data?.items) ? r.data.items : []);
    } catch (e) {
      setTimeline([]);
      setTimelineError(
        e instanceof Error ? e.message : "Failed to load lead activity",
      );
    } finally {
      setTimelineLoading(false);
    }
  }, [lead]);

  const loadSuggestions = useCallback(async () => {
    setSuggestionsLoading(true);
    setSuggestions([]);
    try {
      const r = await apiHttp.get<{ items: ContactSuggestion[] }>(
        `/leads/${leadId}/suggest-contact`,
      );
      setSuggestions(Array.isArray(r.data?.items) ? r.data.items : []);
    } catch {
      setSuggestions([]);
    } finally {
      setSuggestionsLoading(false);
    }
  }, [leadId]);

  useEffect(() => {
    void loadLead();
  }, [loadLead]);

  useEffect(() => {
    if (lead) void loadTimeline();
  }, [lead, loadTimeline]);

  const saveGeneral = async () => {
    if (!lead) return;
    setSaving(true);
    setErr(null);
    try {
      await apiHttp.patch<Lead>(`/leads/${lead.id}`, {
        name: editName.trim() || null,
        phone: editPhone.trim() || null,
        email: editEmail.trim() || null,
        companyName: editCompanyName.trim() || null,
        message: editMessage.trim() || null,
        sourceMeta: lead.sourceMeta ?? null,
      });
      await loadLead();
      onUpdated();
    } catch (e) {
      const msg =
        (e as { response?: { data?: { message?: string } } })?.response?.data?.message ??
        (e instanceof Error ? e.message : "Failed to save");
      setErr(msg);
    } finally {
      setSaving(false);
    }
  };

  const updateStatus = async (next: LeadStatus, reason?: string) => {
    if (!lead) return;
    setStatusUpdating(true);
    setErr(null);
    try {
      await apiHttp.patch<Lead>(`/leads/${lead.id}/status`, {
        status: next,
        reason: reason ?? undefined,
      });
      await loadLead();
      onUpdated();
    } catch (e) {
      const msg =
        (e as { response?: { data?: { message?: string } } })?.response?.data?.message ??
        (e instanceof Error ? e.message : "Failed to update status");
      setErr(msg);
    } finally {
      setStatusUpdating(false);
    }
  };

  const handleConvert = async () => {
    if (!lead) return;
    setConverting(true);
    setConvertError(null);
    try {
      const hasSelectedContact = !!selectedContactId;
      const mode = hasSelectedContact || !createContact ? "link" : "create";

      const payload: any = {
        contactMode: mode,
        createDeal,
      };

      if (mode === "link") {
        if (!selectedContactId) {
          throw new Error("Select a contact or enable create contact");
        }
        payload.contactId = selectedContactId;
      } else {
        payload.contact = {
          firstName: newContactFirstName.trim() || lead.name || "Lead",
          lastName: newContactLastName.trim() || "",
          phone: newContactPhone.trim() || lead.phone,
          email: newContactEmail.trim() || lead.email,
          companyName: newContactCompanyName.trim() || lead.companyName,
        };
      }

      if (createDeal) {
        payload.deal = {
          title: dealTitle.trim() || title,
          amount: typeof dealAmount === "number" ? dealAmount : undefined,
          comment: dealComment.trim() || undefined,
        };
      }

      const res = await apiHttp.post<{ lead: Lead; contact: unknown; deal?: { id?: string; orderNumber?: string } }>(
        `/leads/${lead.id}/convert`,
        payload,
      );
      const dealId = res.data?.deal && typeof res.data.deal === "object" && "id" in res.data.deal
        ? String((res.data.deal as { id: string }).id)
        : null;
      if (dealId) setCreatedOrderId(dealId);
      await loadLead();
      onUpdated();
      setShowConvertWizard(false);
    } catch (e) {
      const msg =
        (e as { response?: { data?: { message?: string } } })?.response?.data?.message ??
        (e instanceof Error ? e.message : "Conversion failed");
      setConvertError(msg);
    } finally {
      setConverting(false);
    }
  };

  const canConvert = lead?.status === "WON";

  const handleEscape = useCallback(() => {
    if (showConvertWizard) {
      setShowConvertWizard(false);
      return true;
    }
    return false;
  }, [showConvertWizard]);

  const openConvertWizard = () => {
    setShowConvertWizard(true);
    setCreatedOrderId(null);
    void loadSuggestions();
  };

  const timelineContent = (
    <div>
      {timelineLoading ? (
        <div className="text-sm text-zinc-500">Loading timeline…</div>
      ) : timelineError ? (
        <div className="rounded-md border border-red-200 bg-red-50 p-3 text-sm text-red-700">{timelineError}</div>
      ) : timeline.length === 0 ? (
        <div className="text-sm text-zinc-500">No activity yet</div>
      ) : (
        <div className="space-y-3">
          {timeline.map((t) => (
            <div key={t.id} className="rounded-md border border-zinc-200 bg-white p-3 text-sm">
              <div className="flex items-start justify-between gap-2">
                <div>
                  <div className="text-xs text-zinc-500">{t.type}</div>
                  <div className="font-medium text-zinc-900">{t.title || "No title"}</div>
                </div>
                <div className="text-xs text-zinc-500 whitespace-nowrap">
                  {new Date(t.occurredAt ?? t.createdAt).toLocaleString()}
                </div>
              </div>
              <div className="mt-2 whitespace-pre-wrap text-sm text-zinc-800">{t.body}</div>
            </div>
          ))}
        </div>
      )}
    </div>
  );

  const leftContent = loading ? (
    <div className="text-sm text-zinc-500">Loading…</div>
  ) : err ? (
    <div className="rounded-md border border-red-200 bg-red-50 p-3 text-sm text-red-700">{err}</div>
  ) : !lead ? (
    <div className="text-sm text-zinc-500">Lead not found</div>
  ) : leadTab === "activity" ? (
    <EntitySection title="Activity">{timelineContent}</EntitySection>
  ) : leadTab === "products" ? (
    <EntitySection title="Products">
      <div className="rounded-md border border-zinc-200 overflow-hidden">
        <table className="w-full text-sm">
          <thead>
            <tr className="bg-zinc-50 border-b border-zinc-200">
              <th className="px-3 py-2 text-left">Product</th>
              <th className="px-3 py-2 text-right">Qty</th>
              <th className="px-3 py-2 text-right">Price</th>
              <th className="px-3 py-2 text-right">Total</th>
              <th className="w-8" />
            </tr>
          </thead>
          <tbody className="divide-y divide-zinc-100">
            {editItems.length === 0 ? (
              <tr>
                <td className="px-3 py-3 text-zinc-500" colSpan={5}>
                  No products
                </td>
              </tr>
            ) : (
              editItems.map((it, idx) => (
                <tr key={`${it.productId}-${idx}`}>
                  <td className="px-3 py-2">{it.productName ?? it.productId}</td>
                  <td className="px-3 py-2 text-right">{it.qty}</td>
                  <td className="px-3 py-2 text-right">{it.price.toFixed(2)}</td>
                  <td className="px-3 py-2 text-right font-medium">{(it.qty * it.price).toFixed(2)}</td>
                  <td className="px-1 py-2">
                    <button
                      type="button"
                      onClick={() => removeItemFromLead(idx)}
                      className="rounded border border-zinc-200 px-2 py-0.5 text-xs text-zinc-600 hover:bg-zinc-100"
                      disabled={savingItems}
                    >
                      Remove
                    </button>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
      <div className="mt-2 flex flex-wrap items-end gap-2">
        <div className="min-w-[200px]">
          <input
            type="text"
            placeholder="Search product…"
            className="w-full rounded-md border border-zinc-200 px-2 py-1.5 text-sm"
            value={productSearch}
            onChange={(e) => setProductSearch(e.target.value)}
            disabled={savingItems}
          />
          {productResults.length > 0 ? (
            <ul className="mt-1 max-h-32 overflow-auto rounded border border-zinc-200 bg-white shadow">
              {productResults.map((p) => (
                <li key={p.id}>
                  <button
                    type="button"
                    className="w-full px-2 py-1.5 text-left text-sm hover:bg-zinc-50 flex justify-between"
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
        <div className="w-16">
          <label className="block text-[10px] text-zinc-500">Qty</label>
          <input
            type="number"
            min={1}
            className="w-full rounded-md border border-zinc-200 px-2 py-1.5 text-sm"
            value={newItemQty}
            onChange={(e) => setNewItemQty(Math.max(1, parseInt(e.target.value, 10) || 1))}
            disabled={savingItems}
          />
        </div>
        <div className="w-24">
          <label className="block text-[10px] text-zinc-500">Price</label>
          <input
            type="number"
            min={0}
            step={0.01}
            className="w-full rounded-md border border-zinc-200 px-2 py-1.5 text-sm"
            value={newItemPrice}
            onChange={(e) => setNewItemPrice(parseFloat(e.target.value) || 0)}
            disabled={savingItems}
          />
        </div>
        <button
          type="button"
          onClick={addItemToLead}
          disabled={!selectedProduct || savingItems}
          className="rounded-md border border-zinc-300 px-3 py-1.5 text-sm font-medium text-zinc-700 hover:bg-zinc-50 disabled:opacity-50"
        >
          Add
        </button>
        <button
          type="button"
          onClick={() => void saveItems()}
          disabled={savingItems || editItems.length === 0}
          className="btn-primary py-1.5"
        >
          {savingItems ? "Saving…" : "Save items"}
        </button>
      </div>
    </EntitySection>
  ) : (
    <div className="grid gap-6 md:grid-cols-2">
      <div>
                <label className="block text-xs font-medium text-zinc-600">Name</label>
                <input
                  className="mt-1 w-full rounded-md border border-zinc-200 px-3 py-2 text-sm outline-none focus:border-zinc-400"
                  value={editName}
                  onChange={(e) => setEditName(e.target.value)}
                  disabled={saving}
                />

                <label className="mt-3 block text-xs font-medium text-zinc-600">Phone</label>
                <input
                  className="mt-1 w-full rounded-md border border-zinc-200 px-3 py-2 text-sm outline-none focus:border-zinc-400"
                  value={editPhone}
                  onChange={(e) => setEditPhone(e.target.value)}
                  disabled={saving}
                />

                <label className="mt-3 block text-xs font-medium text-zinc-600">Email</label>
                <input
                  className="mt-1 w-full rounded-md border border-zinc-200 px-3 py-2 text-sm outline-none focus:border-zinc-400"
                  value={editEmail}
                  onChange={(e) => setEditEmail(e.target.value)}
                  disabled={saving}
                />

                <label className="mt-3 block text-xs font-medium text-zinc-600">
                  Company (text)
                </label>
                <input
                  className="mt-1 w-full rounded-md border border-zinc-200 px-3 py-2 text-sm outline-none focus:border-zinc-400"
                  value={editCompanyName}
                  onChange={(e) => setEditCompanyName(e.target.value)}
                  disabled={saving}
                />

                <label className="mt-3 block text-xs font-medium text-zinc-600">Source</label>
                <select
                  className="mt-1 w-full rounded-md border border-zinc-200 px-3 py-2 text-sm outline-none focus:border-zinc-400"
                  value={editSource}
                  onChange={(e) => setEditSource(e.target.value as LeadSource)}
                  disabled={saving}
                >
                  <option value="FACEBOOK">Facebook</option>
                  <option value="TELEGRAM">Telegram</option>
                  <option value="INSTAGRAM">Instagram</option>
                  <option value="WEBSITE">Website</option>
                  <option value="OTHER">Other</option>
                </select>

                <div className="mt-4 flex gap-2">
                  <button
                    type="button"
                    onClick={() => void saveGeneral()}
                    disabled={saving}
                    className="btn-primary"
                  >
                    {saving ? "Saving…" : "Save"}
                  </button>
                </div>
              </div>

              <div>
                <label className="block text-xs font-medium text-zinc-600">
                  Message / comment
                </label>
                <textarea
                  rows={6}
                  className="mt-1 w-full rounded-md border border-zinc-200 px-3 py-2 text-sm outline-none focus:border-zinc-400"
                  value={editMessage}
                  onChange={(e) => setEditMessage(e.target.value)}
                  disabled={saving}
                />

                <div className="mt-4 text-xs text-zinc-500">
                  Created: {new Date(lead.createdAt).toLocaleString()}
                  <br />
                  Updated: {new Date(lead.updatedAt).toLocaleString()}
                  {lead.lastActivityAt ? (
                    <>
                      <br />
                      Last activity: {new Date(lead.lastActivityAt).toLocaleString()}
                    </>
                  ) : null}
                  {lead.statusReason ? (
                    <>
                      <br />
                      Status reason: {lead.statusReason}
                    </>
                  ) : null}
                </div>
              </div>
            </div>
  );

  const rightContent = showConvertWizard ? (
    <div className="space-y-6 rounded-lg border border-zinc-200 bg-zinc-50/50 p-4">
              <div className="rounded-md border border-zinc-200 bg-zinc-50 p-3 text-sm">
                <div className="flex items-center justify-between">
                  <div className="font-medium text-zinc-900">Step 1. Contact</div>
                  <button
                    type="button"
                    onClick={() => void loadSuggestions()}
                    className="rounded-md border border-zinc-200 px-2 py-1 text-xs text-zinc-700 hover:bg-white"
                  >
                    Refresh search
                  </button>
                </div>

                <div className="mt-3 space-y-2">
                  {suggestionsLoading ? (
                    <div className="text-xs text-zinc-500">Searching for contacts…</div>
                  ) : suggestions.length === 0 ? (
                    <div className="text-xs text-zinc-500">
                      No contacts found by phone/email — you can create a new one.
                    </div>
                  ) : (
                    <>
                      <div className="text-xs text-zinc-500">Possible matches:</div>
                      <div className="space-y-1">
                        {suggestions.map((c) => {
                          const active = selectedContactId === c.id;
                          return (
                            <button
                              key={c.id}
                              type="button"
                              onClick={() => {
                                setSelectedContactId(c.id);
                                setCreateContact(false);
                              }}
                              className={`w-full rounded-md border px-3 py-2 text-left text-xs ${
                                active
                                  ? "border-zinc-900 bg-zinc-900/5"
                                  : "border-zinc-200 hover:bg-white"
                              }`}
                            >
                              <div className="font-medium text-zinc-900">
                                {c.firstName} {c.lastName}
                              </div>
                              <div className="text-xs text-zinc-500">
                                {c.phone} {c.email ? `• ${c.email}` : ""}
                              </div>
                            </button>
                          );
                        })}
                      </div>
                    </>
                  )}
                </div>

                <div className="mt-3 flex items-center gap-2">
                  <input
                    id="createContact"
                    type="checkbox"
                    checked={createContact}
                    onChange={(e) => {
                      setCreateContact(e.target.checked);
                      if (e.target.checked) setSelectedContactId(null);
                    }}
                  />
                  <label htmlFor="createContact" className="text-xs text-zinc-700">
                    Create new contact instead of linking
                  </label>
                </div>

                {createContact && (
                  <div className="mt-3 grid gap-2 md:grid-cols-2">
                    <div>
                      <label className="block text-xs font-medium text-zinc-600">
                        First name
                      </label>
                      <input
                        className="mt-1 w-full rounded-md border border-zinc-200 px-2 py-1.5 text-xs outline-none focus:border-zinc-400"
                        value={newContactFirstName}
                        onChange={(e) => setNewContactFirstName(e.target.value)}
                      />
                    </div>
                    <div>
                      <label className="block text-xs font-medium text-zinc-600">
                        Last name
                      </label>
                      <input
                        className="mt-1 w-full rounded-md border border-zinc-200 px-2 py-1.5 text-xs outline-none focus:border-zinc-400"
                        value={newContactLastName}
                        onChange={(e) => setNewContactLastName(e.target.value)}
                      />
                    </div>
                    <div>
                      <label className="block text-xs font-medium text-zinc-600">
                        Phone
                      </label>
                      <input
                        className="mt-1 w-full rounded-md border border-zinc-200 px-2 py-1.5 text-xs outline-none focus:border-zinc-400"
                        value={newContactPhone}
                        onChange={(e) => setNewContactPhone(e.target.value)}
                      />
                    </div>
                    <div>
                      <label className="block text-xs font-medium text-zinc-600">
                        Email
                      </label>
                      <input
                        className="mt-1 w-full rounded-md border border-zinc-200 px-2 py-1.5 text-xs outline-none focus:border-zinc-400"
                        value={newContactEmail}
                        onChange={(e) => setNewContactEmail(e.target.value)}
                      />
                    </div>
                    <div className="md:col-span-2">
                      <label className="block text-xs font-medium text-zinc-600">
                        Company (text)
                      </label>
                      <input
                        className="mt-1 w-full rounded-md border border-zinc-200 px-2 py-1.5 text-xs outline-none focus:border-zinc-400"
                        value={newContactCompanyName}
                        onChange={(e) => setNewContactCompanyName(e.target.value)}
                      />
                    </div>
                  </div>
                )}
              </div>

              <div className="rounded-md border border-zinc-200 bg-zinc-50 p-3 text-sm">
                <div className="flex items-center justify-between">
                  <div className="font-medium text-zinc-900">Step 2. Deal</div>
                  <label className="flex items-center gap-2 text-xs text-zinc-700">
                    <input
                      type="checkbox"
                      checked={createDeal}
                      onChange={(e) => setCreateDeal(e.target.checked)}
                    />
                    Create order from this lead
                  </label>
                </div>

                {createDeal && (
                  <div className="mt-3 grid gap-2 md:grid-cols-2">
                    <div className="md:col-span-2">
                      <label className="block text-xs font-medium text-zinc-600">
                        Deal title
                      </label>
                      <input
                        className="mt-1 w-full rounded-md border border-zinc-200 px-2 py-1.5 text-xs outline-none focus:border-zinc-400"
                        value={dealTitle}
                        onChange={(e) => setDealTitle(e.target.value)}
                        placeholder={title}
                      />
                    </div>
                    <div>
                      <label className="block text-xs font-medium text-zinc-600">
                        Amount
                      </label>
                      <input
                        type="number"
                        min={0}
                        className="mt-1 w-full rounded-md border border-zinc-200 px-2 py-1.5 text-xs outline-none focus:border-zinc-400"
                        value={dealAmount ?? ""}
                        onChange={(e) =>
                          setDealAmount(
                            e.target.value === "" ? undefined : Number(e.target.value),
                          )
                        }
                      />
                    </div>
                    <div className="md:col-span-2">
                      <label className="block text-xs font-medium text-zinc-600">
                        Comment
                      </label>
                      <textarea
                        rows={3}
                        className="mt-1 w-full rounded-md border border-zinc-200 px-2 py-1.5 text-xs outline-none focus:border-zinc-400"
                        value={dealComment}
                        onChange={(e) => setDealComment(e.target.value)}
                      />
                    </div>
                  </div>
                )}
              </div>

              {createdOrderId && (
                <div className="rounded-md border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-800">
                  Conversion complete. Order created.{" "}
                  <a
                    href={`/orders?orderId=${createdOrderId}`}
                    className="font-medium underline hover:no-underline"
                  >
                    Open order →
                  </a>
                </div>
              )}

              {convertError && (
                <div className="rounded-md border border-red-200 bg-red-50 p-3 text-xs text-red-700">
                  {convertError}
                </div>
              )}

              <div className="flex justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setShowConvertWizard(false)}
                  className="rounded-md border border-zinc-200 px-3 py-2 text-sm text-zinc-700 hover:bg-white"
                  disabled={converting}
                >
                  Close
                </button>
                <button
                  type="button"
                  onClick={() => void handleConvert()}
                  disabled={converting}
                  className="btn-primary"
                >
                  {converting ? "Converting…" : "Convert"}
                </button>
              </div>
    </div>
  ) : lead && leadTab === "main" ? (
    <FeedTabsScaffold activityContent={timelineContent} />
  ) : null;

  const tabsUnderHeader =
    lead ? (
      <div className="flex gap-1 border-b border-zinc-200 pb-2">
        <button
          type="button"
          onClick={() => setLeadTab("main")}
          className={`rounded px-2 py-1 text-sm font-medium ${leadTab === "main" ? "bg-accent-gradient text-white" : "text-zinc-600 hover:bg-zinc-100"}`}
        >
          Main
        </button>
        <button
          type="button"
          onClick={() => setLeadTab("products")}
          className={`rounded px-2 py-1 text-sm font-medium ${leadTab === "products" ? "bg-accent-gradient text-white" : "text-zinc-600 hover:bg-zinc-100"}`}
        >
          Products
        </button>
        <button
          type="button"
          onClick={() => setLeadTab("activity")}
          className={`rounded px-2 py-1 text-sm font-medium ${leadTab === "activity" ? "bg-accent-gradient text-white" : "text-zinc-600 hover:bg-zinc-100"}`}
        >
          Activity
        </button>
      </div>
    ) : null;

  return (
    <EntityModalShell
      title={title}
      subtitle={
        lead ? (
          <>
            Status: {lead.status} • Source: {lead.source}
          </>
        ) : undefined
      }
      tabsUnderHeader={tabsUnderHeader}
      headerActions={
        <>
          {lead && (
            <>
              <button
                type="button"
                className="rounded-md border border-zinc-200 px-2 py-1 text-xs text-zinc-700 hover:bg-white"
                disabled={statusUpdating}
                onClick={() => void updateStatus("IN_PROGRESS")}
              >
                In progress
              </button>
              <button
                type="button"
                className="rounded-md border border-emerald-200 bg-emerald-50 px-2 py-1 text-xs text-emerald-700 hover:bg-emerald-100"
                disabled={statusUpdating}
                onClick={() => void updateStatus("WON")}
              >
                Won
              </button>
              <button
                type="button"
                className="rounded-md border border-zinc-200 px-2 py-1 text-xs text-zinc-700 hover:bg-white"
                disabled={statusUpdating}
                onClick={() => void updateStatus("NOT_TARGET", "Not target")}
              >
                Not target
              </button>
              <button
                type="button"
                className="rounded-md border border-red-200 bg-red-50 px-2 py-1 text-xs text-red-700 hover:bg-red-100"
                disabled={statusUpdating}
                onClick={() => void updateStatus("LOST", "Lost")}
              >
                Lost
              </button>
              {canConvert && (
                <button
                  type="button"
                  onClick={openConvertWizard}
                  className="rounded-md border border-zinc-300 bg-white px-2 py-1 text-xs text-zinc-700 hover:bg-zinc-50"
                >
                  Convert
                </button>
              )}
            </>
          )}
        </>
      }
      left={leftContent}
      right={rightContent}
      footer={
        lead ? (
          <div className="text-xs text-zinc-500">
            ID: <span className="font-mono">{lead.id}</span>
          </div>
        ) : null
      }
      canClose={canClose}
      onClose={onClose}
      onEscape={handleEscape}
    />
  );
}

export default LeadModal;


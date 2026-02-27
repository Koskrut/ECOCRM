"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { apiHttp } from "@/lib/api/client";
import type { Lead, LeadItem, LeadStatus, LeadSource } from "@/lib/api";

type Props = {
  apiBaseUrl: string;
  leadId: string;
  onClose: () => void;
  onUpdated: () => void;
};

type TabKey = "general" | "timeline" | "convert";

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

  const [tab, setTab] = useState<TabKey>("general");

  const [saving, setSaving] = useState(false);
  const [statusUpdating, setStatusUpdating] = useState(false);

  const [editName, setEditName] = useState("");
  const [editPhone, setEditPhone] = useState("");
  const [editEmail, setEditEmail] = useState("");
  const [editCompanyName, setEditCompanyName] = useState("");
  const [editMessage, setEditMessage] = useState("");
  const [editSource, setEditSource] = useState<LeadSource>("OTHER");
  const [editStatus, setEditStatus] = useState<LeadStatus>("NEW");

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
  const [productSearchLoading, setProductSearchLoading] = useState(false);
  const [selectedProduct, setSelectedProduct] = useState<{ id: string; name: string; sku: string; basePrice: number } | null>(null);
  const [newItemQty, setNewItemQty] = useState(1);
  const [newItemPrice, setNewItemPrice] = useState(0);
  const [savingItems, setSavingItems] = useState(false);

  const canClose = !saving && !converting && !statusUpdating;

  const title = useMemo(() => {
    if (!lead) return "Лид";
    return lead.name || lead.companyName || "Лид";
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
        (e instanceof Error ? e.message : "Не удалось загрузить лид");
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
        (e instanceof Error ? e.message : "Не удалось сохранить товары");
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
        e instanceof Error ? e.message : "Не удалось загрузить активность лида",
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
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return;
      if (canClose) onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [canClose, onClose]);

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
        (e instanceof Error ? e.message : "Не удалось сохранить");
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
        (e instanceof Error ? e.message : "Не удалось обновить статус");
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
          throw new Error("Выберите контакт или включите создание контакта");
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
      setTab("general");
    } catch (e) {
      const msg =
        (e as { response?: { data?: { message?: string } } })?.response?.data?.message ??
        (e instanceof Error ? e.message : "Ошибка конвертации");
      setConvertError(msg);
    } finally {
      setConverting(false);
    }
  };

  const showConvertTab = lead?.status === "WON";

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 px-4"
      role="presentation"
      onClick={() => canClose && onClose()}
    >
      <div
        className="max-h-[90vh] w-full max-w-5xl overflow-hidden rounded-xl bg-white shadow-xl"
        onClick={(e) => e.stopPropagation()}
        role="presentation"
      >
        <div className="flex items-center justify-between border-b border-zinc-200 px-5 py-4">
          <div>
            <div className="text-base font-semibold text-zinc-900">{title}</div>
            {lead ? (
              <div className="mt-0.5 text-xs text-zinc-500">
                Статус: {lead.status} • Источник: {lead.source}
              </div>
            ) : null}
          </div>
          <button
            type="button"
            onClick={() => canClose && onClose()}
            className="rounded-md border border-zinc-200 px-2 py-1 text-sm text-zinc-700 hover:bg-zinc-50"
            disabled={!canClose}
          >
            ✕
          </button>
        </div>

        <div className="border-b border-zinc-200 px-5">
          <div className="flex gap-6">
            <button
              type="button"
              onClick={() => setTab("general")}
              className={`-mb-px border-b-2 py-3 text-sm font-medium ${
                tab === "general"
                  ? "border-zinc-900 text-zinc-900"
                  : "border-transparent text-zinc-500 hover:text-zinc-700"
              }`}
            >
              Основное
            </button>
            <button
              type="button"
              onClick={() => {
                setTab("timeline");
                void loadTimeline();
              }}
              className={`-mb-px border-b-2 py-3 text-sm font-medium ${
                tab === "timeline"
                  ? "border-zinc-900 text-zinc-900"
                  : "border-transparent text-zinc-500 hover:text-zinc-700"
              }`}
            >
              Таймлайн
            </button>
            <button
              type="button"
              onClick={() => {
                setTab("convert");
                setCreatedOrderId(null);
                void loadSuggestions();
              }}
              className={`-mb-px border-b-2 py-3 text-sm font-medium ${
                tab === "convert"
                  ? "border-zinc-900 text-zinc-900"
                  : "border-transparent text-zinc-500 hover:text-zinc-700"
              }`}
            >
              Конвертация
            </button>
          </div>
        </div>

        <div className="min-h-[320px] max-h-[70vh] overflow-auto p-5">
          {loading ? (
            <div className="text-sm text-zinc-500">Загрузка…</div>
          ) : err ? (
            <div className="rounded-md border border-red-200 bg-red-50 p-3 text-sm text-red-700">
              {err}
            </div>
          ) : !lead ? (
            <div className="text-sm text-zinc-500">Лид не найден</div>
          ) : tab === "general" ? (
            <div className="grid gap-6 md:grid-cols-2">
              <div>
                <label className="block text-xs font-medium text-zinc-600">Имя</label>
                <input
                  className="mt-1 w-full rounded-md border border-zinc-200 px-3 py-2 text-sm outline-none focus:border-zinc-400"
                  value={editName}
                  onChange={(e) => setEditName(e.target.value)}
                  disabled={saving}
                />

                <label className="mt-3 block text-xs font-medium text-zinc-600">Телефон</label>
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
                  Компания (текст)
                </label>
                <input
                  className="mt-1 w-full rounded-md border border-zinc-200 px-3 py-2 text-sm outline-none focus:border-zinc-400"
                  value={editCompanyName}
                  onChange={(e) => setEditCompanyName(e.target.value)}
                  disabled={saving}
                />

                <label className="mt-3 block text-xs font-medium text-zinc-600">Источник</label>
                <select
                  className="mt-1 w-full rounded-md border border-zinc-200 px-3 py-2 text-sm outline-none focus:border-zinc-400"
                  value={editSource}
                  onChange={(e) => setEditSource(e.target.value as LeadSource)}
                  disabled={saving}
                >
                  <option value="FACEBOOK">Facebook</option>
                  <option value="TELEGRAM">Telegram</option>
                  <option value="INSTAGRAM">Instagram</option>
                  <option value="WEBSITE">Сайт</option>
                  <option value="OTHER">Другое</option>
                </select>

                <div className="mt-4 flex gap-2">
                  <button
                    type="button"
                    onClick={() => void saveGeneral()}
                    disabled={saving}
                    className="rounded-md bg-zinc-900 px-3 py-2 text-sm font-medium text-white hover:bg-zinc-800 disabled:opacity-60"
                  >
                    {saving ? "Сохранение…" : "Сохранить"}
                  </button>
                </div>
              </div>

              <div>
                <label className="block text-xs font-medium text-zinc-600">
                  Сообщение / комментарий
                </label>
                <textarea
                  rows={6}
                  className="mt-1 w-full rounded-md border border-zinc-200 px-3 py-2 text-sm outline-none focus:border-zinc-400"
                  value={editMessage}
                  onChange={(e) => setEditMessage(e.target.value)}
                  disabled={saving}
                />

                <div className="mt-6">
                  <div className="text-xs font-medium text-zinc-600 mb-2">Товары</div>
                  <div className="rounded-md border border-zinc-200 overflow-hidden">
                    <table className="w-full text-sm">
                      <thead>
                        <tr className="bg-zinc-50 border-b border-zinc-200">
                          <th className="px-3 py-2 text-left">Товар</th>
                          <th className="px-3 py-2 text-right">Кол.</th>
                          <th className="px-3 py-2 text-right">Цена</th>
                          <th className="px-3 py-2 text-right">Сумма</th>
                          <th className="w-8" />
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-zinc-100">
                        {editItems.length === 0 ? (
                          <tr>
                            <td className="px-3 py-3 text-zinc-500" colSpan={5}>
                              Нет товаров
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
                                  Удалить
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
                        placeholder="Поиск товара…"
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
                      <label className="block text-[10px] text-zinc-500">Кол.</label>
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
                      <label className="block text-[10px] text-zinc-500">Цена</label>
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
                      Добавить
                    </button>
                    <button
                      type="button"
                      onClick={() => void saveItems()}
                      disabled={savingItems || editItems.length === 0}
                      className="rounded-md bg-zinc-900 px-3 py-1.5 text-sm font-medium text-white hover:bg-zinc-800 disabled:opacity-50"
                    >
                      {savingItems ? "Сохранение…" : "Сохранить товары"}
                    </button>
                  </div>
                </div>

                <div className="mt-4 text-xs text-zinc-500">
                  Создан: {new Date(lead.createdAt).toLocaleString()}
                  <br />
                  Обновлён: {new Date(lead.updatedAt).toLocaleString()}
                  {lead.lastActivityAt ? (
                    <>
                      <br />
                      Последняя активность: {new Date(lead.lastActivityAt).toLocaleString()}
                    </>
                  ) : null}
                  {lead.statusReason ? (
                    <>
                      <br />
                      Причина статуса: {lead.statusReason}
                    </>
                  ) : null}
                </div>
              </div>
            </div>
          ) : tab === "timeline" ? (
            <div>
              {timelineLoading ? (
                <div className="text-sm text-zinc-500">Загрузка таймлайна…</div>
              ) : timelineError ? (
                <div className="rounded-md border border-red-200 bg-red-50 p-3 text-sm text-red-700">
                  {timelineError}
                </div>
              ) : timeline.length === 0 ? (
                <div className="text-sm text-zinc-500">Пока нет активности</div>
              ) : (
                <div className="space-y-3">
                  {timeline.map((t) => (
                    <div
                      key={t.id}
                      className="rounded-md border border-zinc-200 bg-white p-3 text-sm"
                    >
                      <div className="flex items-start justify-between gap-2">
                        <div>
                          <div className="text-xs text-zinc-500">{t.type}</div>
                          <div className="font-medium text-zinc-900">
                            {t.title || "Без заголовка"}
                          </div>
                        </div>
                        <div className="text-xs text-zinc-500 whitespace-nowrap">
                          {new Date(t.occurredAt ?? t.createdAt).toLocaleString()}
                        </div>
                      </div>
                      <div className="mt-2 whitespace-pre-wrap text-sm text-zinc-800">
                        {t.body}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          ) : (
            <div className="space-y-6">
              <div className="rounded-md border border-zinc-200 bg-zinc-50 p-3 text-sm">
                <div className="flex items-center justify-between">
                  <div className="font-medium text-zinc-900">Шаг 1. Контакт</div>
                  <button
                    type="button"
                    onClick={() => void loadSuggestions()}
                    className="rounded-md border border-zinc-200 px-2 py-1 text-xs text-zinc-700 hover:bg-white"
                  >
                    Обновить поиск
                  </button>
                </div>

                <div className="mt-3 space-y-2">
                  {suggestionsLoading ? (
                    <div className="text-xs text-zinc-500">Поиск возможных контактов…</div>
                  ) : suggestions.length === 0 ? (
                    <div className="text-xs text-zinc-500">
                      Контакты по телефону/email не найдены — можно создать новый.
                    </div>
                  ) : (
                    <>
                      <div className="text-xs text-zinc-500">Возможные совпадения:</div>
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
                    Создать новый контакт вместо привязки
                  </label>
                </div>

                {createContact && (
                  <div className="mt-3 grid gap-2 md:grid-cols-2">
                    <div>
                      <label className="block text-xs font-medium text-zinc-600">
                        Имя
                      </label>
                      <input
                        className="mt-1 w-full rounded-md border border-zinc-200 px-2 py-1.5 text-xs outline-none focus:border-zinc-400"
                        value={newContactFirstName}
                        onChange={(e) => setNewContactFirstName(e.target.value)}
                      />
                    </div>
                    <div>
                      <label className="block text-xs font-medium text-zinc-600">
                        Фамилия
                      </label>
                      <input
                        className="mt-1 w-full rounded-md border border-zinc-200 px-2 py-1.5 text-xs outline-none focus:border-zinc-400"
                        value={newContactLastName}
                        onChange={(e) => setNewContactLastName(e.target.value)}
                      />
                    </div>
                    <div>
                      <label className="block text-xs font-medium text-zinc-600">
                        Телефон
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
                        Компания (текст)
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
                  <div className="font-medium text-zinc-900">Шаг 2. Сделка</div>
                  <label className="flex items-center gap-2 text-xs text-zinc-700">
                    <input
                      type="checkbox"
                      checked={createDeal}
                      onChange={(e) => setCreateDeal(e.target.checked)}
                    />
                    Создать заказ по этому лиду
                  </label>
                </div>

                {createDeal && (
                  <div className="mt-3 grid gap-2 md:grid-cols-2">
                    <div className="md:col-span-2">
                      <label className="block text-xs font-medium text-zinc-600">
                        Название сделки
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
                        Сумма
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
                        Комментарий
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
                  Конвертация выполнена. Заказ создан.{" "}
                  <a
                    href={`/orders?orderId=${createdOrderId}`}
                    className="font-medium underline hover:no-underline"
                  >
                    Открыть заказ →
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
                  onClick={() => canClose && onClose()}
                  className="rounded-md border border-zinc-200 px-3 py-2 text-sm text-zinc-700 hover:bg-white"
                  disabled={converting}
                >
                  Отмена
                </button>
                <button
                  type="button"
                  onClick={() => void handleConvert()}
                  disabled={converting}
                  className="rounded-md bg-emerald-600 px-3 py-2 text-sm font-medium text-white hover:bg-emerald-500 disabled:opacity-60"
                >
                  {converting ? "Конвертация…" : "Конвертировать"}
                </button>
              </div>
            </div>
          )}
        </div>

        {lead && (
          <div className="flex items-center justify-between border-t border-zinc-200 bg-zinc-50 px-5 py-3 text-xs">
            <div className="space-x-2">
              <button
                type="button"
                className="rounded-md border border-zinc-200 px-2 py-1 text-xs text-zinc-700 hover:bg-white"
                disabled={statusUpdating}
                onClick={() => void updateStatus("IN_PROGRESS")}
              >
                В работу
              </button>
              <button
                type="button"
                className="rounded-md border border-emerald-200 bg-emerald-50 px-2 py-1 text-xs text-emerald-700 hover:bg-emerald-100"
                disabled={statusUpdating}
                onClick={() => void updateStatus("WON")}
              >
                Успешный
              </button>
              <button
                type="button"
                className="rounded-md border border-zinc-200 px-2 py-1 text-xs text-zinc-700 hover:bg-white"
                disabled={statusUpdating}
                onClick={() => void updateStatus("NOT_TARGET", "Нецелевой")}
              >
                Нецелевой
              </button>
              <button
                type="button"
                className="rounded-md border border-red-200 bg-red-50 px-2 py-1 text-xs text-red-700 hover:bg-red-100"
                disabled={statusUpdating}
                onClick={() => void updateStatus("LOST", "Проваленный")}
              >
                Проваленный
              </button>
            </div>

            <div className="text-xs text-zinc-500">
              ID: <span className="font-mono">{lead.id}</span>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

export default LeadModal;


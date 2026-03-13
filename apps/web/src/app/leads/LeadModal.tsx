"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { EntityModalShell } from "@/components/modals/EntityModalShell";
import { FeedTabsScaffold } from "@/components/modals/FeedTabsScaffold";
import { EntityTasksList } from "@/components/EntityTasksList";
import { EntitySection } from "@/components/sections/EntitySection";
import { apiHttp } from "@/lib/api/client";
import { leadsApi, type Lead, LeadItem, LeadStatus, LeadSource } from "@/lib/api";
import { ContactTimeline } from "@/app/contacts/ContactTimeline";

type Props = {
  apiBaseUrl: string;
  leadId: string;
  onClose: () => void;
  onUpdated: () => void;
  /** Role from parent (e.g. from /auth/me on page). When set, used for admin actions and internal fetch is skipped. */
  userRole?: string | null;
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

export function LeadModal({ apiBaseUrl, leadId, onClose, onUpdated, userRole: userRoleProp }: Props) {
  const [lead, setLead] = useState<Lead | null>(null);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);

  const [showConvertWizard, setShowConvertWizard] = useState(false);
  const [showCompleteOutcomeDialog, setShowCompleteOutcomeDialog] = useState(false);
  /** Preset when opening from outcome dialog: company+contact+deal | contact+deal | contact only */
  const [convertPreset, setConvertPreset] = useState<"company_contact_deal" | "contact_deal" | "contact" | null>(null);
  const [leadTab, setLeadTab] = useState<"main" | "products" | "activity" | "source">("main");

  const [noteMessage, setNoteMessage] = useState("");
  const [addingNote, setAddingNote] = useState(false);

  const [saving, setSaving] = useState(false);
  const [statusUpdating, setStatusUpdating] = useState(false);

  const [editFirstName, setEditFirstName] = useState("");
  const [editLastName, setEditLastName] = useState("");
  const [editMiddleName, setEditMiddleName] = useState("");
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
  const [newContactMiddleName, setNewContactMiddleName] = useState("");
  const [newContactPhone, setNewContactPhone] = useState("");
  const [newContactEmail, setNewContactEmail] = useState("");
  const [newContactCompanyName, setNewContactCompanyName] = useState("");

  const [createDeal, setCreateDeal] = useState(true);
  const [dealTitle, setDealTitle] = useState("");
  const [dealAmount, setDealAmount] = useState<number | undefined>(undefined);
  const [dealComment, setDealComment] = useState("");
  /** Company name when preset is company_contact_deal (create company first, then contact, then order) */
  const [newCompanyName, setNewCompanyName] = useState("");

  const [converting, setConverting] = useState(false);
  const [convertError, setConvertError] = useState<string | null>(null);
  const [createdOrderId, setCreatedOrderId] = useState<string | null>(null);

  // Lead items (local list for editing)
  type EditItem = { productId: string; productName?: string; qty: number; price: number };
  const [editItems, setEditItems] = useState<EditItem[]>([]);
  const [productSearch, setProductSearch] = useState("");
  const [productResults, setProductResults] = useState<Array<{ id: string; name: string; sku: string; basePrice: number }>>([]);
  const [_productSearchLoading, setProductSearchLoading] = useState(false);
  const [selectedProduct, setSelectedProduct] = useState<{ id: string; name: string; sku: string; basePrice: number } | null>(null);
  const [newItemQty, setNewItemQty] = useState(1);
  const [newItemPrice, setNewItemPrice] = useState(0);
  const [savingItems, setSavingItems] = useState(false);

  const [userRole, setUserRole] = useState<string | null>(null);
  const [deleting, setDeleting] = useState(false);

  const canClose = !saving && !converting && !statusUpdating && !addingNote && !deleting;

  const effectiveRole = userRoleProp ?? userRole;
  const isAdmin = effectiveRole != null && String(effectiveRole).trim().toUpperCase() === "ADMIN";

  useEffect(() => {
    // #region agent log
    if (typeof console !== "undefined" && console.debug) {
      console.debug("[LeadModal delete condition]", { effectiveRole, hasLead: !!lead, isAdmin, showDelete: !!(lead && isAdmin) });
    }
    fetch('http://localhost:7242/ingest/6d5146b2-d2ee-43a9-ac82-5385935623c0',{method:'POST',headers:{'Content-Type':'application/json','X-Debug-Session-Id':'d4138d'},body:JSON.stringify({sessionId:'d4138d',location:'LeadModal.tsx:headerActions',message:'delete button condition',data:{effectiveRole,hasLead:!!lead,isAdmin,showDelete:!!(lead&&isAdmin)},timestamp:Date.now(),hypothesisId:'H3-H5'})}).catch(()=>{});
    // #endregion
  }, [effectiveRole, lead, isAdmin]);

  const title = useMemo(() => {
    if (!lead) return "Lead";
    return lead.fullName || lead.name || [lead.firstName, lead.middleName, lead.lastName].filter(Boolean).join(" ") || lead.companyName || "Lead";
  }, [lead]);

  useEffect(() => {
    if (userRoleProp != null) return;
    apiHttp
      .get<{ user?: { role?: string } }>("/auth/me")
      .then((res) => {
        const role = res.data?.user?.role ?? null;
        // #region agent log
        if (typeof console !== "undefined" && console.debug) {
          console.debug("[LeadModal auth/me]", { role, rawUser: res.data?.user });
        }
        fetch('http://localhost:7242/ingest/6d5146b2-d2ee-43a9-ac82-5385935623c0',{method:'POST',headers:{'Content-Type':'application/json','X-Debug-Session-Id':'d4138d'},body:JSON.stringify({sessionId:'d4138d',location:'LeadModal.tsx:auth/me',message:'auth/me response',data:{role,rawUser:res.data?.user,roleType:typeof role},timestamp:Date.now(),hypothesisId:'H1-H2'})}).catch(()=>{});
        // #endregion
        setUserRole(role);
      })
      .catch((err) => {
        // #region agent log
        if (typeof console !== "undefined" && console.debug) {
          console.debug("[LeadModal auth/me failed]", err?.message, (err as any)?.response?.status);
        }
        fetch('http://localhost:7242/ingest/6d5146b2-d2ee-43a9-ac82-5385935623c0',{method:'POST',headers:{'Content-Type':'application/json','X-Debug-Session-Id':'d4138d'},body:JSON.stringify({sessionId:'d4138d',location:'LeadModal.tsx:auth/me',message:'auth/me failed',data:{errMsg:err?.message,status:(err as any)?.response?.status},timestamp:Date.now(),hypothesisId:'H1'})}).catch(()=>{});
        // #endregion
        setUserRole(null);
      });
  }, [userRoleProp]);

  const loadLead = useCallback(async () => {
    setLoading(true);
    setErr(null);
    try {
      const r = await apiHttp.get<Lead>(`/leads/${leadId}`);
      const data = r.data as Lead;
      setLead(data);

      setEditFirstName(data.firstName ?? data.name ?? "");
      setEditLastName(data.lastName ?? "");
      setEditMiddleName(data.middleName ?? "");
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

      setNewContactFirstName(data.firstName ?? data.name ?? "");
      setNewContactLastName(data.lastName ?? "");
      setNewContactMiddleName(data.middleName ?? "");
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

  // Product search for adding items
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
    // Kept for backward compatibility if needed elsewhere, but mostly replaced by patchLead
    if (!lead) return;
    setSaving(true);
    setErr(null);
    try {
      await apiHttp.patch<Lead>(`/leads/${lead.id}`, {
        firstName: editFirstName.trim() || null,
        lastName: editLastName.trim() || null,
        middleName: editMiddleName.trim() || null,
        phone: editPhone.trim() || null,
        email: editEmail.trim() || null,
        companyName: editCompanyName.trim() || null,
        message: editMessage.trim() || null,
        source: editSource,
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

  const patchLead = useCallback(
    async (payload: Record<string, any>) => {
      if (!lead) return;
      setSaving(true);
      setErr(null);
      try {
        await apiHttp.patch<Lead>(`/leads/${lead.id}`, payload);
        await loadLead();
        onUpdated();
      } catch (e) {
        const msg =
          (e as { response?: { data?: { message?: string } } })?.response?.data?.message ??
          (e instanceof Error ? e.message : "Failed to save");
        setErr(msg);
        await loadLead(); // rollback on error
      } finally {
        setSaving(false);
      }
    },
    [lead, loadLead, onUpdated]
  );

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
    if (convertPreset === "company_contact_deal" && !newCompanyName.trim()) {
      setConvertError("Enter company name");
      return;
    }
    setConverting(true);
    setConvertError(null);
    try {
      const hasSelectedContact = !!selectedContactId;
      const mode = hasSelectedContact || !createContact ? "link" : "create";

      const payload: any = {
        contactMode: mode,
        createDeal,
      };

      if (convertPreset === "company_contact_deal" && newCompanyName.trim()) {
        payload.createCompany = { name: newCompanyName.trim() };
      }

      if (mode === "link") {
        if (!selectedContactId) {
          throw new Error("Select a contact or enable create contact");
        }
        payload.contactId = selectedContactId;
      } else {
        payload.contact = {
          firstName: newContactFirstName.trim() || lead.name || "Lead",
          lastName: newContactLastName.trim() || "",
          middleName: newContactMiddleName.trim() || "",
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

  const isInProgress = lead?.status === "NEW" || lead?.status === "IN_PROGRESS";
  const canShowCompleteButton = isInProgress;
  const canConvert = lead?.status === "WON";

  const statusLabel =
    lead?.status === "NEW"
      ? "New"
      : lead?.status === "IN_PROGRESS"
        ? "In progress"
        : lead?.status === "WON"
          ? "Won"
          : lead?.status === "NOT_TARGET"
            ? "Not target"
            : lead?.status === "LOST"
              ? "Lost"
              : lead?.status === "SPAM"
                ? "Spam"
                : lead?.status ?? "";

  const handleEscape = useCallback(() => {
    if (showCompleteOutcomeDialog) {
      setShowCompleteOutcomeDialog(false);
      return true;
    }
    if (showConvertWizard) {
      setShowConvertWizard(false);
      return true;
    }
    return false;
  }, [showCompleteOutcomeDialog, showConvertWizard]);

  const openCompleteOutcomeDialog = () => {
    setShowCompleteOutcomeDialog(true);
  };

  const openConvertWizard = (preset?: "company_contact_deal" | "contact_deal" | "contact") => {
    setShowCompleteOutcomeDialog(false);
    setConvertPreset(preset ?? null);
    setNewContactFirstName(lead?.firstName ?? lead?.name ?? "");
    setNewContactLastName(lead?.lastName ?? "");
    setNewContactMiddleName(lead?.middleName ?? "");
    setNewContactPhone(lead?.phone ?? "");
    setNewContactEmail(lead?.email ?? "");
    setNewContactCompanyName(lead?.companyName ?? "");
    setDealTitle(title);
    if (preset === "company_contact_deal") {
      setCreateContact(true);
      setCreateDeal(true);
      setSelectedContactId(null);
      setNewCompanyName(lead?.companyName ?? "");
    } else if (preset === "contact_deal") {
      setCreateContact(false);
      setCreateDeal(true);
      setSelectedContactId(null);
      setNewCompanyName("");
    } else if (preset === "contact") {
      setCreateContact(false);
      setCreateDeal(false);
      setSelectedContactId(null);
      setNewCompanyName("");
    }
    setShowConvertWizard(true);
    setCreatedOrderId(null);
    void loadSuggestions();
  };

  const markAsPoorQuality = async () => {
    if (!lead) return;
    setShowCompleteOutcomeDialog(false);
    setStatusUpdating(true);
    setErr(null);
    try {
      await apiHttp.patch<Lead>(`/leads/${lead.id}/status`, {
        status: "NOT_TARGET",
        reason: "Poor quality lead",
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

  const addNote = async () => {
    if (!lead || !noteMessage.trim()) return;
    setAddingNote(true);
    setErr(null);
    try {
      await leadsApi.addNote(lead.id, { message: noteMessage.trim() });
      setNoteMessage("");
      await loadLead();
      onUpdated();
    } catch (e) {
      const msg =
        (e as { response?: { data?: { message?: string } } })?.response?.data?.message ??
        (e instanceof Error ? e.message : "Failed to add note");
      setErr(msg);
    } finally {
      setAddingNote(false);
    }
  };

  const leftContent = loading ? (
    <div className="text-sm text-zinc-500">Loading…</div>
  ) : err ? (
    <div className="rounded-md border border-red-200 bg-red-50 p-3 text-sm text-red-700">{err}</div>
  ) : !lead ? (
    <div className="text-sm text-zinc-500">Lead not found</div>
  ) : leadTab === "source" ? (
    <div className="space-y-6">
      {lead.attribution ? (
        <EntitySection title="Attribution">
          <div className="rounded-md border border-zinc-200 bg-zinc-50/50 p-3 text-sm">
            <div className="grid gap-2 text-zinc-700">
              <div><span className="text-zinc-500">Campaign:</span> {lead.attribution.campaignName} ({lead.attribution.campaignId})</div>
              <div><span className="text-zinc-500">Ad set:</span> {lead.attribution.adsetName} ({lead.attribution.adsetId})</div>
              <div><span className="text-zinc-500">Ad:</span> {lead.attribution.adName} ({lead.attribution.adId})</div>
              <div><span className="text-zinc-500">Form:</span> {lead.attribution.formId}</div>
              <div><span className="text-zinc-500">Created (Meta):</span> {new Date(lead.attribution.createdTime).toLocaleString()}</div>
            </div>
          </div>
        </EntitySection>
      ) : null}
      {lead.answers && lead.answers.length > 0 ? (
        <EntitySection title="Form answers">
          <div className="rounded-md border border-zinc-200 overflow-hidden">
            <table className="w-full text-sm">
              <tbody className="divide-y divide-zinc-100">
                {lead.answers.map((a) => (
                  <tr key={a.id}>
                    <td className="px-3 py-2 text-zinc-500 font-medium w-1/3">{a.key}</td>
                    <td className="px-3 py-2 text-zinc-900">{a.value}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </EntitySection>
      ) : null}
      {lead.events && lead.events.length > 0 ? (
        <EntitySection title="Events">
          <div className="space-y-2">
            {lead.events.map((e) => (
              <div key={e.id} className="rounded-md border border-zinc-200 p-3 text-sm">
                <div className="flex items-start justify-between gap-2">
                  <span className="font-medium text-zinc-900">{e.type}</span>
                  <span className="text-xs text-zinc-500">{new Date(e.createdAt).toLocaleString()}</span>
                </div>
                <div className="mt-1 text-zinc-700">{e.message}</div>
              </div>
            ))}
          </div>
        </EntitySection>
      ) : null}
      {!lead.attribution && (!lead.answers || lead.answers.length === 0) && (!lead.events || lead.events.length === 0) ? (
        <div className="text-sm text-zinc-500">No source data</div>
      ) : null}
    </div>
  ) : leadTab === "activity" ? (
    <EntitySection title="Activity">
      <div className="h-[420px]">
        <ContactTimeline apiBaseUrl={apiBaseUrl} contactId={lead?.contactId || lead.id} entityType={lead?.contactId ? "contact" : "lead"} showActivityButtons={true} />
      </div>
    </EntitySection>
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
    <div className="space-y-6">
      {/* Contact */}
      <section className="space-y-3">
        <h3 className="text-xs font-semibold uppercase tracking-wider text-zinc-400">Contact</h3>
        <div className="grid gap-4 sm:grid-cols-2">
          <div className="flex flex-col gap-1">
            <label className="text-xs font-medium text-zinc-500">First Name</label>
            <input
              className="w-full rounded-md border border-transparent bg-transparent px-0 py-1 text-sm text-zinc-900 placeholder:text-zinc-400 transition-all hover:border-zinc-300 hover:bg-white hover:px-2 focus:border-blue-500 focus:bg-white focus:px-2 focus:ring-1 focus:ring-blue-500 focus:outline-none"
              placeholder="Enter first name..."
              value={editFirstName}
              onChange={(e) => setEditFirstName(e.target.value)}
              onBlur={() => {
                if (editFirstName !== (lead.firstName ?? lead.name ?? "")) {
                  void patchLead({ firstName: editFirstName.trim() || null });
                }
              }}
              disabled={saving}
            />
          </div>
          <div className="flex flex-col gap-1">
            <label className="text-xs font-medium text-zinc-500">Last Name</label>
            <input
              className="w-full rounded-md border border-transparent bg-transparent px-0 py-1 text-sm text-zinc-900 placeholder:text-zinc-400 transition-all hover:border-zinc-300 hover:bg-white hover:px-2 focus:border-blue-500 focus:bg-white focus:px-2 focus:ring-1 focus:ring-blue-500 focus:outline-none"
              placeholder="Enter last name..."
              value={editLastName}
              onChange={(e) => setEditLastName(e.target.value)}
              onBlur={() => {
                if (editLastName !== (lead.lastName ?? "")) {
                  fetch('http://localhost:7242/ingest/6d5146b2-d2ee-43a9-ac82-5385935623c0',{method:'POST',headers:{'Content-Type':'application/json','X-Debug-Session-Id':'0f7630'},body:JSON.stringify({sessionId:'0f7630',location:'LeadModal.tsx:714',message:'Updating lastName',data:{lastName:editLastName},timestamp:Date.now(),hypothesisId:'A',runId:'test'})}).catch(()=>{});
                  void patchLead({ lastName: editLastName.trim() || null });
                }
              }}
              disabled={saving}
            />
          </div>
          <div className="flex flex-col gap-1">
            <label className="text-xs font-medium text-zinc-500">Middle Name</label>
            <input
              className="w-full rounded-md border border-transparent bg-transparent px-0 py-1 text-sm text-zinc-900 placeholder:text-zinc-400 transition-all hover:border-zinc-300 hover:bg-white hover:px-2 focus:border-blue-500 focus:bg-white focus:px-2 focus:ring-1 focus:ring-blue-500 focus:outline-none"
              placeholder="Enter middle name..."
              value={editMiddleName}
              onChange={(e) => setEditMiddleName(e.target.value)}
              onBlur={() => {
                if (editMiddleName !== (lead.middleName ?? "")) {
                  void patchLead({ middleName: editMiddleName.trim() || null });
                }
              }}
              disabled={saving}
            />
          </div>
          <div className="flex flex-col gap-1">
            <label className="text-xs font-medium text-zinc-500">Phone</label>
            <input
              className="w-full rounded-md border border-transparent bg-transparent px-0 py-1 text-sm text-zinc-900 placeholder:text-zinc-400 transition-all hover:border-zinc-300 hover:bg-white hover:px-2 focus:border-blue-500 focus:bg-white focus:px-2 focus:ring-1 focus:ring-blue-500 focus:outline-none"
              placeholder="Enter phone..."
              value={editPhone}
              onChange={(e) => setEditPhone(e.target.value)}
              onBlur={() => {
                if (editPhone !== (lead.phone ?? "")) {
                  void patchLead({ phone: editPhone.trim() || null });
                }
              }}
              disabled={saving}
            />
          </div>
          <div className="flex flex-col gap-1 sm:col-span-2">
            <label className="text-xs font-medium text-zinc-500">Email</label>
            <input
              type="email"
              className="w-full rounded-md border border-transparent bg-transparent px-0 py-1 text-sm text-zinc-900 placeholder:text-zinc-400 transition-all hover:border-zinc-300 hover:bg-white hover:px-2 focus:border-blue-500 focus:bg-white focus:px-2 focus:ring-1 focus:ring-blue-500 focus:outline-none"
              placeholder="Enter email..."
              value={editEmail}
              onChange={(e) => setEditEmail(e.target.value)}
              onBlur={() => {
                if (editEmail !== (lead.email ?? "")) {
                  void patchLead({ email: editEmail.trim() || null });
                }
              }}
              disabled={saving}
            />
          </div>
        </div>
        {!lead.phone && !lead.email && (
          <p className="rounded-lg border border-amber-200 bg-amber-50/80 px-3 py-2 text-xs text-amber-800">
            Request contact from lead
          </p>
        )}
      </section>

      {/* Company & source */}
      <section className="space-y-3">
        <h3 className="text-xs font-semibold uppercase tracking-wider text-zinc-400">Company & source</h3>
        <div className="grid gap-4 sm:grid-cols-2">
          <div className="flex flex-col gap-1">
            <label className="text-xs font-medium text-zinc-500">Company</label>
            <input
              className="w-full rounded-md border border-transparent bg-transparent px-0 py-1 text-sm text-zinc-900 placeholder:text-zinc-400 transition-all hover:border-zinc-300 hover:bg-white hover:px-2 focus:border-blue-500 focus:bg-white focus:px-2 focus:ring-1 focus:ring-blue-500 focus:outline-none"
              placeholder="Enter company..."
              value={editCompanyName}
              onChange={(e) => setEditCompanyName(e.target.value)}
              onBlur={() => {
                if (editCompanyName !== (lead.companyName ?? "")) {
                  void patchLead({ companyName: editCompanyName.trim() || null });
                }
              }}
              disabled={saving}
            />
          </div>
          <div className="flex flex-col gap-1">
            <label className="text-xs font-medium text-zinc-500">Source</label>
            <select
              className="w-full rounded-md border border-transparent bg-transparent px-0 py-1 text-sm text-zinc-900 transition-all hover:border-zinc-300 hover:bg-white hover:px-2 focus:border-blue-500 focus:bg-white focus:px-2 focus:ring-1 focus:ring-blue-500 focus:outline-none cursor-pointer appearance-none"
              value={editSource}
              onChange={(e) => {
                const val = e.target.value as LeadSource;
                setEditSource(val);
                if (val !== lead.source) {
                  void patchLead({ source: val });
                }
              }}
              disabled={saving}
            >
              <option value="META">Meta Lead Ads</option>
              <option value="FACEBOOK">Facebook</option>
              <option value="TELEGRAM">Telegram</option>
              <option value="INSTAGRAM">Instagram</option>
              <option value="WEBSITE">Website</option>
              <option value="OTHER">Other</option>
            </select>
          </div>
          <div className="flex flex-col gap-1">
            <label className="text-xs font-medium text-zinc-500">Ответственный</label>
            <div className="py-1 text-sm text-zinc-900">{lead.owner?.fullName ?? "—"}</div>
          </div>
          {(lead.city != null && lead.city !== "") || lead.score != null ? (
            <div className="flex flex-wrap gap-4 sm:col-span-2">
              {lead.city != null && lead.city !== "" && (
                <div className="flex items-baseline gap-2">
                  <span className="text-xs text-zinc-500">City:</span>
                  <span className="text-sm text-zinc-900">{lead.city}</span>
                </div>
              )}
              {lead.score != null && (
                <div className="flex items-baseline gap-2">
                  <span className="text-xs text-zinc-500">Score:</span>
                  <span className="text-sm font-medium text-zinc-900">{lead.score}</span>
                </div>
              )}
            </div>
          ) : null}
        </div>
      </section>

      {/* Message */}
      <section className="space-y-3">
        <h3 className="text-xs font-semibold uppercase tracking-wider text-zinc-400">Message</h3>
        <textarea
          rows={3}
          className="w-full resize-none rounded-md border border-transparent bg-transparent px-0 py-1 text-sm text-zinc-900 placeholder:text-zinc-400 transition-all hover:border-zinc-300 hover:bg-white hover:px-2 focus:border-blue-500 focus:bg-white focus:px-2 focus:ring-1 focus:ring-blue-500 focus:outline-none"
          placeholder="Message or comment from lead..."
          value={editMessage}
          onChange={(e) => {
            setEditMessage(e.target.value);
            e.target.style.height = 'auto';
            e.target.style.height = `${e.target.scrollHeight}px`;
          }}
          onBlur={() => {
            if (editMessage !== (lead.message ?? "")) {
              void patchLead({ message: editMessage.trim() || null });
            }
          }}
          disabled={saving}
        />
      </section>

      <div className="border-t border-zinc-100 pt-4">
        <span className="text-xs text-zinc-400">
          Created: {new Date(lead.createdAt).toLocaleString()}
          {lead.lastActivityAt && ` · Activity: ${new Date(lead.lastActivityAt).toLocaleString()}`}
        </span>
      </div>

      {/* Add note */}
      <section className="space-y-3 rounded-xl border border-zinc-100 bg-zinc-50/50 p-4">
        <h3 className="text-xs font-semibold uppercase tracking-wider text-zinc-400">Add note</h3>
        <textarea
          rows={2}
          className="w-full rounded-lg border border-zinc-200 bg-white px-3 py-2 text-sm text-zinc-900 placeholder:text-zinc-400 outline-none transition-colors focus:border-zinc-400 focus:ring-1 focus:ring-zinc-400/30 disabled:bg-zinc-50"
          placeholder="Enter note text…"
          value={noteMessage}
          onChange={(e) => setNoteMessage(e.target.value)}
          disabled={addingNote}
        />
        <button
          type="button"
          onClick={() => void addNote()}
          disabled={addingNote || !noteMessage.trim()}
          className="rounded-lg border border-zinc-200 bg-white px-3 py-1.5 text-sm font-medium text-zinc-700 hover:bg-zinc-50 disabled:opacity-50"
        >
          {addingNote ? "Sending…" : "Add note"}
        </button>
      </section>

      {lead.statusReason ? (
        <p className="text-xs text-zinc-500">
          <span className="font-medium text-zinc-600">Status reason:</span> {lead.statusReason}
        </p>
      ) : null}
    </div>
  );

  const rightContent = showConvertWizard ? (
    <div className="space-y-6 rounded-lg border border-zinc-200 bg-zinc-50/50 p-4">
              {convertPreset === "company_contact_deal" && (
                <div className="rounded-md border border-zinc-200 bg-zinc-50 p-3 text-sm">
                  <div className="font-medium text-zinc-900">Step 1. Company</div>
                  <p className="mt-1 text-xs text-zinc-500">Create a company first; contact and order will be linked to it.</p>
                  <div className="mt-3">
                    <label className="block text-xs font-medium text-zinc-600">Company name</label>
                    <input
                      className="mt-1 w-full rounded-md border border-zinc-200 px-2 py-1.5 text-sm outline-none focus:border-zinc-400"
                      placeholder="Company name"
                      value={newCompanyName}
                      onChange={(e) => setNewCompanyName(e.target.value)}
                    />
                  </div>
                </div>
              )}
              <div className="rounded-md border border-zinc-200 bg-zinc-50 p-3 text-sm">
                <div className="flex items-center justify-between">
                  <div className="font-medium text-zinc-900">
                    {convertPreset === "company_contact_deal" ? "Step 2. Contact" : "Step 1. Contact"}
                  </div>
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

                {convertPreset !== "company_contact_deal" && (
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
                )}

                {(createContact || convertPreset === "company_contact_deal") && (
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
                        Middle name
                      </label>
                      <input
                        className="mt-1 w-full rounded-md border border-zinc-200 px-2 py-1.5 text-xs outline-none focus:border-zinc-400"
                        value={newContactMiddleName}
                        onChange={(e) => setNewContactMiddleName(e.target.value)}
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
                    {convertPreset !== "company_contact_deal" && (
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
                    )}
                  </div>
                )}
              </div>

              {convertPreset !== "contact" && (
              <div className="rounded-md border border-zinc-200 bg-zinc-50 p-3 text-sm">
                <div className="flex items-center justify-between">
                  <div className="font-medium text-zinc-900">
                    {convertPreset === "company_contact_deal" ? "Step 3. Deal" : "Step 2. Deal"}
                  </div>
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
              )}

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
    <FeedTabsScaffold
      activityContent={
        <div className="h-[420px]">
          <ContactTimeline apiBaseUrl={apiBaseUrl} contactId={lead?.contactId || lead.id} entityType={lead?.contactId ? "contact" : "lead"} showActivityButtons={true} />
        </div>
      }
      tasksContent={
        <div className="h-[420px] overflow-auto">
          <EntityTasksList leadId={leadId} />
        </div>
      }
    />
  ) : null;

  const isProcessed = lead?.status === "WON" || lead?.status === "NOT_TARGET" || lead?.status === "LOST" || lead?.status === "SPAM";

  const stagesBar = lead ? (
    <div className="border-b border-zinc-200 py-3 px-4">
      <div className="flex items-center gap-2 w-full max-w-xl">
        {/* Step 1: New */}
        <button
          type="button"
          disabled={statusUpdating}
          onClick={() => {
            if (lead.status !== "NEW") void updateStatus("NEW");
          }}
          className={`relative z-10 flex items-center gap-1 rounded-md px-3 py-1.5 text-xs font-medium transition-colors focus:outline-none disabled:cursor-default ${
            lead.status === "NEW"
              ? "bg-blue-100 text-blue-800"
              : lead.status === "IN_PROGRESS" || isProcessed
                ? "text-emerald-600 hover:bg-emerald-50/80"
                : "text-zinc-400 hover:bg-zinc-100 hover:text-zinc-600"
          }`}
        >
          {(lead.status === "IN_PROGRESS" || isProcessed) && (
            <svg className="h-3 w-3 text-emerald-500 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
            </svg>
          )}
          New
        </button>

        <div className="flex-1 h-px min-w-[12px] bg-zinc-200 relative overflow-hidden">
          <div
            className={`absolute top-0 left-0 h-full bg-emerald-300 transition-all duration-300 ${
              lead.status === "IN_PROGRESS" || isProcessed ? "w-full" : "w-0"
            }`}
          />
        </div>

        {/* Step 2: In progress */}
        <button
          type="button"
          disabled={statusUpdating}
          onClick={() => {
            if (lead.status !== "IN_PROGRESS") void updateStatus("IN_PROGRESS");
          }}
          className={`relative z-10 flex items-center gap-1 rounded-md px-3 py-1.5 text-xs font-medium transition-colors focus:outline-none disabled:cursor-default ${
            lead.status === "IN_PROGRESS"
              ? "bg-blue-100 text-blue-800"
              : isProcessed
                ? "text-emerald-600 hover:bg-emerald-50/80"
                : "text-zinc-400 hover:bg-zinc-100 hover:text-zinc-600"
          }`}
        >
          {isProcessed && (
            <svg className="h-3 w-3 text-emerald-500 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
            </svg>
          )}
          In progress
        </button>

        <div className="flex-1 h-px min-w-[12px] bg-zinc-200 relative overflow-hidden">
          <div
            className={`absolute top-0 left-0 h-full bg-emerald-300 transition-all duration-300 ${
              isProcessed ? "w-full" : "w-0"
            }`}
          />
        </div>

        {/* Step 3: Processed */}
        <button
          type="button"
          disabled={statusUpdating}
          onClick={() => {
            if (lead.status === "NEW" || lead.status === "IN_PROGRESS") openCompleteOutcomeDialog();
          }}
          className={`relative z-10 flex items-center gap-1 rounded-md px-3 py-1.5 text-xs font-medium transition-colors focus:outline-none ${
            isProcessed
              ? "bg-emerald-100 text-emerald-800"
              : "text-zinc-400 hover:bg-zinc-100 hover:text-zinc-600"
          }`}
        >
          {isProcessed && (
            <svg className="h-3 w-3 text-emerald-600 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
            </svg>
          )}
          Processed
        </button>
      </div>
    </div>
  ) : null;

  const tabsUnderHeader =
    lead ? (
      <div className="space-y-0">
        {stagesBar}
        <div className="flex gap-1 border-b border-zinc-200 pb-2 pt-2">
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
          <button
            type="button"
            onClick={() => setLeadTab("source")}
            className={`rounded px-2 py-1 text-sm font-medium ${leadTab === "source" ? "bg-accent-gradient text-white" : "text-zinc-600 hover:bg-zinc-100"}`}
          >
            Source
            </button>
        </div>
      </div>
    ) : null;

  return (
    <>
      {showCompleteOutcomeDialog && (
        <div
          className="fixed inset-0 z-[60] flex items-center justify-center bg-black/50 px-4"
          role="dialog"
          aria-modal="true"
          aria-labelledby="complete-outcome-title"
          onClick={() => setShowCompleteOutcomeDialog(false)}
        >
          <div
            className="w-full max-w-md rounded-xl bg-white p-5 shadow-xl"
            onClick={(e) => e.stopPropagation()}
          >
            <h2 id="complete-outcome-title" className="text-base font-semibold text-zinc-900">
              Choose outcome to complete the lead
            </h2>
            <div className="mt-4 space-y-3">
              <button
                type="button"
                onClick={() => openConvertWizard("company_contact_deal")}
                className="flex w-full items-center justify-between rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-3 text-left text-sm font-medium text-emerald-800 hover:bg-emerald-100"
              >
                <span>Company + contact + order</span>
                <span className="text-emerald-600">→</span>
              </button>
              <button
                type="button"
                onClick={() => openConvertWizard("contact_deal")}
                className="flex w-full items-center justify-between rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-3 text-left text-sm font-medium text-emerald-800 hover:bg-emerald-100"
              >
                <span>Contact + order</span>
                <span className="text-emerald-600">→</span>
              </button>
              <button
                type="button"
                onClick={() => openConvertWizard("contact")}
                className="flex w-full items-center justify-between rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-3 text-left text-sm font-medium text-emerald-800 hover:bg-emerald-100"
              >
                <span>Contact only</span>
                <span className="text-emerald-600">→</span>
              </button>
              <button
                type="button"
                onClick={markAsPoorQuality}
                disabled={statusUpdating}
                className="flex w-full items-center justify-between rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-left text-sm font-medium text-red-800 hover:bg-red-100 disabled:opacity-60"
              >
                <span>Poor quality lead</span>
                <span className="text-red-600">→</span>
              </button>
            </div>
            <div className="mt-4 flex justify-end">
              <button
                type="button"
                onClick={() => setShowCompleteOutcomeDialog(false)}
                className="rounded-md border border-zinc-200 px-3 py-1.5 text-sm text-zinc-700 hover:bg-zinc-50"
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}

      <EntityModalShell
        title={title}
        subtitle={
        lead ? (
          <>
            Stage: {statusLabel} • Source: {lead.source}
          </>
        ) : undefined
      }
      tabsUnderHeader={tabsUnderHeader}
      headerActions={
        <>
          {lead && (
            isAdmin ? (
              <button
                type="button"
                onClick={async () => {
                  if (!lead || !confirm("Удалить лид? Это действие нельзя отменить.")) return;
                  setDeleting(true);
                  setErr(null);
                  try {
                    await leadsApi.delete(lead.id);
                    onUpdated();
                    onClose();
                  } catch (e) {
                    const msg =
                      (e as { response?: { data?: { message?: string } } })?.response?.data?.message ??
                      (e instanceof Error ? e.message : "Не удалось удалить лид");
                    setErr(msg);
                  } finally {
                    setDeleting(false);
                  }
                }}
                disabled={deleting}
                className="rounded-md border border-red-200 bg-red-50 px-2 py-1 text-xs text-red-700 hover:bg-red-100 disabled:opacity-50"
              >
                {deleting ? "Удаление…" : "Удалить лид"}
              </button>
            ) : (
              <span
                className="rounded-md border border-zinc-200 bg-zinc-100 px-2 py-1 text-xs text-zinc-500"
                title={effectiveRole != null ? `Ваша роль: ${effectiveRole}. Удалять может только ADMIN.` : "Роль не загружена. Удалять может только ADMIN."}
              >
                Удалить лид (только ADMIN)
              </span>
            )
          )}
          {lead && canConvert && (
            <button
              type="button"
              onClick={() => openConvertWizard()}
              className="rounded-md border border-zinc-300 bg-white px-2 py-1 text-xs text-zinc-700 hover:bg-zinc-50"
            >
              Convert
            </button>
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
    </>
  );
}

export default LeadModal;


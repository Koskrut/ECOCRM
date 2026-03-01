"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { EntityModalShell } from "@/components/modals/EntityModalShell";
import { EntitySection } from "@/components/sections/EntitySection";
import { SearchableSelectLite } from "@/components/inputs/SearchableSelectLite";
import { apiHttp } from "../../lib/api/client";
import { EntityOrdersList } from "@/components/EntityOrdersList";
import { CompanyTimeline } from "./CompanyTimeline";
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
  onOpenContact?: (id: string) => void;
};

export function CompanyModal({ apiBaseUrl, companyId, onClose, onUpdate, onOpenContact }: Props) {
  const isCreate = companyId === "new";

  const [company, setCompany] = useState<Company | null>(null);
  const [loading, setLoading] = useState(!isCreate);
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

  // Contacts linked to this company
  const [companyContacts, setCompanyContacts] = useState<{ id: string; firstName: string; lastName: string; phone: string }[]>([]);
  const [loadingContacts, setLoadingContacts] = useState(false);
  const [linkContactOpen, setLinkContactOpen] = useState(false);
  const [allContactsForLink, setAllContactsForLink] = useState<{ id: string; firstName: string; lastName: string; phone: string }[]>([]);
  const [loadingAllContacts, setLoadingAllContacts] = useState(false);
  const [linkingContactId, setLinkingContactId] = useState<string | null>(null);

  type LeftTabId = "main" | "orders" | "contacts" | "change-history";
  const [leftTab, setLeftTab] = useState<LeftTabId>("main");

  const canClose = !saving && !creatingOrder;

  const title = useMemo(
    () => (isCreate ? "New company" : isEditing ? "Edit company" : "Company"),
    [isCreate, isEditing],
  );

  const allContactsOptions = useMemo(
    () =>
      allContactsForLink.map((c) => ({
        id: c.id,
        label: `${c.firstName} ${c.lastName} — ${c.phone}`,
      })),
    [allContactsForLink],
  );

  const refresh = useCallback(async () => {
    if (isCreate) {
      setLoading(false);
      setCompany(null);
      setName("");
      setEdrpou("");
      setTaxId("");
      return;
    }
    setLoading(true);
    setErr(null);
    try {
      const res = await apiHttp.get<Company>(`/companies/${companyId}`);
      const data = res.data as Company;
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
  }, [companyId, isCreate]);

  const loadCompanyContacts = useCallback(async () => {
    if (isCreate) {
      setCompanyContacts([]);
      return;
    }
    setLoadingContacts(true);
    try {
      const res = await apiHttp.get<{ items?: { id: string; firstName: string; lastName: string; phone: string }[] }>(
        `/contacts?companyId=${encodeURIComponent(companyId)}&page=1&pageSize=100`,
      );
      setCompanyContacts(Array.isArray(res.data?.items) ? res.data.items : []);
    } finally {
      setLoadingContacts(false);
    }
  }, [companyId, isCreate]);

  useEffect(() => {
    setIsEditing(false);
    void refresh();
  }, [refresh]);

  useEffect(() => {
    if (companyId && !isCreate) void loadCompanyContacts();
  }, [companyId, isCreate, loadCompanyContacts]);

  const handleEscape = useCallback(() => {
    if (orderId) {
      setOrderId(null);
      return true;
    }
    return false;
  }, [orderId]);

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

      if (isCreate) {
        const res = await apiHttp.post<Company>("/companies", payload);
        const created = res.data as Company;
        onUpdate();
        onClose();
        return;
      }

      await apiHttp.patch(`/companies/${companyId}`, payload);

      setIsEditing(false);
      await refresh();
      onUpdate();
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Save failed");
    } finally {
      setSaving(false);
    }
  };

  const openLinkContact = async () => {
    setLinkContactOpen(true);
    setLoadingAllContacts(true);
    try {
      const res = await apiHttp.get<{ items?: { id: string; firstName: string; lastName: string; phone: string }[] }>(
        "/contacts?page=1&pageSize=200",
      );
      setAllContactsForLink(Array.isArray(res.data?.items) ? res.data.items : []);
    } finally {
      setLoadingAllContacts(false);
    }
  };

  const linkContactToCompany = async (contactId: string) => {
    setLinkingContactId(contactId);
    try {
      await apiHttp.patch(`/contacts/${contactId}`, { companyId });
      await loadCompanyContacts();
      setLinkContactOpen(false);
    } finally {
      setLinkingContactId(null);
    }
  };

  const unlinkContactFromCompany = async (contactId: string) => {
    if (!confirm("Remove this contact from the company?")) return;
    try {
      await apiHttp.patch(`/contacts/${contactId}`, { companyId: null });
      await loadCompanyContacts();
    } catch {
      // ignore
    }
  };

  // ✅ Create order from company modal
  const createOrder = async () => {
    setCreatingOrder(true);
    setErr(null);
    try {
      const res = await apiHttp.post("/orders", {
        companyId,
        clientId: null,
        comment: "",
        discountAmount: 0,
      });

      const created = res.data as { id: string };
      setOrdersReloadKey((x) => x + 1);
      setOrderId(created.id);
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Failed to create order");
    } finally {
      setCreatingOrder(false);
    }
  };

  const aboutCompanySection = useMemo(() => {
    if (loading) return <div className="text-sm text-zinc-500">Loading…</div>;
    if (err)
      return (
        <div className="rounded-md border border-red-100 bg-red-50 p-3 text-sm text-red-700">
          {err}
        </div>
      );
    if (!company && !isCreate) return <div className="text-sm text-zinc-500">Not found</div>;
    if (isEditing || isCreate) {
      return (
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
              className="btn-primary"
            >
              {saving ? "Saving…" : "Save"}
            </button>
            <button
              type="button"
              onClick={() => (isCreate ? onClose() : !saving && setIsEditing(false))}
              disabled={saving}
              className="rounded-md border border-zinc-200 px-3 py-2 text-sm text-zinc-700 hover:bg-zinc-50"
            >
              Cancel
            </button>
          </div>
        </>
      );
    }
    return (
      <div className="space-y-2 text-sm">
        <div className="flex items-center justify-between gap-4">
          <div className="text-zinc-500">Name</div>
          <div className="text-zinc-900">{company!.name || "—"}</div>
        </div>
        <div className="flex items-center justify-between gap-4">
          <div className="text-zinc-500">EDRPOU</div>
          <div className="text-zinc-900">{company!.edrpou || "—"}</div>
        </div>
        <div className="flex items-center justify-between gap-4">
          <div className="text-zinc-500">Tax ID</div>
          <div className="text-zinc-900">{company!.taxId || "—"}</div>
        </div>
        <div className="pt-2 text-xs text-zinc-500">
          Created: {new Date(company!.createdAt).toLocaleString()}
          <br />
          Updated: {new Date(company!.updatedAt).toLocaleString()}
        </div>
      </div>
    );
  }, [
    loading,
    err,
    company,
    isCreate,
    isEditing,
    saving,
    name,
    edrpou,
    taxId,
    onClose,
    save,
  ]);

  const tabsUnderHeader = (
    <div className="flex gap-1 py-2">
      {(["main", "orders", "contacts", "change-history"] as const).map((tab) => (
        <button
          key={tab}
          type="button"
          onClick={() => setLeftTab(tab)}
          className={`rounded px-2 py-1.5 text-sm font-medium ${
            leftTab === tab ? "bg-accent-gradient text-white" : "text-zinc-600 hover:bg-zinc-100"
          }`}
        >
          {tab === "main"
            ? "Main"
            : tab === "orders"
              ? "Orders"
              : tab === "contacts"
                ? "Contacts"
                : "Change history"}
        </button>
      ))}
    </div>
  );

  const leftContent = (
    <div className="min-h-0 overflow-auto">
      {leftTab === "main" && (
        isCreate ? (
          <div className="min-h-0 overflow-auto">
            <EntitySection title="About company">{aboutCompanySection}</EntitySection>
          </div>
        ) : (
          <div className="grid min-h-0 flex-1 grid-cols-1 gap-0 lg:grid-cols-2">
            <div className="min-h-0 overflow-auto border-zinc-200 lg:border-r lg:pr-4">
              <EntitySection
                title="About company"
                rightAction={
                  !isEditing && !loading && !err && company ? (
                    <button
                      type="button"
                      onClick={startEdit}
                      className="rounded-md border border-zinc-200 px-2 py-1.5 text-xs text-zinc-700 hover:bg-zinc-50"
                    >
                      Edit
                    </button>
                  ) : null
                }
              >
                {aboutCompanySection}
              </EntitySection>
            </div>
            <div className="min-h-0 overflow-auto pt-4 lg:pt-0 lg:pl-4">
              <EntitySection title="Activity">
                <CompanyTimeline apiBaseUrl={apiBaseUrl} companyId={companyId} />
              </EntitySection>
            </div>
          </div>
        )
      )}

      {leftTab === "orders" && (
        <>
          {isCreate ? (
            <p className="text-sm text-zinc-500">Save the company first to see orders.</p>
          ) : (
            <EntitySection title="Orders">
              <div className="min-h-0 overflow-auto">
                <EntityOrdersList
                  key={ordersReloadKey}
                  apiBaseUrl={apiBaseUrl}
                  query={`companyId=${companyId}&pageSize=50`}
                  onOpenOrder={(id) => setOrderId(id)}
                />
              </div>
            </EntitySection>
          )}
        </>
      )}

      {leftTab === "contacts" && (
        <>
          {isCreate ? (
            <p className="text-sm text-zinc-500">Save the company first to link contacts.</p>
          ) : (
            <EntitySection
              title="Contacts"
              rightAction={
                <button
                  type="button"
                  onClick={() =>
                    linkContactOpen ? setLinkContactOpen(false) : openLinkContact()
                  }
                  className="rounded-md border border-zinc-200 px-2 py-1.5 text-xs text-zinc-700 hover:bg-zinc-50"
                >
                  {linkContactOpen ? "Cancel" : "Link contact"}
                </button>
              }
            >
              {linkContactOpen ? (
                <div className="mt-2">
                  {loadingAllContacts ? (
                    <div className="text-xs text-zinc-500">Loading…</div>
                  ) : allContactsOptions.length === 0 ? (
                    <div className="text-xs text-zinc-500">No contacts</div>
                  ) : (
                    <SearchableSelectLite
                      value={null}
                      options={allContactsOptions}
                      placeholder="Select contact to link…"
                      disabled={!!linkingContactId}
                      onChange={(id) => id != null && void linkContactToCompany(id)}
                    />
                  )}
                </div>
              ) : (
                <div className="mt-2 max-h-48 overflow-auto rounded-md border border-zinc-200 bg-white">
                  {loadingContacts ? (
                    <div className="p-2 text-xs text-zinc-500">Loading…</div>
                  ) : companyContacts.length === 0 ? (
                    <div className="p-2 text-xs text-zinc-500">No contacts linked</div>
                  ) : (
                    <ul className="divide-y divide-zinc-100 text-sm">
                      {companyContacts.map((c) => (
                        <li
                          key={c.id}
                          className="flex items-center justify-between gap-2 px-3 py-2"
                        >
                          <span className="min-w-0 flex-1">
                            {c.firstName} {c.lastName}
                            {c.phone ? ` — ${c.phone}` : ""}
                          </span>
                          <div className="flex shrink-0 items-center gap-0.5">
                            {onOpenContact ? (
                              <button
                                type="button"
                                onClick={() => onOpenContact(c.id)}
                                className="rounded border border-zinc-200 px-2 py-0.5 text-xs text-zinc-600 hover:bg-zinc-50"
                              >
                                Open contact
                              </button>
                            ) : null}
                            <button
                              type="button"
                              onClick={() => void unlinkContactFromCompany(c.id)}
                              className="rounded p-1.5 text-zinc-500 hover:bg-red-50 hover:text-red-600"
                              title="Remove from company"
                              aria-label="Remove from company"
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
                          </div>
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
              )}
            </EntitySection>
          )}
        </>
      )}

      {leftTab === "change-history" && (
        <>
          {isCreate ? (
            <p className="text-sm text-zinc-500">Save the company first to see change history.</p>
          ) : (
            <EntitySection title="Change history">
              <p className="text-sm text-zinc-500">No change history yet.</p>
            </EntitySection>
          )}
        </>
      )}
    </div>
  );

  return (
    <>
      <EntityModalShell
        title={title}
        subtitle={company?.name}
        headerActions={
          !isCreate ? (
            <button
              type="button"
              disabled={loading || !!err || creatingOrder}
              onClick={() => void createOrder()}
              className="btn-primary py-1.5"
            >
              {creatingOrder ? "Creating…" : "+ Order"}
            </button>
          ) : null
        }
        tabsUnderHeader={tabsUnderHeader}
        left={leftContent}
        right={null}
        footer={null}
        canClose={canClose}
        onClose={onClose}
        onEscape={handleEscape}
      />

      {orderId ? (
        <OrderModal
          apiBaseUrl={apiBaseUrl}
          orderId={orderId}
          onClose={() => setOrderId(null)}
          onSaved={() => {
            setOrderId(null);
            setOrdersReloadKey((x) => x + 1);
          }}
        />
      ) : null}
    </>
  );
}

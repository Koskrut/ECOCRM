"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { EntityModalShell } from "@/components/modals/EntityModalShell";
import { EntitySection } from "@/components/sections/EntitySection";
import { InlineEditableField } from "@/components/fields/InlineEditableField";
import { SearchableSelectLite } from "@/components/inputs/SearchableSelectLite";
import { EntityOrdersList } from "@/components/EntityOrdersList";
import { OrderModal } from "../orders/OrderModal";
import { ContactTimeline } from "./ContactTimeline";
import { NpCitySelect, NpWarehouseSelect } from "@/components/inputs/NpDirectorySelects";
import { apiHttp } from "../../lib/api/client";

type ShippingProfile = {
  id: string;
  label?: string | null;
  isDefault?: boolean | null;
  deliveryType?: string | null;
  recipientType?: string | null;
  firstName?: string | null;
  lastName?: string | null;
  phone?: string | null;
  cityRef?: string | null;
  cityName?: string | null;
  warehouseRef?: string | null;
  warehouseNumber?: string | null;
};

function AddShippingProfileModal({
  contactId,
  profileId,
  initialData,
  defaultPerson,
  onClose,
  onSaved,
}: {
  contactId: string;
  profileId?: string;
  initialData?: ShippingProfile | null;
  /** When adding (no initialData), pre-fill person fields from contact if no profiles yet */
  defaultPerson?: { firstName?: string; lastName?: string; phone?: string } | null;
  onClose: () => void;
  onSaved: () => void;
}) {
  const isEdit = !!profileId && !!initialData;
  const defaultLabel =
    initialData?.label ??
    (defaultPerson?.lastName || defaultPerson?.firstName
      ? [defaultPerson.lastName, defaultPerson.firstName].filter(Boolean).join(" ").trim()
      : "");
  const [label, setLabel] = useState(defaultLabel);
  const [recipientType, setRecipientType] = useState<"PERSON" | "COMPANY">(
    (initialData?.recipientType as "PERSON" | "COMPANY") ?? "PERSON",
  );
  const [deliveryType, setDeliveryType] = useState<"WAREHOUSE" | "POSTOMAT" | "ADDRESS">(
    (initialData?.deliveryType as "WAREHOUSE" | "POSTOMAT" | "ADDRESS") ?? "WAREHOUSE",
  );
  const [firstName, setFirstName] = useState(
    initialData?.firstName ?? defaultPerson?.firstName ?? "",
  );
  const [lastName, setLastName] = useState(initialData?.lastName ?? defaultPerson?.lastName ?? "");
  const [phone, setPhone] = useState(initialData?.phone ?? defaultPerson?.phone ?? "");
  const [cityRef, setCityRef] = useState(initialData?.cityRef ?? "");
  const [cityName, setCityName] = useState(initialData?.cityName ?? "");
  const [warehouseRef, setWarehouseRef] = useState(initialData?.warehouseRef ?? "");
  const [warehouseLabel, setWarehouseLabel] = useState(
    initialData?.warehouseNumber ? `${initialData.warehouseNumber} — ${initialData.cityName ?? ""}` : "",
  );
  const [warehouseNumber, setWarehouseNumber] = useState(initialData?.warehouseNumber ?? "");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const trimmedLabel = label.trim();
    if (!trimmedLabel) {
      setError("Label is required.");
      return;
    }
    if ((deliveryType === "WAREHOUSE" || deliveryType === "POSTOMAT") && !cityRef) {
      setError("Select a city from the directory.");
      return;
    }
    if ((deliveryType === "WAREHOUSE" || deliveryType === "POSTOMAT") && !warehouseRef) {
      setError("Select a warehouse from the directory.");
      return;
    }
    setSaving(true);
    setError(null);
    try {
      const payload = {
        label: trimmedLabel,
        recipientType,
        deliveryType,
        firstName: firstName.trim() || null,
        lastName: lastName.trim() || null,
        phone: phone.trim() || null,
        cityRef: cityRef.trim() || null,
        cityName: cityName.trim() || null,
        warehouseRef: warehouseRef.trim() || null,
        warehouseNumber: warehouseNumber.trim() || null,
      };
      if (isEdit && profileId) {
        await apiHttp.patch(`/contacts/${contactId}/shipping-profiles/${profileId}`, payload);
      } else {
        await apiHttp.post(`/contacts/${contactId}/shipping-profiles`, payload);
      }
      onSaved();
      onClose();
    } catch (e) {
      const msg =
        (e as { response?: { data?: { message?: string } } })?.response?.data?.message ??
        (e instanceof Error ? e.message : "Failed to create profile");
      setError(msg);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div
      className="fixed inset-0 z-[60] flex items-center justify-center bg-black/30 px-4 py-4 backdrop-blur-sm"
      role="presentation"
      onClick={onClose}
    >
      <div
        className="flex max-h-[90vh] w-full max-w-md flex-col overflow-hidden rounded-2xl bg-white shadow-xl"
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal
      >
        <div className="shrink-0 border-b border-zinc-200 px-5 py-4">
          <div className="flex items-center justify-between">
            <h3 className="text-base font-semibold text-zinc-900">
              {isEdit ? "Edit delivery profile" : "Add delivery profile"}
            </h3>
            <button
              type="button"
              onClick={onClose}
              className="rounded-md border border-zinc-200 px-2 py-1 text-sm text-zinc-700 hover:bg-zinc-50"
            >
              ✕
            </button>
          </div>
        </div>
        <form onSubmit={handleSubmit} className="flex min-h-0 flex-1 flex-col overflow-hidden">
          <div className="min-h-0 flex-1 overflow-auto px-5 py-4">
            <div className="space-y-3">
          {error && (
            <div className="rounded-md border border-red-100 bg-red-50 p-2 text-sm text-red-700">
              {error}
            </div>
          )}
          <div>
            <label className="block text-xs font-medium text-zinc-600">Label *</label>
            <input
              type="text"
              value={label}
              onChange={(e) => setLabel(e.target.value)}
              className="mt-1 w-full rounded-md border border-zinc-300 px-3 py-2 text-sm focus:border-zinc-500 focus:outline-none"
              placeholder="e.g. Home, Office"
              disabled={saving}
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-zinc-600">Recipient type</label>
            <select
              value={recipientType}
              onChange={(e) => setRecipientType(e.target.value as "PERSON" | "COMPANY")}
              className="mt-1 w-full rounded-md border border-zinc-300 px-3 py-2 text-sm focus:border-zinc-500 focus:outline-none"
              disabled={saving}
            >
              <option value="PERSON">Person</option>
              <option value="COMPANY">Company</option>
            </select>
          </div>
          <div>
            <label className="block text-xs font-medium text-zinc-600">Delivery type</label>
            <select
              value={deliveryType}
              onChange={(e) =>
                setDeliveryType(e.target.value as "WAREHOUSE" | "POSTOMAT" | "ADDRESS")
              }
              className="mt-1 w-full rounded-md border border-zinc-300 px-3 py-2 text-sm focus:border-zinc-500 focus:outline-none"
              disabled={saving}
            >
              <option value="WAREHOUSE">Warehouse</option>
              <option value="POSTOMAT">Postomat</option>
              <option value="ADDRESS">Address</option>
            </select>
          </div>
          {recipientType === "PERSON" && (
            <>
              <div>
                <label className="block text-xs font-medium text-zinc-600">First name</label>
                <input
                  type="text"
                  value={firstName}
                  onChange={(e) => setFirstName(e.target.value)}
                  className="mt-1 w-full rounded-md border border-zinc-300 px-3 py-2 text-sm focus:border-zinc-500 focus:outline-none"
                  disabled={saving}
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-zinc-600">Last name</label>
                <input
                  type="text"
                  value={lastName}
                  onChange={(e) => setLastName(e.target.value)}
                  className="mt-1 w-full rounded-md border border-zinc-300 px-3 py-2 text-sm focus:border-zinc-500 focus:outline-none"
                  disabled={saving}
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-zinc-600">Phone</label>
                <input
                  type="text"
                  value={phone}
                  onChange={(e) => setPhone(e.target.value)}
                  className="mt-1 w-full rounded-md border border-zinc-300 px-3 py-2 text-sm focus:border-zinc-500 focus:outline-none"
                  disabled={saving}
                />
              </div>
            </>
          )}
          <div>
            <label className="block text-xs font-medium text-zinc-600">
              City (from directory)
            </label>
            <NpCitySelect
              valueRef={cityRef}
              valueLabel={cityName}
              onChange={(ref, name) => {
                setCityRef(ref);
                setCityName(name);
                if (deliveryType !== "ADDRESS") {
                  setWarehouseRef("");
                  setWarehouseLabel("");
                  setWarehouseNumber("");
                }
              }}
              disabled={saving}
              placeholder="Type at least 2 characters…"
            />
          </div>
          {(deliveryType === "WAREHOUSE" || deliveryType === "POSTOMAT") && (
            <div>
              <label className="block text-xs font-medium text-zinc-600">
                {deliveryType === "POSTOMAT"
                  ? "Postomat (from directory)"
                  : "Warehouse (from directory)"}
              </label>
              <NpWarehouseSelect
                key={deliveryType}
                cityRef={cityRef}
                type={deliveryType}
                valueRef={warehouseRef}
                valueLabel={warehouseLabel}
                onChange={(ref, lbl, num) => {
                  setWarehouseRef(ref);
                  setWarehouseLabel(lbl);
                  setWarehouseNumber(num ?? "");
                }}
                disabled={saving}
                placeholder="Type to search…"
              />
            </div>
          )}
            </div>
          </div>
          <div className="shrink-0 flex justify-end gap-2 border-t border-zinc-200 bg-zinc-50 px-5 py-3">
            <button
              type="button"
              onClick={onClose}
              className="rounded-md border border-zinc-200 px-3 py-2 text-sm text-zinc-700 hover:bg-zinc-50"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={saving}
              className="btn-primary"
            >
              {saving ? "Saving…" : "Add profile"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

function ContactDeliveryProfilesTab({
  isCreate,
  contactId,
  contactPerson,
}: {
  isCreate: boolean;
  apiBaseUrl: string;
  contactId: string;
  contactPerson?: { firstName: string; lastName: string; phone: string };
}) {
  const [profiles, setProfiles] = useState<ShippingProfile[]>([]);
  const [loading, setLoading] = useState(false);
  const [addModalOpen, setAddModalOpen] = useState(false);
  const [editingProfile, setEditingProfile] = useState<ShippingProfile | null>(null);

  const loadProfiles = useCallback(() => {
    if (isCreate) return;
    setLoading(true);
    apiHttp
      .get<{ items?: ShippingProfile[] } | ShippingProfile[]>(
        `/contacts/${contactId}/shipping-profiles`,
      )
      .then((res) => {
        const data = res.data;
        setProfiles(Array.isArray(data) ? data : data?.items ?? []);
      })
      .catch(() => setProfiles([]))
      .finally(() => setLoading(false));
  }, [isCreate, contactId]);

  useEffect(() => {
    loadProfiles();
  }, [loadProfiles]);

  if (isCreate) {
    return <p className="text-sm text-zinc-500">Save the contact first to see delivery profiles.</p>;
  }
  if (loading && profiles.length === 0) {
    return <p className="text-sm text-zinc-500">Loading…</p>;
  }
  return (
    <>
      <EntitySection
        title="Delivery profiles"
        rightAction={
          <button
            type="button"
            onClick={() => {
              setEditingProfile(null);
              setAddModalOpen(true);
            }}
            className="rounded-md border border-zinc-200 px-2 py-1.5 text-xs font-medium text-zinc-700 hover:bg-zinc-50"
          >
            Add profile
          </button>
        }
      >
        {profiles.length === 0 ? (
          <p className="text-sm text-zinc-500">No delivery profiles yet.</p>
        ) : (
          <ul className="space-y-2 text-sm">
            {profiles.map((p) => (
              <li
                key={p.id}
                className="flex items-start justify-between gap-2 rounded-md border border-zinc-200 px-3 py-2"
              >
                <div className="min-w-0 flex-1">
                  <span className="font-medium">{p.label || "Unnamed"}</span>
                  {p.isDefault && (
                    <span className="ml-2 rounded bg-zinc-100 px-1.5 py-0.5 text-xs">Default</span>
                  )}
                  {(p.cityName || p.warehouseNumber) && (
                    <div className="mt-1 text-xs text-zinc-500">
                      {[p.cityName, p.warehouseNumber].filter(Boolean).join(" • ")}
                    </div>
                  )}
                </div>
                <div className="flex shrink-0 items-center gap-0.5">
                  <button
                    type="button"
                    onClick={() => {
                      setAddModalOpen(false);
                      setEditingProfile(p);
                    }}
                    className="rounded p-1.5 text-zinc-500 hover:bg-zinc-100 hover:text-zinc-700"
                    title="Edit"
                    aria-label="Edit profile"
                  >
                    <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        strokeWidth={2}
                        d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z"
                      />
                    </svg>
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      if (!confirm(`Delete profile "${p.label || "Unnamed"}"?`)) return;
                      apiHttp
                        .delete(`/contacts/${contactId}/shipping-profiles/${p.id}`)
                        .then(() => loadProfiles())
                        .catch(() => {});
                    }}
                    className="rounded p-1.5 text-zinc-500 hover:bg-red-50 hover:text-red-600"
                    title="Delete"
                    aria-label="Delete profile"
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
                </div>
              </li>
            ))}
          </ul>
        )}
      </EntitySection>
      {(addModalOpen || editingProfile) && (
        <AddShippingProfileModal
          key={editingProfile?.id ?? "add"}
          contactId={contactId}
          profileId={editingProfile?.id}
          initialData={editingProfile ?? undefined}
          defaultPerson={
            !editingProfile && profiles.length === 0 && contactPerson
              ? contactPerson
              : undefined
          }
          onClose={() => {
            setAddModalOpen(false);
            setEditingProfile(null);
          }}
          onSaved={loadProfiles}
        />
      )}
    </>
  );
}

type Contact = {
  id: string;
  companyId?: string | null;
  company?: { id: string; name: string } | null;
  firstName: string;
  lastName: string;
  phone: string;
  email?: string | null;
  position?: string | null;
  address?: string | null;
  ownerId?: string | null;
  owner?: { id: string; fullName: string; email: string } | null;
  isPrimary: boolean;
  createdAt: string;
  updatedAt: string;
};

type Props = {
  apiBaseUrl: string;
  contactId: string; // "new"
  onClose: () => void;
  onUpdate: () => void;
  onOpenCompany?: (id: string) => void;
};

export function ContactModal({ apiBaseUrl, contactId, onClose, onUpdate, onOpenCompany }: Props) {
  const isCreate = contactId === "new";

  const [contact, setContact] = useState<Contact | null>(null);
  const [loading, setLoading] = useState(!isCreate);
  const [err, setErr] = useState<string | null>(null);

  const [saving, setSaving] = useState(false);
  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [phone, setPhone] = useState("");
  const [email, setEmail] = useState("");
  const [position, setPosition] = useState("");
  const [address, setAddress] = useState("");
  const [ownerId, setOwnerId] = useState<string | null>(null);
  const [companyId, setCompanyId] = useState<string | null>(null);

  const [companies, setCompanies] = useState<{ id: string; name: string }[]>([]);
  const [loadingCompanies, setLoadingCompanies] = useState(false);
  const [users, setUsers] = useState<{ id: string; fullName: string; email: string }[]>([]);
  const [loadingUsers, setLoadingUsers] = useState(false);

  const [orderId, setOrderId] = useState<string | null>(null);
  const [createOrderOpen, setCreateOrderOpen] = useState(false);
  const [ordersReloadKey, setOrdersReloadKey] = useState(0);

  type LeftTabId = "main" | "orders" | "delivery-profiles" | "change-history";
  const [leftTab, setLeftTab] = useState<LeftTabId>("main");

  const cancelInlineEditRef = useRef<(() => void) | null>(null);

  const canClose = !saving;

  const title = useMemo(() => (isCreate ? "New contact" : "Contact"), [isCreate]);

  const fetchCompanies = useCallback(async () => {
    setLoadingCompanies(true);
    try {
      const res = await apiHttp.get<{ items?: { id: string; name: string }[] }>(
        "/companies?page=1&pageSize=200",
      );
      setCompanies(Array.isArray(res.data?.items) ? res.data.items : []);
    } finally {
      setLoadingCompanies(false);
    }
  }, []);

  const fetchUsers = useCallback(async () => {
    setLoadingUsers(true);
    try {
      const res = await apiHttp.get<{ items?: { id: string; fullName: string; email: string }[] }>(
        "/users",
      );
      setUsers(Array.isArray(res.data?.items) ? res.data.items : []);
    } finally {
      setLoadingUsers(false);
    }
  }, []);

  const refresh = useCallback(async () => {
    if (isCreate) return;
    setLoading(true);
    setErr(null);
    try {
      const res = await apiHttp.get<Contact>(`/contacts/${contactId}`);
      const data = res.data as Contact;
      setContact(data);
      setFirstName(data.firstName ?? "");
      setLastName(data.lastName ?? "");
      setPhone(data.phone ?? "");
      setEmail((data.email ?? "") as string);
      setPosition((data.position ?? "") as string);
      setAddress((data.address ?? "") as string);
      setOwnerId(data.ownerId ?? null);
      setCompanyId(data.companyId ?? null);
      await Promise.all([fetchCompanies(), fetchUsers()]);
    } catch (e) {
      const msg =
        (e as { response?: { data?: { message?: string } } })?.response?.data?.message ??
        (e instanceof Error ? e.message : "Failed to load contact");
      setContact(null);
      setErr(msg);
    } finally {
      setLoading(false);
    }
  }, [contactId, isCreate, fetchCompanies, fetchUsers]);

  useEffect(() => {
    setErr(null);
    setContact(null);
    setOrderId(null);
    setCreateOrderOpen(false);
    if (isCreate) {
      setLoading(false);
      setFirstName("");
      setLastName("");
      setPhone("");
      setEmail("");
      setPosition("");
      setAddress("");
      setOwnerId(null);
      setCompanyId(null);
      void Promise.all([fetchCompanies(), fetchUsers()]);
      return;
    }
    void refresh();
  }, [isCreate, refresh, fetchCompanies, fetchUsers]);

  const patchContact = useCallback(
    async (payload: Partial<{
      firstName: string;
      lastName: string;
      phone: string;
      email: string | null;
      position: string | null;
      address: string | null;
      ownerId: string | null;
      companyId: string | null;
    }>) => {
      const res = await apiHttp.patch<Contact>(`/contacts/${contactId}`, payload);
      const data = res.data as Contact;
      setContact(data);
      if (payload.firstName !== undefined) setFirstName(payload.firstName);
      if (payload.lastName !== undefined) setLastName(payload.lastName);
      if (payload.phone !== undefined) setPhone(payload.phone);
      if (payload.email !== undefined) setEmail(payload.email ?? "");
      if (payload.position !== undefined) setPosition(payload.position ?? "");
      if (payload.address !== undefined) setAddress(payload.address ?? "");
      if (payload.ownerId !== undefined) setOwnerId(payload.ownerId);
      if (payload.companyId !== undefined) setCompanyId(payload.companyId);
      onUpdate();
    },
    [contactId, onUpdate],
  );

  const handleEscape = useCallback(() => {
    if (cancelInlineEditRef.current) {
      cancelInlineEditRef.current();
      cancelInlineEditRef.current = null;
      return true;
    }
    if (orderId) {
      setOrderId(null);
      return true;
    }
    if (createOrderOpen) {
      setCreateOrderOpen(false);
      return true;
    }
    return false;
  }, [orderId, createOrderOpen]);

  const saveCreate = async () => {
    setSaving(true);
    setErr(null);
    try {
      const payload = {
        firstName: firstName.trim(),
        lastName: lastName.trim(),
        phone: phone.trim(),
        email: email.trim() || null,
        position: position.trim() || null,
        address: address.trim() || null,
        ownerId: ownerId || null,
        companyId: companyId || null,
      };
      if (!payload.firstName) throw new Error("First name is required");
      if (!payload.lastName) throw new Error("Last name is required");
      if (!payload.phone) throw new Error("Phone is required");
      await apiHttp.post("/contacts", payload);
      onUpdate();
      onClose();
    } catch (e) {
      const msg =
        (e as { response?: { data?: { message?: string } } })?.response?.data?.message ??
        (e instanceof Error ? e.message : "Failed");
      setErr(msg);
    } finally {
      setSaving(false);
    }
  };

  const fullName = useMemo(() => {
    const a = (contact?.firstName ?? "").trim();
    const b = (contact?.lastName ?? "").trim();
    return `${a} ${b}`.trim() || null;
  }, [contact]);

  const companyOptions = useMemo(
    () => companies.map((c) => ({ id: c.id, label: c.name })),
    [companies],
  );

  const companyOptionsWithEmpty = useMemo(
    () => [{ id: "", label: "— No company" }, ...companyOptions],
    [companyOptions],
  );

  const userOptions = useMemo(
    () => users.map((u) => ({ id: u.id, label: u.fullName || u.email })),
    [users],
  );

  const registerCancel = useCallback((cancel: (() => void) | null) => {
    cancelInlineEditRef.current = cancel;
  }, []);

  const aboutContactSection = useMemo(() => {
    if (loading) {
      return <div className="text-sm text-zinc-500">Loading…</div>;
    }
    if (err) {
      return (
        <div className="rounded-md border border-red-100 bg-red-50 p-3 text-sm text-red-700">
          {err}
        </div>
      );
    }

    if (isCreate) {
      return (
        <>
          <label className="block text-sm font-medium text-zinc-700">First name</label>
          <input
            className="mt-1 w-full rounded-md border border-zinc-200 px-3 py-2 text-sm outline-none focus:border-zinc-400"
            value={firstName}
            onChange={(e) => setFirstName(e.target.value)}
            placeholder="John"
            disabled={saving}
          />
          <label className="mt-3 block text-sm font-medium text-zinc-700">Last name</label>
          <input
            className="mt-1 w-full rounded-md border border-zinc-200 px-3 py-2 text-sm outline-none focus:border-zinc-400"
            value={lastName}
            onChange={(e) => setLastName(e.target.value)}
            placeholder="Doe"
            disabled={saving}
          />
          <label className="mt-3 block text-sm font-medium text-zinc-700">Phone</label>
          <input
            className="mt-1 w-full rounded-md border border-zinc-200 px-3 py-2 text-sm outline-none focus:border-zinc-400"
            value={phone}
            onChange={(e) => setPhone(e.target.value)}
            placeholder="+1…"
            disabled={saving}
          />
          <label className="mt-3 block text-sm font-medium text-zinc-700">Email</label>
          <input
            className="mt-1 w-full rounded-md border border-zinc-200 px-3 py-2 text-sm outline-none focus:border-zinc-400"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="john@example.com"
            disabled={saving}
          />
          <label className="mt-3 block text-sm font-medium text-zinc-700">Position</label>
          <input
            className="mt-1 w-full rounded-md border border-zinc-200 px-3 py-2 text-sm outline-none focus:border-zinc-400"
            value={position}
            onChange={(e) => setPosition(e.target.value)}
            placeholder="Manager"
            disabled={saving}
          />
          <label className="mt-3 block text-sm font-medium text-zinc-700">Address</label>
          <input
            className="mt-1 w-full rounded-md border border-zinc-200 px-3 py-2 text-sm outline-none focus:border-zinc-400"
            value={address}
            onChange={(e) => setAddress(e.target.value)}
            placeholder="Street, city, index"
            disabled={saving}
          />
          <label className="mt-3 block text-sm font-medium text-zinc-700">Responsible manager</label>
          <div className="mt-1">
            <SearchableSelectLite
              value={ownerId}
              options={userOptions}
              placeholder="— Not assigned"
              disabled={saving || loadingUsers}
              isLoading={loadingUsers}
              onChange={(id) => setOwnerId(id)}
            />
          </div>
          <label className="mt-3 block text-sm font-medium text-zinc-700">Company</label>
          <div className="mt-1 flex gap-2">
            <div className="min-w-0 flex-1">
              <SearchableSelectLite
                value={companyId ?? ""}
                options={companyOptionsWithEmpty}
                placeholder="— No company"
                disabled={saving || loadingCompanies}
                isLoading={loadingCompanies}
                onChange={(id) => setCompanyId(id === "" ? null : id)}
              />
            </div>
            {companyId && onOpenCompany ? (
              <button
                type="button"
                onClick={() => onOpenCompany(companyId)}
                className="shrink-0 rounded-md border border-zinc-200 px-2 py-1.5 text-xs text-zinc-700 hover:bg-zinc-50"
              >
                Open company
              </button>
            ) : null}
            {onOpenCompany ? (
              <button
                type="button"
                onClick={() => onOpenCompany("new")}
                className="shrink-0 rounded-md border border-zinc-200 px-2 py-1.5 text-xs text-zinc-700 hover:bg-zinc-50"
              >
                Create company
              </button>
            ) : null}
          </div>
        </>
      );
    }

    if (!contact) {
      return <div className="text-sm text-zinc-500">Not found</div>;
    }

    return (
      <div className="space-y-3">
        <InlineEditableField
          label="First name"
          value={contact.firstName}
          placeholder="Click to add…"
          kind="text"
          required
          disabled={saving}
          onSave={async (next) => {
            const v = next ?? "";
            await patchContact({ firstName: v });
          }}
          onRegisterCancel={registerCancel}
        />
        <InlineEditableField
          label="Last name"
          value={contact.lastName}
          placeholder="Click to add…"
          kind="text"
          required
          disabled={saving}
          onSave={async (next) => {
            const v = next ?? "";
            await patchContact({ lastName: v });
          }}
          onRegisterCancel={registerCancel}
        />
        <InlineEditableField
          label="Phone"
          value={contact.phone}
          placeholder="Click to add…"
          kind="text"
          required
          disabled={saving}
          onSave={async (next) => {
            const v = next ?? "";
            await patchContact({ phone: v });
          }}
          onRegisterCancel={registerCancel}
        />
        <InlineEditableField
          label="Email"
          value={contact.email ?? ""}
          placeholder="Click to add…"
          kind="text"
          disabled={saving}
          onSave={async (next) => patchContact({ email: next })}
          onRegisterCancel={registerCancel}
        />
        <InlineEditableField
          label="Position"
          value={contact.position ?? ""}
          placeholder="Click to add…"
          kind="text"
          disabled={saving}
          onSave={async (next) => patchContact({ position: next })}
          onRegisterCancel={registerCancel}
        />
        <InlineEditableField
          label="Address"
          value={contact.address ?? ""}
          placeholder="Click to add…"
          kind="text"
          disabled={saving}
          onSave={async (next) => patchContact({ address: next })}
          onRegisterCancel={registerCancel}
        />
        <div className="flex items-center justify-between gap-4 py-1">
          <span className="text-sm text-zinc-500">Responsible manager</span>
          <SearchableSelectLite
            variant="inline"
            value={ownerId}
            options={userOptions}
            placeholder="Click to add…"
            disabled={saving || loadingUsers}
            isLoading={loadingUsers}
            onChange={async (id) => {
              setOwnerId(id);
              await patchContact({ ownerId: id });
            }}
          />
        </div>
        <div className="flex items-center justify-between gap-4 py-1">
          <span className="text-sm text-zinc-500">Company</span>
          <div className="flex min-w-0 flex-1 items-center justify-end gap-2">
            <SearchableSelectLite
              variant="inline"
              value={companyId ?? ""}
              options={companyOptionsWithEmpty}
              placeholder="Click to add…"
              disabled={saving || loadingCompanies}
              isLoading={loadingCompanies}
              onChange={async (id) => {
                const next = id === "" ? null : id;
                setCompanyId(next);
                await patchContact({ companyId: next });
              }}
              onCreate={onOpenCompany ? () => onOpenCompany("new") : undefined}
              createLabel="Create company"
            />
            {onOpenCompany && companyId ? (
              <button
                type="button"
                onClick={() => onOpenCompany(companyId)}
                className="shrink-0 text-sm text-zinc-700 hover:underline"
              >
                Open company
              </button>
            ) : null}
          </div>
        </div>
        <div className="pt-2 text-xs text-zinc-500">
          Created: {new Date(contact.createdAt).toLocaleString()}
          <br />
          Updated: {new Date(contact.updatedAt).toLocaleString()}
        </div>
      </div>
    );
  }, [
    loading,
    err,
    isCreate,
    saving,
    firstName,
    lastName,
    phone,
    email,
    position,
    companyId,
    companyOptions,
    loadingCompanies,
    contact,
    onOpenCompany,
    patchContact,
    registerCancel,
  ]);

  const tabsUnderHeader = (
    <div className="flex gap-1 py-2">
      {(["main", "orders", "delivery-profiles", "change-history"] as const).map((tab) => (
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
              : tab === "delivery-profiles"
                ? "Delivery profiles"
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
              <EntitySection
                title="About contact"
              >
                {aboutContactSection}
              </EntitySection>
            </div>
          ) : (
            <div className="grid min-h-0 flex-1 grid-cols-1 gap-0 lg:grid-cols-2">
              <div className="min-h-0 overflow-auto border-zinc-200 lg:border-r lg:pr-4">
                <EntitySection
                  title="About contact"
                  rightAction={
                    contact?.companyId && onOpenCompany ? (
                      <button
                        type="button"
                        onClick={() => onOpenCompany(contact.companyId!)}
                        className="rounded-md border border-zinc-200 px-2 py-1.5 text-xs text-zinc-700 hover:bg-zinc-50"
                      >
                        Open company
                      </button>
                    ) : null
                  }
                >
                  {aboutContactSection}
                </EntitySection>
              </div>
              <div className="min-h-0 overflow-auto pt-4 lg:pt-0 lg:pl-4">
                <EntitySection title="Activity">
                  <ContactTimeline
                    apiBaseUrl={apiBaseUrl}
                    contactId={contactId}
                    showActivityButtons
                  />
                </EntitySection>
              </div>
            </div>
          )
        )}

        {leftTab === "orders" && (
          <>
            {isCreate ? (
              <p className="text-sm text-zinc-500">Save the contact first to see orders.</p>
            ) : (
              <EntitySection title="Orders">
                <div className="min-h-0 overflow-auto">
                  <EntityOrdersList
                    key={ordersReloadKey}
                    apiBaseUrl={apiBaseUrl}
                    query={`clientId=${contactId}&pageSize=50`}
                    onOpenOrder={(id) => setOrderId(id)}
                  />
                </div>
              </EntitySection>
            )}
          </>
        )}

        {leftTab === "delivery-profiles" && (
          <ContactDeliveryProfilesTab
            isCreate={isCreate}
            apiBaseUrl={apiBaseUrl}
            contactId={contactId}
            contactPerson={
              contact
                ? {
                    firstName: contact.firstName ?? "",
                    lastName: contact.lastName ?? "",
                    phone: contact.phone ?? "",
                  }
                : undefined
            }
          />
        )}

        {leftTab === "change-history" && (
          <>
            {isCreate ? (
              <p className="text-sm text-zinc-500">Save the contact first to see change history.</p>
            ) : (
              <EntitySection title="Change history">
                <p className="text-sm text-zinc-500">No change history yet.</p>
              </EntitySection>
            )}
          </>
        )}
    </div>
  );

  const footer = isCreate ? (
    <div className="flex justify-end gap-2">
      <button
        type="button"
        onClick={() => onClose()}
        disabled={saving}
        className="rounded-md border border-zinc-200 px-3 py-2 text-sm text-zinc-700 hover:bg-zinc-50 disabled:opacity-50"
      >
        Cancel
      </button>
      <button
        type="button"
        onClick={() => void saveCreate()}
        disabled={saving}
        className="btn-primary"
      >
        {saving ? "Saving…" : "Save"}
      </button>
    </div>
  ) : null;

  return (
    <>
      <EntityModalShell
        title={title}
        subtitle={!isCreate && fullName ? fullName : undefined}
        headerActions={
          <>
            {!isCreate && (
              <button
                type="button"
                onClick={() => setCreateOrderOpen(true)}
                className="btn-primary py-1.5"
              >
                + Order
              </button>
            )}
            <button
              type="button"
              onClick={() => canClose && onClose()}
              disabled={!canClose}
              className="rounded-md border border-zinc-200 px-3 py-1.5 text-sm text-zinc-700 hover:bg-zinc-50 disabled:opacity-50"
            >
              Close
            </button>
          </>
        }
        tabsUnderHeader={tabsUnderHeader}
        left={leftContent}
        right={null}
        footer={footer}
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
            setOrdersReloadKey((k) => k + 1);
          }}
        />
      ) : null}

      {createOrderOpen ? (
        <OrderModal
          apiBaseUrl={apiBaseUrl}
          orderId={null}
          prefill={{
            clientId: contactId,
            companyId: contact?.companyId ?? null,
          }}
          onClose={() => setCreateOrderOpen(false)}
          onSaved={() => {
            setCreateOrderOpen(false);
            setOrdersReloadKey((k) => k + 1);
          }}
        />
      ) : null}
    </>
  );
}

export default ContactModal;

"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { ContactTimeline } from "./ContactTimeline";
import { EntityOrdersList } from "@/components/EntityOrdersList";
import { OrderModal } from "../orders/OrderModal";

type Contact = {
  id: string;
  companyId?: string | null;
  firstName: string;
  lastName: string;
  phone: string;
  email?: string | null;
  position?: string | null;
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

export function ContactModal({ apiBaseUrl, contactId, onClose, onUpdate, onOpenCompany }: Props) {
  const isCreate = contactId === "new";

  const [tab, setTab] = useState<TabKey>("general");

  const [contact, setContact] = useState<Contact | null>(null);
  const [loading, setLoading] = useState(!isCreate);
  const [err, setErr] = useState<string | null>(null);

  const [isEditing, setIsEditing] = useState(isCreate);
  const [saving, setSaving] = useState(false);

  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [phone, setPhone] = useState("");
  const [email, setEmail] = useState("");
  const [position, setPosition] = useState("");

  // orders
  const [orderId, setOrderId] = useState<string | null>(null);
  const [createOrderOpen, setCreateOrderOpen] = useState(false);
  const [ordersReloadKey, setOrdersReloadKey] = useState(0);

  const canClose = !saving;

  const title = useMemo(() => {
    if (isCreate) return "Add contact";
    return isEditing ? "Edit contact" : "Contact";
  }, [isCreate, isEditing]);

  const refresh = useCallback(async () => {
    if (isCreate) return;
    setLoading(true);
    setErr(null);
    try {
      const r = await fetch(`${apiBaseUrl}/contacts/${contactId}`, { cache: "no-store" });
      const t = await r.text();
      if (!r.ok) throw new Error(t || `Failed (${r.status})`);
      const data = JSON.parse(t) as Contact;

      setContact(data);

      setFirstName(data.firstName ?? "");
      setLastName(data.lastName ?? "");
      setPhone(data.phone ?? "");
      setEmail((data.email ?? "") as string);
      setPosition((data.position ?? "") as string);
    } catch (e) {
      setContact(null);
      setErr(e instanceof Error ? e.message : "Failed to load contact");
    } finally {
      setLoading(false);
    }
  }, [apiBaseUrl, contactId, isCreate]);

  useEffect(() => {
    setErr(null);
    setContact(null);
    setTab("general");
    setOrderId(null);
    setCreateOrderOpen(false);

    if (isCreate) {
      setIsEditing(true);
      setLoading(false);
      setFirstName("");
      setLastName("");
      setPhone("");
      setEmail("");
      setPosition("");
      return;
    }

    setIsEditing(false);
    void refresh();
  }, [isCreate, refresh]);

  // ESC behavior + close nested order modal first
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return;

      if (orderId) {
        setOrderId(null);
        return;
      }
      if (createOrderOpen) {
        setCreateOrderOpen(false);
        return;
      }

      if (isEditing && !isCreate) setIsEditing(false);
      else if (canClose) onClose();
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [orderId, createOrderOpen, isEditing, isCreate, canClose, onClose]);

  const startEdit = () => {
    if (!contact) return;
    setIsEditing(true);
    setFirstName(contact.firstName ?? "");
    setLastName(contact.lastName ?? "");
    setPhone(contact.phone ?? "");
    setEmail((contact.email ?? "") as string);
    setPosition((contact.position ?? "") as string);
  };

  const save = async () => {
    setSaving(true);
    setErr(null);
    try {
      const payload = {
        firstName: firstName.trim(),
        lastName: lastName.trim(),
        phone: phone.trim(),
        email: email.trim() || null,
        position: position.trim() || null,
      };

      if (!payload.firstName) throw new Error("First name is required");
      if (!payload.lastName) throw new Error("Last name is required");
      if (!payload.phone) throw new Error("Phone is required");

      const url = isCreate ? `${apiBaseUrl}/contacts` : `${apiBaseUrl}/contacts/${contactId}`;
      const method = isCreate ? "POST" : "PATCH";

      const r = await fetch(url, {
        method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
        cache: "no-store",
      });

      const t = await r.text();
      if (!r.ok) throw new Error(t || `Failed (${r.status})`);

      setIsEditing(false);
      onUpdate();
      onClose();
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Failed");
    } finally {
      setSaving(false);
    }
  };

  const fullName = useMemo(() => {
    const a = (contact?.firstName ?? "").trim();
    const b = (contact?.lastName ?? "").trim();
    const s = `${a} ${b}`.trim();
    return s || null;
  }, [contact]);

  // "+ Order" в header: открываем create order modal
  const openCreateOrder = () => setCreateOrderOpen(true);

  return (
    <>
      {/* Contact modal */}
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
            <div className="min-w-0 pr-1">
              <div className="text-base font-semibold text-zinc-900">{title}</div>
              {!isCreate && fullName ? (
                <div className="mt-0.5 text-sm text-zinc-500">{fullName}</div>
              ) : null}
            </div>

            <div className="flex items-center gap-2">
              {!isCreate && tab === "orders" ? (
                <button
                  type="button"
                  onClick={openCreateOrder}
                  className="rounded-md bg-zinc-900 px-3 py-1.5 text-sm font-medium text-white hover:bg-zinc-800"
                >
                  + Order
                </button>
              ) : null}

              {!isCreate && !isEditing && !loading && !err ? (
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
          {!isCreate ? <Tabs value={tab} onChange={setTab} /> : null}

          {/* Content */}
          <div className="flex-1 min-h-0 overflow-hidden">
            {tab === "orders" && !isCreate ? (
              <div className="h-full p-5">
                <div className="min-h-0 h-full overflow-auto">
                  <EntityOrdersList
                    key={ordersReloadKey}
                    apiBaseUrl={apiBaseUrl}
                    query={`clientId=${contactId}&pageSize=50`}
                    onOpenOrder={(id) => setOrderId(id)}
                  />
                </div>
              </div>
            ) : (
              <div className="grid h-full grid-cols-1 gap-6 p-5 lg:grid-cols-2">
                {/* Left */}
                <div className="min-h-0 overflow-auto">
                  {loading ? (
                    <div className="text-sm text-zinc-500">Loading…</div>
                  ) : err ? (
                    <div className="rounded-md border border-red-100 bg-red-50 p-3 text-sm text-red-700">
                      {err}
                    </div>
                  ) : isEditing ? (
                    <>
                      <label className="block text-sm font-medium text-zinc-700">First name</label>
                      <input
                        className="mt-1 w-full rounded-md border border-zinc-200 px-3 py-2 text-sm outline-none focus:border-zinc-400"
                        value={firstName}
                        onChange={(e) => setFirstName(e.target.value)}
                        placeholder="Ivan"
                        disabled={saving}
                      />

                      <label className="mt-3 block text-sm font-medium text-zinc-700">
                        Last name
                      </label>
                      <input
                        className="mt-1 w-full rounded-md border border-zinc-200 px-3 py-2 text-sm outline-none focus:border-zinc-400"
                        value={lastName}
                        onChange={(e) => setLastName(e.target.value)}
                        placeholder="Petrenko"
                        disabled={saving}
                      />

                      <label className="mt-3 block text-sm font-medium text-zinc-700">Phone</label>
                      <input
                        className="mt-1 w-full rounded-md border border-zinc-200 px-3 py-2 text-sm outline-none focus:border-zinc-400"
                        value={phone}
                        onChange={(e) => setPhone(e.target.value)}
                        placeholder="+380…"
                        disabled={saving}
                      />

                      <label className="mt-3 block text-sm font-medium text-zinc-700">Email</label>
                      <input
                        className="mt-1 w-full rounded-md border border-zinc-200 px-3 py-2 text-sm outline-none focus:border-zinc-400"
                        value={email}
                        onChange={(e) => setEmail(e.target.value)}
                        placeholder="ivan@test.com"
                        disabled={saving}
                      />

                      <label className="mt-3 block text-sm font-medium text-zinc-700">
                        Position
                      </label>
                      <input
                        className="mt-1 w-full rounded-md border border-zinc-200 px-3 py-2 text-sm outline-none focus:border-zinc-400"
                        value={position}
                        onChange={(e) => setPosition(e.target.value)}
                        placeholder="Manager"
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
                          onClick={() => !saving && (!isCreate ? setIsEditing(false) : onClose())}
                          className="rounded-md border border-zinc-200 px-3 py-2 text-sm text-zinc-700 hover:bg-zinc-50"
                        >
                          Cancel
                        </button>
                      </div>
                    </>
                  ) : !contact && !isCreate ? (
                    <div className="text-sm text-zinc-500">Not found</div>
                  ) : (
                    <div className="rounded-lg border border-zinc-200 bg-white p-4">
                      <div className="flex items-center justify-between">
                        <div className="text-sm font-semibold text-zinc-900">Details</div>

                        {contact?.companyId && onOpenCompany ? (
                          <button
                            type="button"
                            onClick={() => onOpenCompany(contact.companyId!)}
                            className="rounded-md border border-zinc-200 px-3 py-1.5 text-xs text-zinc-700 hover:bg-zinc-50"
                          >
                            Open company
                          </button>
                        ) : null}
                      </div>

                      {contact ? (
                        <div className="mt-3 space-y-2 text-sm">
                          <div className="flex items-center justify-between gap-4">
                            <div className="text-zinc-500">Name</div>
                            <div className="text-zinc-900">
                              {contact.firstName} {contact.lastName}
                            </div>
                          </div>

                          <div className="flex items-center justify-between gap-4">
                            <div className="text-zinc-500">Phone</div>
                            <div className="text-zinc-900">{contact.phone || "—"}</div>
                          </div>

                          <div className="flex items-center justify-between gap-4">
                            <div className="text-zinc-500">Email</div>
                            <div className="text-zinc-900">{contact.email || "—"}</div>
                          </div>

                          <div className="flex items-center justify-between gap-4">
                            <div className="text-zinc-500">Position</div>
                            <div className="text-zinc-900">{contact.position || "—"}</div>
                          </div>

                          <div className="pt-2 text-xs text-zinc-500">
                            Created: {new Date(contact.createdAt).toLocaleString()}
                            <br />
                            Updated: {new Date(contact.updatedAt).toLocaleString()}
                          </div>
                        </div>
                      ) : (
                        <div className="mt-3 text-sm text-zinc-500">
                          Fill fields and save to create.
                        </div>
                      )}
                    </div>
                  )}
                </div>

                {/* Right */}
                <div className="flex min-h-0 flex-col">
                  <div className="text-sm font-semibold text-zinc-900">Timeline</div>
                  <div className="mt-3 min-h-0 flex-1 overflow-auto">
                    {!isCreate ? (
                      <ContactTimeline apiBaseUrl={apiBaseUrl} contactId={contactId} />
                    ) : (
                      <div className="text-sm text-zinc-500">
                        Timeline will appear after creation.
                      </div>
                    )}
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Order modal (open existing) */}
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

      {/* Order modal (create) */}
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

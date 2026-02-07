"use client";

import { useEffect, useState, useCallback } from "react";
// ⚠️ ПРОВЕРЬ ПУТЬ К КОМПОНЕНТУ
import { SearchableSelect } from "../../components/SearchableSelect";

type Contact = {
  id: string;
  companyId?: string | null;
  company?: {
    id: string;
    name: string;
  };
  firstName: string;
  lastName: string;
  phone: string;
  email?: string | null;
  position?: string | null;
  isPrimary: boolean;
  createdAt: string;
  updatedAt: string;
};

type CompanyOption = {
  id: string;
  name: string;
};

type ContactModalProps = {
  apiBaseUrl: string;
  contactId: string | null;
  onClose: () => void;
  onUpdate: () => void;
  onOpenCompany?: (companyId: string) => void;
};

export function ContactModal({
  apiBaseUrl,
  contactId,
  onClose,
  onUpdate,
  onOpenCompany,
}: ContactModalProps) {
  const [contact, setContact] = useState<Contact | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [isEditing, setIsEditing] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);

  // Form state
  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [phone, setPhone] = useState("");
  const [email, setEmail] = useState("");
  const [position, setPosition] = useState("");
  const [editCompanyId, setEditCompanyId] = useState<string | null>(null);

  // Companies dropdown state
  const [companies, setCompanies] = useState<CompanyOption[]>([]);
  const [loadingCompanies, setLoadingCompanies] = useState(false);

  // Load contact details
  useEffect(() => {
    if (!contactId) return;

    const loadContact = async () => {
      try {
        setLoading(true);
        setError(null);
        const response = await fetch(`${apiBaseUrl}/contacts/${contactId}`);
        if (response.status === 404) {
          setError("Contact not found");
          setLoading(false);
          return;
        }
        if (!response.ok) {
          throw new Error(`Failed to load contact: ${response.statusText}`);
        }
        const data: Contact = await response.json();
        setContact(data);
        
        // Init form state
        setFirstName(data.firstName);
        setLastName(data.lastName);
        setPhone(data.phone);
        setEmail(data.email || "");
        setPosition(data.position || "");
        setEditCompanyId(data.companyId || null);
      } catch (err) {
        setError(err instanceof Error ? err.message : "Unknown error");
      } finally {
        setLoading(false);
      }
    };

    loadContact();
  }, [apiBaseUrl, contactId]);

  // Fetch Companies for dropdown (lazy load on edit)
  const fetchCompanies = useCallback(async () => {
    if (companies.length > 0) return; // Don't reload if already loaded
    
    setLoadingCompanies(true);
    try {
      const response = await fetch(`${apiBaseUrl}/companies?page=1&pageSize=100`);
      if (response.ok) {
        const data = await response.json();
        setCompanies(data.items || []);
      }
    } catch (e) {
      console.error("Failed to load companies", e);
    } finally {
      setLoadingCompanies(false);
    }
  }, [apiBaseUrl, companies.length]);

  // Trigger company fetch when editing starts
  useEffect(() => {
    if (isEditing) {
      void fetchCompanies();
    }
  }, [isEditing, fetchCompanies]);

  // Close on Escape key
  useEffect(() => {
    const handleEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape" && !submitting) {
        onClose();
      }
    };
    window.addEventListener("keydown", handleEscape);
    return () => window.removeEventListener("keydown", handleEscape);
  }, [onClose, submitting]);

  const handleSave = async () => {
    if (!contactId || !contact || submitting) return;

    // Validation
    if (!firstName.trim() || !lastName.trim() || !phone.trim()) {
      setSubmitError("First name, last name, and phone are required");
      return;
    }

    try {
      setSubmitting(true);
      setSubmitError(null);

      const updates: Record<string, unknown> = {};
      if (firstName !== contact.firstName) updates.firstName = firstName;
      if (lastName !== contact.lastName) updates.lastName = lastName;
      if (phone !== contact.phone) updates.phone = phone;
      if (email !== (contact.email || "")) updates.email = email || undefined;
      if (position !== (contact.position || "")) updates.position = position || undefined;
      
      // Handle company update
      const currentCompanyId = contact.companyId || null;
      if (editCompanyId !== currentCompanyId) {
        updates.companyId = editCompanyId; // can be string or null
      }

      if (Object.keys(updates).length === 0) {
        setIsEditing(false);
        return;
      }

      const response = await fetch(`${apiBaseUrl}/contacts/${contactId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(updates),
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(errorData.message || `Failed to update contact: ${response.statusText}`);
      }

      const updatedContact: Contact = await response.json();
      setContact(updatedContact);
      
      // Update local state
      setFirstName(updatedContact.firstName);
      setLastName(updatedContact.lastName);
      setPhone(updatedContact.phone);
      setEmail(updatedContact.email || "");
      setPosition(updatedContact.position || "");
      setEditCompanyId(updatedContact.companyId || null);
      
      setIsEditing(false);
      onUpdate();
    } catch (err) {
      setSubmitError(err instanceof Error ? err.message : "Unknown error");
    } finally {
      setSubmitting(false);
    }
  };

  const handleCancel = () => {
    if (!contact) return;
    setFirstName(contact.firstName);
    setLastName(contact.lastName);
    setPhone(contact.phone);
    setEmail(contact.email || "");
    setPosition(contact.position || "");
    setEditCompanyId(contact.companyId || null);
    
    setIsEditing(false);
    setSubmitError(null);
  };

  if (!contactId) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 px-4"
      onClick={() => {
        if (!submitting) onClose();
      }}
      role="presentation"
    >
      <div
        className="w-full max-w-2xl rounded-lg bg-white shadow-lg"
        onClick={(event) => event.stopPropagation()}
        role="presentation"
      >
        {/* Header */}
        <div className="flex items-center justify-between border-b border-zinc-200 px-6 py-4">
          <h2 className="text-lg font-semibold text-zinc-900">
            {isEditing ? "Edit Contact" : "Contact Details"}
          </h2>
          <button
            type="button"
            onClick={onClose}
            disabled={submitting}
            className="rounded-md p-1 text-zinc-600 hover:bg-zinc-100 disabled:opacity-50"
            aria-label="Close"
          >
            ✕
          </button>
        </div>

        {/* Content */}
        <div className="px-6 py-4">
          {loading && (
            <div className="flex items-center justify-center py-12">
              <p className="text-sm text-zinc-500">Loading...</p>
            </div>
          )}

          {error && (
            <div className="py-4">
              <p className="text-sm text-red-600">{error}</p>
            </div>
          )}

          {!loading && !error && contact && (
            <div className="space-y-6">
              {/* Basic Information Section */}
              <div>
                <h3 className="mb-3 text-xs font-semibold uppercase tracking-wider text-zinc-500">
                  Basic Information
                </h3>
                <div className="space-y-4">
                  {/* First Name */}
                  <div>
                    <label className="mb-1 block text-sm font-medium text-zinc-700">
                      First Name
                    </label>
                    {isEditing ? (
                      <input
                        type="text"
                        value={firstName}
                        onChange={(e) => setFirstName(e.target.value)}
                        className="w-full rounded-md border border-zinc-300 px-3 py-2 text-sm focus:border-zinc-900 focus:outline-none"
                      />
                    ) : (
                      <p className="text-sm text-zinc-900">{contact.firstName}</p>
                    )}
                  </div>

                  {/* Last Name */}
                  <div>
                    <label className="mb-1 block text-sm font-medium text-zinc-700">
                      Last Name
                    </label>
                    {isEditing ? (
                      <input
                        type="text"
                        value={lastName}
                        onChange={(e) => setLastName(e.target.value)}
                        className="w-full rounded-md border border-zinc-300 px-3 py-2 text-sm focus:border-zinc-900 focus:outline-none"
                      />
                    ) : (
                      <p className="text-sm text-zinc-900">{contact.lastName}</p>
                    )}
                  </div>

                  {/* Phone */}
                  <div>
                    <label className="mb-1 block text-sm font-medium text-zinc-700">
                      Phone
                    </label>
                    {isEditing ? (
                      <input
                        type="tel"
                        value={phone}
                        onChange={(e) => setPhone(e.target.value)}
                        className="w-full rounded-md border border-zinc-300 px-3 py-2 text-sm focus:border-zinc-900 focus:outline-none"
                      />
                    ) : (
                      <p className="text-sm text-zinc-900">{contact.phone}</p>
                    )}
                  </div>

                  {/* Email */}
                  <div>
                    <label className="mb-1 block text-sm font-medium text-zinc-700">
                      Email
                    </label>
                    {isEditing ? (
                      <input
                        type="email"
                        value={email}
                        onChange={(e) => setEmail(e.target.value)}
                        className="w-full rounded-md border border-zinc-300 px-3 py-2 text-sm focus:border-zinc-900 focus:outline-none"
                      />
                    ) : (
                      <p className="text-sm text-zinc-900">{contact.email || "—"}</p>
                    )}
                  </div>

                  {/* Position */}
                  <div>
                    <label className="mb-1 block text-sm font-medium text-zinc-700">
                      Position
                    </label>
                    {isEditing ? (
                      <input
                        type="text"
                        value={position}
                        onChange={(e) => setPosition(e.target.value)}
                        className="w-full rounded-md border border-zinc-300 px-3 py-2 text-sm focus:border-zinc-900 focus:outline-none"
                      />
                    ) : (
                      <p className="text-sm text-zinc-900">{contact.position || "—"}</p>
                    )}
                  </div>

                  {/* Company Dropdown */}
                  <div>
                    <label className="mb-1 block text-sm font-medium text-zinc-700">
                      Company
                    </label>
                    {isEditing ? (
                      <SearchableSelect
                        options={companies.map(c => ({ id: c.id, label: c.name }))}
                        value={editCompanyId}
                        onChange={(val) => setEditCompanyId(val)}
                        disabled={loadingCompanies}
                        isLoading={loadingCompanies}
                        placeholder="Select company..."
                      />
                    ) : contact.company && onOpenCompany ? (
                      <button
                        type="button"
                        onClick={() => onOpenCompany(contact.company!.id)}
                        className="text-sm text-zinc-900 underline hover:text-zinc-700"
                      >
                        {contact.company.name}
                      </button>
                    ) : (
                      <p className="text-sm text-zinc-600">
                        {contact.company?.name || "—"}
                      </p>
                    )}
                  </div>
                </div>
              </div>

              <hr className="border-zinc-200" />

              {/* Meta Section */}
              <div>
                <h3 className="mb-3 text-xs font-semibold uppercase tracking-wider text-zinc-500">
                  Metadata
                </h3>
                <div className="space-y-3">
                  {/* Created */}
                  <div>
                    <label className="mb-1 block text-sm font-medium text-zinc-700">
                      Created
                    </label>
                    <p className="text-sm text-zinc-600">
                      {new Date(contact.createdAt).toLocaleString()}
                    </p>
                  </div>

                  {/* Updated */}
                  <div>
                    <label className="mb-1 block text-sm font-medium text-zinc-700">
                      Last Updated
                    </label>
                    <p className="text-sm text-zinc-600">
                      {new Date(contact.updatedAt).toLocaleString()}
                    </p>
                  </div>
                </div>
              </div>

              {/* Submit Error */}
              {submitError && (
                <div className="rounded-md bg-red-50 p-3">
                  <p className="text-sm text-red-600">{submitError}</p>
                </div>
              )}

              {/* Actions */}
              <div className="flex gap-2 border-t border-zinc-200 pt-4">
                {!isEditing ? (
                  <button
                    type="button"
                    onClick={() => setIsEditing(true)}
                    className="rounded-md bg-zinc-900 px-4 py-2 text-sm font-medium text-white hover:bg-zinc-800"
                  >
                    Edit
                  </button>
                ) : (
                  <>
                    <button
                      type="button"
                      onClick={handleSave}
                      disabled={submitting || !firstName.trim() || !lastName.trim() || !phone.trim()}
                      className="rounded-md bg-zinc-900 px-4 py-2 text-sm font-medium text-white hover:bg-zinc-800 disabled:opacity-50"
                    >
                      {submitting ? "Saving..." : "Save"}
                    </button>
                    <button
                      type="button"
                      onClick={handleCancel}
                      disabled={submitting}
                      className="rounded-md border border-zinc-300 px-4 py-2 text-sm font-medium text-zinc-700 hover:bg-zinc-50 disabled:opacity-50"
                    >
                      Cancel
                    </button>
                  </>
                )}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
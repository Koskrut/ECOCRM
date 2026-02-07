"use client";

import { useEffect, useState } from "react";

type Company = {
  id: string;
  name: string;
  edrpou?: string;
  taxId?: string;
  createdAt: string;
  updatedAt: string;
};

// Тип для контактов в списке
type Contact = {
  id: string;
  firstName: string;
  lastName: string;
  phone: string;
  email?: string;
  position?: string;
};

type CompanyModalProps = {
  apiBaseUrl: string;
  companyId: string | null;
  onClose: () => void;
  onUpdate: () => void;
  // Добавили возможность открывать контакт
  onOpenContact?: (contactId: string) => void;
};

export function CompanyModal({
  apiBaseUrl,
  companyId,
  onClose,
  onUpdate,
  onOpenContact,
}: CompanyModalProps) {
  const [company, setCompany] = useState<Company | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [isEditing, setIsEditing] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);

  // Contacts list state
  const [contacts, setContacts] = useState<Contact[]>([]);
  const [loadingContacts, setLoadingContacts] = useState(false);

  // Form state
  const [name, setName] = useState("");
  const [edrpou, setEdrpou] = useState("");
  const [taxId, setTaxId] = useState("");

  // Load company details + contacts
  useEffect(() => {
    if (!companyId) return;

    const loadData = async () => {
      setLoading(true);
      setError(null);
      setContacts([]); // Reset contacts
      
      try {
        // 1. Load Company
        const companyRes = await fetch(`${apiBaseUrl}/companies/${companyId}`);
        if (companyRes.status === 404) {
          throw new Error("Company not found");
        }
        if (!companyRes.ok) {
          throw new Error(`Failed to load company: ${companyRes.statusText}`);
        }
        const companyData: Company = await companyRes.json();
        
        setCompany(companyData);
        setName(companyData.name);
        setEdrpou(companyData.edrpou || "");
        setTaxId(companyData.taxId || "");

        // 2. Load Contacts (параллельно, но после проверки компании, чтобы не грузить лишнее)
        setLoadingContacts(true);
        try {
          // Используем существующий эндпоинт фильтрации по companyId
          const contactsRes = await fetch(`${apiBaseUrl}/contacts?companyId=${companyId}&pageSize=100`);
          if (contactsRes.ok) {
             const contactsData = await contactsRes.json();
             // contactsData может быть массивом или объектом { items: [] } в зависимости от пагинации
             // Проверяем формат (в твоем коде контроллера это { items, total, ... })
             setContacts(contactsData.items || []);
          }
        } catch (e) {
          console.error("Failed to load company contacts", e);
        } finally {
          setLoadingContacts(false);
        }

      } catch (err) {
        setError(err instanceof Error ? err.message : "Unknown error");
      } finally {
        setLoading(false);
      }
    };

    loadData();
  }, [apiBaseUrl, companyId]);

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
    if (!companyId || !company || submitting) return;

    try {
      setSubmitting(true);
      setSubmitError(null);

      const updates: Record<string, unknown> = {};
      if (name !== company.name) updates.name = name;
      if (edrpou !== (company.edrpou || "")) updates.edrpou = edrpou || undefined;
      if (taxId !== (company.taxId || "")) updates.taxId = taxId || undefined;

      if (Object.keys(updates).length === 0) {
        setIsEditing(false);
        return;
      }

      const response = await fetch(`${apiBaseUrl}/companies/${companyId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(updates),
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(errorData.message || `Failed to update company: ${response.statusText}`);
      }

      const updatedCompany: Company = await response.json();
      setCompany(updatedCompany);
      setName(updatedCompany.name);
      setEdrpou(updatedCompany.edrpou || "");
      setTaxId(updatedCompany.taxId || "");
      setIsEditing(false);
      onUpdate();
    } catch (err) {
      setSubmitError(err instanceof Error ? err.message : "Unknown error");
    } finally {
      setSubmitting(false);
    }
  };

  const handleCancel = () => {
    if (!company) return;
    setName(company.name);
    setEdrpou(company.edrpou || "");
    setTaxId(company.taxId || "");
    setIsEditing(false);
    setSubmitError(null);
  };

  if (!companyId) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 px-4"
      onClick={() => {
        if (!submitting) onClose();
      }}
      role="presentation"
    >
      <div
        className="w-full max-w-2xl rounded-lg bg-white shadow-lg max-h-[90vh] overflow-y-auto"
        onClick={(event) => event.stopPropagation()}
        role="presentation"
      >
        {/* Header */}
        <div className="flex items-center justify-between border-b border-zinc-200 px-6 py-4 sticky top-0 bg-white z-10">
          <h2 className="text-lg font-semibold text-zinc-900">
            {isEditing ? "Edit Company" : "Company Details"}
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

          {!loading && !error && company && (
            <div className="space-y-6">
              {/* Basic Information Section */}
              <div>
                <h3 className="mb-3 text-xs font-semibold uppercase tracking-wider text-zinc-500">
                  Basic Information
                </h3>
                <div className="space-y-4">
                  {/* Name */}
                  <div>
                    <label className="mb-1 block text-sm font-medium text-zinc-700">
                      Name
                    </label>
                    {isEditing ? (
                      <input
                        type="text"
                        value={name}
                        onChange={(e) => setName(e.target.value)}
                        className="w-full rounded-md border border-zinc-300 px-3 py-2 text-sm focus:border-zinc-900 focus:outline-none"
                      />
                    ) : (
                      <p className="text-sm text-zinc-900">{company.name}</p>
                    )}
                  </div>

                  {/* EDRPOU */}
                  <div>
                    <label className="mb-1 block text-sm font-medium text-zinc-700">
                      EDRPOU
                    </label>
                    {isEditing ? (
                      <input
                        type="text"
                        value={edrpou}
                        onChange={(e) => setEdrpou(e.target.value)}
                        className="w-full rounded-md border border-zinc-300 px-3 py-2 text-sm focus:border-zinc-900 focus:outline-none"
                      />
                    ) : (
                      <p className="text-sm text-zinc-900">{company.edrpou || "—"}</p>
                    )}
                  </div>

                  {/* Tax ID */}
                  <div>
                    <label className="mb-1 block text-sm font-medium text-zinc-700">
                      Tax ID
                    </label>
                    {isEditing ? (
                      <input
                        type="text"
                        value={taxId}
                        onChange={(e) => setTaxId(e.target.value)}
                        className="w-full rounded-md border border-zinc-300 px-3 py-2 text-sm focus:border-zinc-900 focus:outline-none"
                      />
                    ) : (
                      <p className="text-sm text-zinc-900">{company.taxId || "—"}</p>
                    )}
                  </div>
                </div>
              </div>

              <hr className="border-zinc-200" />
              
              {/* Contacts Section */}
              <div>
                 <div className="mb-3 flex items-center justify-between">
                    <h3 className="text-xs font-semibold uppercase tracking-wider text-zinc-500">
                      Contacts ({contacts.length})
                    </h3>
                    {/* Кнопку "Add Contact" можно добавить позже, если нужно создание контакта с предзаполненной компанией */}
                 </div>
                 
                 {loadingContacts ? (
                   <p className="text-sm text-zinc-500">Loading contacts...</p>
                 ) : contacts.length === 0 ? (
                   <p className="text-sm text-zinc-500 italic">No contacts linked to this company.</p>
                 ) : (
                   <div className="overflow-hidden rounded-md border border-zinc-200">
                     <table className="w-full text-sm text-left">
                       <thead className="bg-zinc-50 text-xs text-zinc-500 uppercase">
                         <tr>
                            <th className="px-3 py-2 font-medium">Name</th>
                            <th className="px-3 py-2 font-medium">Position</th>
                            <th className="px-3 py-2 font-medium">Phone</th>
                         </tr>
                       </thead>
                       <tbody className="divide-y divide-zinc-100">
                         {contacts.map(contact => (
                           <tr key={contact.id} className="hover:bg-zinc-50">
                             <td className="px-3 py-2 font-medium text-zinc-900">
                               {onOpenContact ? (
                                 <button 
                                   onClick={() => onOpenContact(contact.id)}
                                   className="text-left hover:underline focus:outline-none"
                                 >
                                    {contact.firstName} {contact.lastName}
                                 </button>
                               ) : (
                                 <span>{contact.firstName} {contact.lastName}</span>
                               )}
                             </td>
                             <td className="px-3 py-2 text-zinc-600">{contact.position || "—"}</td>
                             <td className="px-3 py-2 text-zinc-600">{contact.phone}</td>
                           </tr>
                         ))}
                       </tbody>
                     </table>
                   </div>
                 )}
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
                      {new Date(company.createdAt).toLocaleString()}
                    </p>
                  </div>

                  {/* Updated */}
                  <div>
                    <label className="mb-1 block text-sm font-medium text-zinc-700">
                      Last Updated
                    </label>
                    <p className="text-sm text-zinc-600">
                      {new Date(company.updatedAt).toLocaleString()}
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
                      disabled={submitting || !name.trim()}
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
"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { ContactModal } from "./ContactModal";
import { CompanyModal } from "../companies/CompanyModal";

type Contact = {
  id: string;
  companyId?: string;
  firstName: string;
  lastName: string;
  phone: string;
  email?: string;
  position?: string;
  isPrimary: boolean;
  createdAt: string;
  updatedAt: string;
};

type ContactsResponse = {
  items: Contact[];
  total: number;
  page: number;
  pageSize: number;
};

const getApiBaseUrl = (): string => "/api";

export default function ContactsPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const contactId = searchParams.get("contactId");
  const [contacts, setContacts] = useState<Contact[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [companyId, setCompanyId] = useState<string | null>(null);
  const apiBaseUrl = useMemo(() => getApiBaseUrl(), []);

  const loadContacts = async () => {
    try {
      setLoading(true);
      setError(null);
      const response = await fetch(`${apiBaseUrl}/contacts`);
      if (!response.ok) {
        throw new Error(`Failed to load contacts: ${response.statusText}`);
      }
      const data: ContactsResponse = await response.json();
      setContacts(data.items);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unknown error");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadContacts();
  }, [apiBaseUrl]);

  const openContact = (id: string) => {
    const params = new URLSearchParams(searchParams.toString());
    params.set("contactId", id);
    router.replace(`/contacts?${params.toString()}`);
  };

  const closeModal = () => {
    const params = new URLSearchParams(searchParams.toString());
    params.delete("contactId");
    const newUrl = params.toString() ? `/contacts?${params.toString()}` : "/contacts";
    router.replace(newUrl);
  };

  const openCompany = (id: string) => {
    setCompanyId(id);
  };

  const closeCompanyModal = () => {
    setCompanyId(null);
  };

  return (
    <div className="min-h-screen bg-zinc-50 p-6">
      <div className="mx-auto max-w-6xl">
        <h1 className="mb-6 text-2xl font-bold text-zinc-900">Contacts</h1>

        <div className="rounded-lg border border-zinc-200 bg-white shadow-sm">
          {loading && (
            <div className="flex min-h-[400px] items-center justify-center p-8">
              <p className="text-sm text-zinc-500">Loading...</p>
            </div>
          )}

          {error && (
            <div className="flex min-h-[400px] items-center justify-center p-8">
              <p className="text-sm text-red-600">{error}</p>
            </div>
          )}

          {!loading && !error && contacts.length === 0 && (
            <div className="flex min-h-[400px] items-center justify-center p-8">
              <p className="text-sm text-zinc-500">No contacts yet</p>
            </div>
          )}

          {!loading && !error && contacts.length > 0 && (
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead className="border-b border-zinc-200 bg-zinc-50">
                  <tr>
                    <th className="px-6 py-3 text-left text-xs font-medium uppercase tracking-wider text-zinc-700">
                      Name
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium uppercase tracking-wider text-zinc-700">
                      Phone
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium uppercase tracking-wider text-zinc-700">
                      Email
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium uppercase tracking-wider text-zinc-700">
                      Position
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium uppercase tracking-wider text-zinc-700">
                      Created
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-zinc-200 bg-white">
                  {contacts.map((contact) => (
                    <tr
                      key={contact.id}
                      onClick={() => openContact(contact.id)}
                      className="cursor-pointer transition-colors hover:bg-zinc-50"
                    >
                      <td className="whitespace-nowrap px-6 py-4 text-sm font-medium text-zinc-900">
                        {contact.firstName} {contact.lastName}
                      </td>
                      <td className="whitespace-nowrap px-6 py-4 text-sm text-zinc-600">
                        {contact.phone}
                      </td>
                      <td className="whitespace-nowrap px-6 py-4 text-sm text-zinc-600">
                        {contact.email || "—"}
                      </td>
                      <td className="whitespace-nowrap px-6 py-4 text-sm text-zinc-600">
                        {contact.position || "—"}
                      </td>
                      <td className="whitespace-nowrap px-6 py-4 text-sm text-zinc-600">
                        {new Date(contact.createdAt).toLocaleDateString()}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>

      {contactId && (
        <ContactModal
          apiBaseUrl={apiBaseUrl}
          contactId={contactId}
          onClose={closeModal}
          onUpdate={loadContacts}
          onOpenCompany={openCompany}
        />
      )}

      {companyId && (
        <CompanyModal
          apiBaseUrl={apiBaseUrl}
          companyId={companyId}
          onClose={closeCompanyModal}
          onUpdate={() => {}}
        />
      )}
    </div>
  );
}

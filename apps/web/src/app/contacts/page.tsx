"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { ContactModal } from "./ContactModal";
import { CompanyModal } from "../companies/CompanyModal";
import { contactsApi, type ContactsResponse, type Contact } from "../../lib/api";

export default function ContactsPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const contactId = searchParams.get("contactId");
  const [contacts, setContacts] = useState<Contact[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [companyId, setCompanyId] = useState<string | null>(null);

  const loadContacts = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);
      const data: ContactsResponse = await contactsApi.list();
      setContacts(data.items);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unknown error");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadContacts();
  }, [loadContacts]);

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
    <div className="p-6">
      <div className="mb-4 flex items-center justify-between">
        <h1 className="text-2xl font-bold">Контакты</h1>
      </div>

      {loading && <div className="text-sm text-gray-600">Загрузка...</div>}
      {error && <div className="text-sm text-red-600">{error}</div>}

      {!loading && !error && (
        <div className="overflow-hidden rounded-xl border bg-white">
          <table className="w-full text-sm">
            <thead className="bg-gray-50 text-left">
              <tr>
                <th className="px-4 py-3">Имя</th>
                <th className="px-4 py-3">Телефон</th>
                <th className="px-4 py-3">Email</th>
              </tr>
            </thead>
            <tbody>
              {contacts.map((c) => (
                <tr
                  key={c.id}
                  className="cursor-pointer border-t hover:bg-gray-50"
                  onClick={() => openContact(c.id)}
                >
                  <td className="px-4 py-3 font-medium">
                    {c.firstName} {c.lastName}
                  </td>
                  <td className="px-4 py-3">{c.phone}</td>
                  <td className="px-4 py-3">{c.email || "-"}</td>
                </tr>
              ))}
              {contacts.length === 0 && (
                <tr className="border-t">
                  <td className="px-4 py-6 text-center text-gray-500" colSpan={3}>
                    Нет контактов
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      )}

      {contactId && (
        <ContactModal
          apiBaseUrl="/api"
          contactId={contactId}
          onClose={closeModal}
          onOpenCompany={openCompany}
          onUpdate={loadContacts}
        />
      )}

      {companyId && (
        <CompanyModal
          apiBaseUrl="/api"
          companyId={companyId}
          onClose={closeCompanyModal}
          onUpdate={() => {}}
        />
      )}
    </div>
  );
}

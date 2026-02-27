"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { CompanyModal } from "./CompanyModal";
import { companiesApi, type CompaniesResponse, type Company } from "../../lib/api";

export default function CompaniesPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const companyId = searchParams.get("companyId");
  const [companies, setCompanies] = useState<Company[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const loadCompanies = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);
      const data: CompaniesResponse = await companiesApi.list();
      setCompanies(data.items);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unknown error");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadCompanies();
  }, [loadCompanies]);

  const openCompany = (id: string) => {
    const params = new URLSearchParams(searchParams.toString());
    params.set("companyId", id);
    router.replace(`/companies?${params.toString()}`);
  };

  const closeModal = () => {
    const params = new URLSearchParams(searchParams.toString());
    params.delete("companyId");
    const newUrl = params.toString() ? `/companies?${params.toString()}` : "/companies";
    router.replace(newUrl);
  };

  return (
    <div className="p-6">
      <div className="mb-4 flex items-center justify-between">
        <h1 className="text-2xl font-bold">Компании</h1>
      </div>

      {loading && <div className="text-sm text-gray-600">Загрузка...</div>}
      {error && <div className="text-sm text-red-600">{error}</div>}

      {!loading && !error && (
        <div className="overflow-hidden rounded-xl border bg-white">
          <table className="w-full text-sm">
            <thead className="bg-gray-50 text-left">
              <tr>
                <th className="px-4 py-3">Название</th>
                <th className="px-4 py-3">ЕДРПОУ</th>
                <th className="px-4 py-3">ИНН</th>
              </tr>
            </thead>
            <tbody>
              {companies.map((c) => (
                <tr
                  key={c.id}
                  className="cursor-pointer border-t hover:bg-gray-50"
                  onClick={() => openCompany(c.id)}
                >
                  <td className="px-4 py-3 font-medium">{c.name}</td>
                  <td className="px-4 py-3">{c.edrpou || "-"}</td>
                  <td className="px-4 py-3">{c.taxId || "-"}</td>
                </tr>
              ))}
              {companies.length === 0 && (
                <tr className="border-t">
                  <td className="px-4 py-6 text-center text-gray-500" colSpan={3}>
                    Нет компаний
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      )}

      {companyId && (
        <CompanyModal
          apiBaseUrl="/api"
          companyId={companyId}
          onClose={closeModal}
          onUpdate={loadCompanies}
        />
      )}
    </div>
  );
}

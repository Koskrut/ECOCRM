"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { CompanyModal } from "./CompanyModal";

type Company = {
  id: string;
  name: string;
  edrpou?: string;
  taxId?: string;
  createdAt: string;
  updatedAt: string;
};

type CompaniesResponse = {
  items: Company[];
  total: number;
  page: number;
  pageSize: number;
};

const getApiBaseUrl = (): string => "/api";

export default function CompaniesPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const companyId = searchParams.get("companyId");
  const [companies, setCompanies] = useState<Company[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const apiBaseUrl = useMemo(() => getApiBaseUrl(), []);

  const loadCompanies = async () => {
    try {
      setLoading(true);
      setError(null);
      const response = await fetch(`${apiBaseUrl}/companies`);
      if (!response.ok) {
        throw new Error(`Failed to load companies: ${response.statusText}`);
      }
      const data: CompaniesResponse = await response.json();
      setCompanies(data.items);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unknown error");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadCompanies();
  }, [apiBaseUrl]);

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
    <div className="min-h-screen bg-zinc-50 p-6">
      <div className="mx-auto max-w-6xl">
        <h1 className="mb-6 text-2xl font-bold text-zinc-900">Companies</h1>

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

          {!loading && !error && companies.length === 0 && (
            <div className="flex min-h-[400px] items-center justify-center p-8">
              <p className="text-sm text-zinc-500">No companies yet</p>
            </div>
          )}

          {!loading && !error && companies.length > 0 && (
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead className="border-b border-zinc-200 bg-zinc-50">
                  <tr>
                    <th className="px-6 py-3 text-left text-xs font-medium uppercase tracking-wider text-zinc-700">
                      Name
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium uppercase tracking-wider text-zinc-700">
                      EDRPOU
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium uppercase tracking-wider text-zinc-700">
                      Tax ID
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium uppercase tracking-wider text-zinc-700">
                      Created
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-zinc-200 bg-white">
                  {companies.map((company) => (
                    <tr
                      key={company.id}
                      onClick={() => openCompany(company.id)}
                      className="cursor-pointer transition-colors hover:bg-zinc-50"
                    >
                      <td className="whitespace-nowrap px-6 py-4 text-sm font-medium text-zinc-900">
                        {company.name}
                      </td>
                      <td className="whitespace-nowrap px-6 py-4 text-sm text-zinc-600">
                        {company.edrpou || "—"}
                      </td>
                      <td className="whitespace-nowrap px-6 py-4 text-sm text-zinc-600">
                        {company.taxId || "—"}
                      </td>
                      <td className="whitespace-nowrap px-6 py-4 text-sm text-zinc-600">
                        {new Date(company.createdAt).toLocaleDateString()}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>

      {companyId && (
        <CompanyModal
          apiBaseUrl={apiBaseUrl}
          companyId={companyId}
          onClose={closeModal}
          onUpdate={loadCompanies}
        />
      )}
    </div>
  );
}

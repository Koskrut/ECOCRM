"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { apiHttp } from "@/lib/api/client";
import { DictionaryItemsEditor } from "@/components/settings/DictionaryItemsEditor";
import { PRODUCT_CHARACTERISTICS_DICTIONARY_KEY } from "@/lib/product-spec-labels";

export default function ProductCharacteristicsSettingsPage() {
  const [role, setRole] = useState<string | null>(null);

  useEffect(() => {
    apiHttp
      .get<{ user?: { role?: string } }>("/auth/me")
      .then((r) => setRole(r.data?.user?.role ?? null))
      .catch(() => setRole(null));
  }, []);

  if (role !== "ADMIN") {
    return (
      <div className="p-6">
        <p className="text-sm text-zinc-600">Доступ тільки для ADMIN.</p>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-zinc-50 p-6">
      <div className="mx-auto max-w-4xl">
        <DictionaryItemsEditor
          dictionaryKey={PRODUCT_CHARACTERISTICS_DICTIONARY_KEY}
          title="Характеристики товару"
          subtitle="Коди й українські підписи властивостей у каталозі CRM і на вітрині. Після додавання тут властивість з’явиться в «Додати властивість» на картці товару."
          backHref="/settings"
          backLabel="← Налаштування"
        />
        <p className="mt-4 text-sm text-zinc-500">
          Загальні CRM-довідники (регіони, канали тощо) — у{" "}
          <Link href="/settings/metadata/dictionaries" className="underline hover:text-zinc-800">
            Метадані → Довідники
          </Link>
          .
        </p>
      </div>
    </div>
  );
}

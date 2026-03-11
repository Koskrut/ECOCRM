"use client";

import { useEffect, useState } from "react";
import { getMyShippingProfiles } from "@/lib/api";

export default function CabinetAddressesPage() {
  const [data, setData] = useState<Awaited<ReturnType<typeof getMyShippingProfiles>> | null>(null);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    getMyShippingProfiles()
      .then(setData)
      .catch(() => setErr("Не вдалося завантажити адреси"))
      .finally(() => setLoading(false));
  }, []);

  if (err) {
    return (
      <div>
        <p className="text-red-600">{err}</p>
      </div>
    );
  }

  if (loading || !data) {
    return (
      <div>
        <div className="h-8 w-48 animate-pulse rounded bg-zinc-200" />
        <div className="mt-6 space-y-3">
          {[1, 2].map((i) => (
            <div key={i} className="h-24 animate-pulse rounded-xl bg-zinc-200" />
          ))}
        </div>
      </div>
    );
  }

  const items = data.items ?? [];

  return (
    <div>
      <h1 className="font-heading text-xl font-semibold text-zinc-900 sm:text-2xl">
        Адреси доставки
      </h1>
      <p className="mt-1 text-sm text-zinc-500">
        Збережені адреси для Нової Пошти. Нову адресу можна додати під час оформлення замовлення.
      </p>

      {items.length ? (
        <ul className="mt-6 space-y-4">
          {items.map((profile) => (
            <li
              key={profile.id}
              className="rounded-xl border border-[var(--border)] bg-white p-5 shadow-sm"
            >
              <div className="flex items-start justify-between gap-2">
                <div>
                  <p className="font-medium text-zinc-900">
                    {profile.label}
                    {profile.isDefault && (
                      <span className="ml-2 text-xs text-zinc-500">(за замовчуванням)</span>
                    )}
                  </p>
                  {profile.cityName && (
                    <p className="mt-1 text-sm text-zinc-600">
                      {profile.cityName}
                      {profile.warehouseNumber && `, відділення ${profile.warehouseNumber}`}
                    </p>
                  )}
                  {(profile.firstName || profile.lastName) && (
                    <p className="mt-1 text-sm text-zinc-600">
                      {[profile.firstName, profile.lastName].filter(Boolean).join(" ")}
                    </p>
                  )}
                  {profile.phone && (
                    <p className="mt-1 text-sm text-zinc-600">{profile.phone}</p>
                  )}
                </div>
              </div>
            </li>
          ))}
        </ul>
      ) : (
        <p className="mt-6 text-zinc-500">
          У вас поки немає збережених адрес. Адресу можна додати при оформленні замовлення в кошику.
        </p>
      )}
    </div>
  );
}

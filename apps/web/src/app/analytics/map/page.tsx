"use client";

import { Suspense } from "react";
import { UkraineOblastMap } from "@/components/maps/UkraineOblastMap";

function MapContent() {
  return (
    <>
      <div className="mb-6">
        <h1 className="text-xl font-semibold text-zinc-900">Карта</h1>
        <p className="mt-1 text-sm text-zinc-600">
          Закріплення областей з org-chart (Employees) та фактичні продажі за обраний період.
          Доступ: ADMIN та LEAD (обмежено командою).
        </p>
      </div>
      <UkraineOblastMap />
    </>
  );
}

export default function AnalyticsMapPage() {
  return (
    <Suspense fallback={<div className="text-sm text-zinc-500">Завантаження карти…</div>}>
      <MapContent />
    </Suspense>
  );
}

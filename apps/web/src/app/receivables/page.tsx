"use client";

import { Suspense } from "react";
import { ReceivablesPageContent } from "./ReceivablesPageContent";

export default function ReceivablesPage() {
  return (
    <Suspense
      fallback={
        <div className="p-6 text-sm text-zinc-500">Завантаження дебіторки…</div>
      }
    >
      <ReceivablesPageContent />
    </Suspense>
  );
}

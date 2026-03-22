import { Suspense } from "react";
import AttemptsPageClient from "./AttemptsPageClient";

export default function OutboundAttemptsPage() {
  return (
    <Suspense
      fallback={
        <div className="py-20 text-center text-sm text-zinc-400">Loading attempts…</div>
      }
    >
      <AttemptsPageClient />
    </Suspense>
  );
}

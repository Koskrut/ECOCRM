"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";

export default function UnmatchedRedirectPage() {
  const router = useRouter();
  useEffect(() => {
    router.replace("/payments?view=unmatched");
  }, [router]);
  return (
    <div className="flex min-h-[200px] items-center justify-center p-6 text-sm text-zinc-500">
      Redirecting to Payments…
    </div>
  );
}

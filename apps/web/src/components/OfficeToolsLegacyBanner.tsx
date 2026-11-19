"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { fetchOfficeToolsActive } from "@/lib/api/resources/office-tools";
import { strings } from "@/locales";

/** Shows a notice on Excel / Google Sheet pages when Office Tools owns the accounting flow. */
export function OfficeToolsLegacyBanner() {
  const [active, setActive] = useState(false);
  useEffect(() => {
    void fetchOfficeToolsActive().then(setActive);
  }, []);
  if (!active) return null;
  const t = strings.settings.officeTools;
  return (
    <div className="mb-4 rounded-lg border border-violet-200 bg-violet-50 px-3 py-2 text-sm text-violet-900">
      <p>{t.legacyBlocked}</p>
      <Link href="/settings/office-tools" className="mt-1 inline-block font-medium underline">
        {t.legacyBlockedLink}
      </Link>
    </div>
  );
}

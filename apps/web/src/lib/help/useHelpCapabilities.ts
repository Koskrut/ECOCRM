"use client";

import { useEffect, useState } from "react";
import { apiHttp } from "@/lib/api/client";

type MeResponse = { user?: { role?: string } };

export function useHelpCapabilities() {
  const [role, setRole] = useState<string | null>(null);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    apiHttp
      .get<MeResponse>("/auth/me")
      .then((res) => setRole(res.data?.user?.role ?? null))
      .catch(() => setRole(null))
      .finally(() => setLoaded(true));
  }, []);

  const canManage = role === "ADMIN" || role === "LEAD";
  const canEditProduct = role === "ADMIN";

  return { role, loaded, canManage, canEditProduct };
}

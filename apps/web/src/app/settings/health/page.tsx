"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { apiHttp } from "@/lib/api/client";

export default function SettingsHealthPage() {
  const [role, setRole] = useState<string | null>(null);
  const [release, setRelease] = useState<unknown>(null);
  const [license, setLicense] = useState<unknown>(null);
  const [variant, setVariant] = useState<unknown>(null);
  const [modules, setModules] = useState<unknown>(null);
  const [controlPlane, setControlPlane] = useState<unknown>(null);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    apiHttp
      .get<{ user?: { role?: string } }>("/auth/me")
      .then((r) => setRole(r.data?.user?.role ?? null))
      .catch(() => setRole(null));
  }, []);

  useEffect(() => {
    if (role !== "ADMIN") return;
    let cancelled = false;
    setErr(null);
    Promise.all([
      apiHttp.get("/system/release"),
      apiHttp.get("/system/license-status"),
      apiHttp.get("/system/backend-variant"),
      apiHttp.get("/system/modules"),
      apiHttp.get("/system/control-plane"),
    ])
      .then(([a, b, c, d, e]) => {
        if (cancelled) return;
        setRelease(a.data);
        setLicense(b.data);
        setVariant(c.data);
        setModules(d.data);
        setControlPlane(e.data);
      })
      .catch(() => {
        if (!cancelled) setErr("Не вдалося завантажити system endpoints");
      });
    return () => {
      cancelled = true;
    };
  }, [role]);

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
        <Link href="/settings" className="text-sm text-zinc-600 hover:text-zinc-900">
          ← Settings
        </Link>
        <h1 className="mt-2 text-2xl font-bold text-zinc-900">System health</h1>
        {err ? <p className="mt-2 text-sm text-red-600">{err}</p> : null}
        <div className="mt-4 space-y-4">
          <pre className="overflow-x-auto rounded-lg border border-zinc-200 bg-white p-3 text-xs">
            {JSON.stringify({ release, license, variant, controlPlane, modules }, null, 2)}
          </pre>
        </div>
      </div>
    </div>
  );
}

"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

export default function LoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState("admin@test.com");
  const [password, setPassword] = useState("admin123");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setLoading(true);

    try {
      const res = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, password }),
      });

      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data?.message || "Login failed");
      }

      // cookie token уже установлен на сервере route handler
      router.push("/orders");
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Login error");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-zinc-50 p-6">
      <form onSubmit={onSubmit} className="w-full max-w-sm rounded-lg border bg-white p-6 shadow-sm">
        <h1 className="text-xl font-bold text-zinc-900">Login</h1>
        <p className="mt-1 text-sm text-zinc-500">Enter your credentials</p>

        {error && (
          <div className="mt-4 rounded-md bg-red-50 p-3 text-sm text-red-700 border border-red-100">
            {error}
          </div>
        )}

        <label className="mt-4 block text-sm font-medium text-zinc-700">Email</label>
        <input
          className="mt-1 w-full rounded-md border px-3 py-2 text-sm"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          autoComplete="email"
        />

        <label className="mt-3 block text-sm font-medium text-zinc-700">Password</label>
        <input
          className="mt-1 w-full rounded-md border px-3 py-2 text-sm"
          type="password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          autoComplete="current-password"
        />

        <button
          type="submit"
          disabled={loading}
          className="mt-5 w-full rounded-md bg-zinc-900 px-4 py-2 text-sm font-medium text-white hover:bg-zinc-800 disabled:opacity-50"
        >
          {loading ? "Signing in..." : "Sign in"}
        </button>
      </form>
    </div>
  );
}

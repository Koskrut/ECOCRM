"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { apiHttp } from "@/lib/api/client";

type GoogleMapsConfigResponse = {
  mapsApiKeyMasked?: string;
};

function getApiErrorMessage(e: unknown, fallback: string) {
  const msg =
    (e as { response?: { data?: { message?: string; error?: string } } })?.response?.data
      ?.message ??
    (e as { response?: { data?: { message?: string; error?: string } } })?.response?.data?.error;
  return msg ?? (e instanceof Error ? e.message : fallback);
}

export default function GoogleMapsSettingsPage() {
  const [config, setConfig] = useState<GoogleMapsConfigResponse>({});
  const [mapsApiKey, setMapsApiKey] = useState("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function load() {
    setLoading(true);
    setError(null);
    try {
      const res = await apiHttp.get<GoogleMapsConfigResponse>("/settings/google-maps");
      const data = res.data ?? {};
      setConfig(data);
      setMapsApiKey("");
    } catch (e) {
      setError(getApiErrorMessage(e, "Failed to load settings"));
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void load();
  }, []);

  async function save() {
    setSaving(true);
    setError(null);
    try {
      const body: Record<string, string> = {};
      if (mapsApiKey !== "") body.mapsApiKey = mapsApiKey;
      const res = await apiHttp.patch<GoogleMapsConfigResponse>("/settings/google-maps", body);
      const data = res.data ?? {};
      setConfig(data);
      setMapsApiKey("");
    } catch (e) {
      setError(getApiErrorMessage(e, "Failed to save"));
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="min-h-screen bg-zinc-50 p-6">
      <div className="mx-auto max-w-xl">
        <div className="mb-6">
          <Link
            href="/settings"
            className="inline-flex items-center text-sm text-zinc-600 hover:text-zinc-900"
          >
            ← Back to Settings
          </Link>
          <h1 className="mt-2 text-2xl font-bold text-zinc-900">Google Maps</h1>
          <p className="mt-1 text-sm text-zinc-500">
            Configure Google Maps JavaScript API key used on the visits planning page.
          </p>
        </div>

        {error && (
          <p className="mb-4 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800">
            {error}
          </p>
        )}

        {loading ? (
          <p className="text-sm text-zinc-500">Loading…</p>
        ) : (
          <div className="rounded-lg border border-zinc-200 bg-white p-5 shadow-sm">
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-zinc-700">
                  Maps JavaScript API key
                </label>
                <p className="mt-0.5 text-xs text-zinc-500">
                  Optional. Leave empty to keep current. Used to load Google Maps on the visits
                  planning page. You must enable Maps JavaScript API in Google Cloud Console.
                </p>
                <input
                  type="password"
                  value={mapsApiKey}
                  onChange={(e) => setMapsApiKey(e.target.value)}
                  placeholder={
                    config.mapsApiKeyMasked
                      ? `Current: ${config.mapsApiKeyMasked}`
                      : "Paste API key"
                  }
                  className="mt-1 w-full rounded-lg border border-zinc-300 px-3 py-2 text-sm text-zinc-900 placeholder:text-zinc-400"
                />
              </div>
            </div>

            <div className="mt-6 flex items-center justify-between">
              <p className="text-xs text-zinc-500">
                Only ADMIN users can change this setting. The key is stored encrypted in the
                database.
              </p>
              <button
                type="button"
                onClick={() => void save()}
                disabled={saving}
                className="inline-flex items-center rounded-lg bg-zinc-900 px-4 py-2 text-sm font-medium text-white hover:bg-zinc-800 disabled:opacity-60"
              >
                {saving ? "Saving…" : "Save"}
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}


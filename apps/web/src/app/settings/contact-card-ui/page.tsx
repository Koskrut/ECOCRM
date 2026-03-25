"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { apiHttp } from "@/lib/api/client";
import { invalidateContactCardUiCache } from "@/app/contacts/useContactCardV2Effective";

type ContactCardUiResponse = {
  contactCardV2: boolean;
};

function getApiErrorMessage(e: unknown, fallback: string) {
  const msg =
    (e as { response?: { data?: { message?: string; error?: string } } })?.response?.data
      ?.message ??
    (e as { response?: { data?: { message?: string; error?: string } } })?.response?.data?.error;
  return msg ?? (e instanceof Error ? e.message : fallback);
}

export default function ContactCardUiSettingsPage() {
  const [contactCardV2, setContactCardV2] = useState(true);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState<string | null>(null);

  async function load() {
    setLoading(true);
    setError(null);
    setSaved(null);
    try {
      const res = await apiHttp.get<ContactCardUiResponse>("/settings/contact-card-ui");
      setContactCardV2(Boolean(res.data?.contactCardV2));
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
    setSaved(null);
    try {
      const res = await apiHttp.patch<ContactCardUiResponse>("/settings/contact-card-ui", {
        contactCardV2,
      });
      setContactCardV2(Boolean(res.data?.contactCardV2));
      invalidateContactCardUiCache();
      setSaved("Saved. Contact card clients will refetch the runtime flag.");
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
          <h1 className="mt-2 text-2xl font-bold text-zinc-900">Contact card UI</h1>
          <p className="mt-1 text-sm text-zinc-500">
            Toggle the runtime rollout for the v2 contact card. This works together with
            `NEXT_PUBLIC_CONTACT_CARD_V2`.
          </p>
        </div>

        {error ? (
          <p className="mb-4 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800">
            {error}
          </p>
        ) : null}

        {saved ? (
          <p className="mb-4 rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-800">
            {saved}
          </p>
        ) : null}

        {loading ? (
          <p className="text-sm text-zinc-500">Loading…</p>
        ) : (
          <div className="rounded-lg border border-zinc-200 bg-white p-5 shadow-sm">
            <div className="flex items-start justify-between gap-4">
              <div>
                <div className="text-sm font-medium text-zinc-900">Enable contact card v2</div>
                <p className="mt-1 text-sm text-zinc-500">
                  When disabled, CRM falls back to the legacy contact modal even if the build-time
                  env flag allows v2.
                </p>
              </div>
              <label className="inline-flex cursor-pointer items-center gap-3">
                <input
                  type="checkbox"
                  className="h-4 w-4 rounded border-zinc-300"
                  checked={contactCardV2}
                  onChange={(e) => setContactCardV2(e.target.checked)}
                />
                <span className="text-sm font-medium text-zinc-700">
                  {contactCardV2 ? "Enabled" : "Disabled"}
                </span>
              </label>
            </div>

            <div className="mt-6 flex items-center justify-between gap-4">
              <p className="text-xs text-zinc-500">
                Only ADMIN users can change this setting. Saving clears the local cache and notifies
                open CRM tabs to refetch the flag.
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

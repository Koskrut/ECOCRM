"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Phone, UserRound, X, Building2, ExternalLink } from "lucide-react";
import Link from "next/link";
import { kyivstarFmcApi, type KyivstarFmcLiveCall } from "@/lib/api/resources/kyivstar-fmc";
import { useModules } from "@/lib/modules/useModules";
import { ModuleIds } from "@/lib/modules/module-ids";
import { KyivstarRejectButton } from "./KyivstarDialButton";
import { formatPhoneDisplay } from "@/lib/formatPhone";

const DISMISS_KEY = "kyivstar_fmc_dismissed";
const POLL_MS = 2500;

function loadDismissed(): Set<string> {
  if (typeof window === "undefined") return new Set();
  try {
    const raw = sessionStorage.getItem(DISMISS_KEY);
    if (!raw) return new Set();
    return new Set(JSON.parse(raw) as string[]);
  } catch {
    return new Set();
  }
}

function saveDismissed(ids: Set<string>) {
  sessionStorage.setItem(DISMISS_KEY, JSON.stringify([...ids].slice(-50)));
}

function displayName(call: KyivstarFmcLiveCall): string {
  if (call.contact?.name) return call.contact.name;
  if (call.lead?.name) return call.lead.name;
  if (call.company?.name) return call.company.name;
  return "Невідомий абонент";
}

function primaryLink(call: KyivstarFmcLiveCall): { href: string; label: string } | null {
  if (call.contact) return { href: `/contacts?open=${call.contact.id}`, label: "Відкрити контакт" };
  if (call.lead) return { href: `/leads?open=${call.lead.id}`, label: "Відкрити лід" };
  if (call.company) return { href: `/companies/${call.company.id}`, label: "Компанія" };
  return null;
}

function CallCard({
  call,
  onDismiss,
}: {
  call: KyivstarFmcLiveCall;
  onDismiss: (id: string) => void;
}) {
  const isRinging = call.status === "RINGING" || call.liveState === "alerting";
  const link = primaryLink(call);
  const initial = displayName(call).charAt(0).toUpperCase();

  return (
    <div
      className={`pointer-events-auto relative overflow-hidden rounded-2xl border shadow-2xl backdrop-blur-md ${
        isRinging
          ? "border-emerald-300/80 bg-gradient-to-br from-white via-emerald-50/90 to-teal-50/80"
          : "border-sky-200/80 bg-gradient-to-br from-white via-sky-50/90 to-white"
      }`}
      role="alertdialog"
      aria-label="Вхідний дзвінок Kyivstar"
    >
      {isRinging && (
        <div className="pointer-events-none absolute -right-8 -top-8 h-32 w-32 rounded-full bg-emerald-400/20 animate-ping" />
      )}
      <div className="relative p-4">
        <div className="mb-3 flex items-start justify-between gap-2">
          <div className="flex items-center gap-3">
            <div
              className={`flex h-12 w-12 items-center justify-center rounded-full text-lg font-bold text-white shadow-inner ${
                isRinging ? "bg-emerald-500 animate-pulse" : "bg-sky-500"
              }`}
            >
              {initial}
            </div>
            <div>
              <div className="text-xs font-semibold uppercase tracking-wide text-emerald-700">
                {isRinging ? "Вхідний дзвінок" : "Розмова"}
              </div>
              <div className="text-lg font-bold text-zinc-900">{displayName(call)}</div>
              <div className="text-sm text-zinc-600">
                {formatPhoneDisplay(call.customerPhoneNormalized ?? call.customerPhone)}
              </div>
            </div>
          </div>
          <button
            type="button"
            onClick={() => onDismiss(call.externalId)}
            className="rounded-lg p-1 text-zinc-400 hover:bg-white/60 hover:text-zinc-700"
            aria-label="Закрити"
          >
            <X size={18} />
          </button>
        </div>

        <div className="mb-4 flex flex-wrap gap-2 text-xs text-zinc-500">
          {call.contact && (
            <span className="inline-flex items-center gap-1 rounded-full bg-white/70 px-2 py-0.5">
              <UserRound size={12} /> Контакт
            </span>
          )}
          {call.lead && !call.contact && (
            <span className="inline-flex items-center gap-1 rounded-full bg-white/70 px-2 py-0.5">
              <UserRound size={12} /> Лід
            </span>
          )}
          {call.company && (
            <span className="inline-flex items-center gap-1 rounded-full bg-white/70 px-2 py-0.5">
              <Building2 size={12} /> {call.company.name}
            </span>
          )}
        </div>

        <div className="flex flex-wrap gap-2">
          {link && (
            <Link
              href={link.href}
              className="inline-flex flex-1 items-center justify-center gap-2 rounded-xl bg-zinc-900 px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-zinc-800"
            >
              <ExternalLink size={16} />
              {link.label}
            </Link>
          )}
          {isRinging && call.callControlId && (
            <KyivstarRejectButton
              callControlId={call.callControlId}
              onDone={() => onDismiss(call.externalId)}
            />
          )}
        </div>
      </div>
    </div>
  );
}

export function KyivstarIncomingCallDock() {
  const { effective, status: modulesStatus } = useModules();
  const enabled = modulesStatus === "ready" && effective(ModuleIds.KyivstarFmc);
  const [liveCalls, setLiveCalls] = useState<KyivstarFmcLiveCall[]>([]);
  const [dismissed, setDismissed] = useState<Set<string>>(() => new Set());
  const notifiedRef = useRef<Set<string>>(new Set());

  useEffect(() => {
    setDismissed(loadDismissed());
  }, []);

  const dismiss = useCallback((externalId: string) => {
    setDismissed((prev) => {
      const next = new Set(prev);
      next.add(externalId);
      saveDismissed(next);
      return next;
    });
  }, []);

  useEffect(() => {
    if (!enabled) return;

    let cancelled = false;
    const tick = async () => {
      try {
        const ws = await kyivstarFmcApi.workspace();
        if (cancelled) return;
        const inbound = ws.liveCalls.filter(
          (c) => c.direction === "INBOUND" && (c.status === "RINGING" || c.status === "IN_PROGRESS"),
        );
        setLiveCalls(inbound);

        for (const call of inbound) {
          if (call.status !== "RINGING") continue;
          if (notifiedRef.current.has(call.externalId)) continue;
          if (dismissed.has(call.externalId)) continue;
          if (typeof Notification !== "undefined" && Notification.permission === "granted") {
            notifiedRef.current.add(call.externalId);
            new Notification("Вхідний дзвінок Kyivstar", {
              body: `${displayName(call)} · ${call.customerPhone}`,
              tag: call.externalId,
            });
          }
        }
      } catch {
        /* ignore transient poll errors */
      }
    };

    void tick();
    const id = window.setInterval(() => void tick(), POLL_MS);
    return () => {
      cancelled = true;
      window.clearInterval(id);
    };
  }, [enabled, dismissed]);

  useEffect(() => {
    if (!enabled || typeof Notification === "undefined") return;
    if (Notification.permission === "default") {
      void Notification.requestPermission();
    }
  }, [enabled]);

  const visible = useMemo(
    () => liveCalls.filter((c) => !dismissed.has(c.externalId)),
    [liveCalls, dismissed],
  );

  if (!enabled || visible.length === 0) return null;

  return (
    <div className="pointer-events-none fixed bottom-4 right-4 z-[90] flex w-full max-w-sm flex-col gap-3">
      {visible.map((call) => (
        <CallCard key={call.externalId} call={call} onDismiss={dismiss} />
      ))}
    </div>
  );
}

export function KyivstarFmcShell() {
  return (
    <>
      <KyivstarIncomingCallDock />
    </>
  );
}

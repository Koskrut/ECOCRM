"use client";

import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { KyivstarDialButton } from "@/components/kyivstar/KyivstarDialButton";
import { formatPhoneDisplay } from "@/lib/formatPhone";
import { strings } from "@/locales";
import type { ContactCardSummary } from "./useContactCardSummary";

const t = strings.contacts;
const cardT = t.card;

const BADGE_CLASSNAMES: Record<string, string> = {
  overdue: "border-red-200 bg-red-50 text-red-700",
  debt: "border-amber-200 bg-amber-50 text-amber-700",
  open_overdue_tasks: "border-orange-200 bg-orange-50 text-orange-700",
  no_activity: "border-violet-200 bg-violet-50 text-violet-700",
  unassigned: "border-blue-200 bg-blue-50 text-blue-700",
  no_company: "border-zinc-200 bg-zinc-50 text-zinc-700",
  credit: "border-emerald-200 bg-emerald-50 text-emerald-700",
};

function badgeLabel(badge: string): string {
  const map = cardT.badges as Record<string, string>;
  return map[badge] ?? badge;
}

type Args = {
  fullName: string;
  companyName?: string | null;
  companyId?: string | null;
  phone?: string | null;
  status?: string | null;
  clientType?: string | null;
  ownerName?: string | null;
  badges?: string[];
  onOpenCompany?: (id: string) => void;
  creatingOrder: boolean;
  queueingDialer: boolean;
  resetPasswordLoading: boolean;
  canEnqueueDialer: boolean;
  canDelete: boolean;
  onCreateOrder: () => void;
  onCreateTask: () => void;
  onScheduleVisit: () => void;
  onEnqueueDialer: () => void;
  onResetPassword: () => void;
  onDelete: () => void;
  telegramConversationId?: string | null;
  email?: string | null;
};

export function useContactCardShellHeader(args: Args): {
  title: ReactNode;
  subtitle: string | undefined;
  headerActions: ReactNode;
} {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement | null>(null);
  const {
    fullName,
    companyName,
    companyId,
    phone,
    status,
    clientType,
    ownerName,
    badges = [],
    onOpenCompany,
    creatingOrder,
    queueingDialer,
    resetPasswordLoading,
    canEnqueueDialer,
    canDelete,
    onCreateOrder,
    onCreateTask,
    onScheduleVisit,
    onEnqueueDialer,
    onResetPassword,
    onDelete,
    telegramConversationId,
    email,
  } = args;

  useEffect(() => {
    if (!open) return;
    const onDoc = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, [open]);

  const visibleBadges = useMemo(
    () => badges.filter((b) => b !== "no_company"),
    [badges],
  );
  const subtitleParts = [
    phone ? formatPhoneDisplay(phone) : null,
    status || null,
    clientType || null,
    ownerName || null,
  ].filter(Boolean);

  const title = useMemo(
    () => (
      <div className="min-w-0">
        <div className="truncate text-base font-semibold text-zinc-900">{fullName}</div>
        {companyName ? (
          <div className="mt-0.5 truncate text-xs text-zinc-500">
            {companyId && onOpenCompany ? (
              <button
                type="button"
                onClick={() => onOpenCompany(companyId)}
                className="hover:underline"
              >
                {companyName}
              </button>
            ) : (
              companyName
            )}
          </div>
        ) : null}
        {visibleBadges.length > 0 ? (
          <div className="mt-1.5 flex flex-wrap gap-1">
            {visibleBadges.map((badge) => (
              <span
                key={badge}
                className={`rounded-full border px-2 py-0.5 text-[10px] font-medium ${BADGE_CLASSNAMES[badge] ?? "border-zinc-200 bg-zinc-50 text-zinc-700"}`}
              >
                {badgeLabel(badge)}
              </span>
            ))}
          </div>
        ) : null}
      </div>
    ),
    [fullName, companyName, companyId, onOpenCompany, visibleBadges],
  );

  const headerActions = (
    <div className="relative" ref={ref}>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="rounded-md border border-zinc-200 px-2.5 py-1 text-xs font-medium text-zinc-700 hover:bg-zinc-50"
      >
        {t.actions.menu}
      </button>
      {open ? (
        <div className="absolute right-0 z-20 mt-1 min-w-56 rounded-md border border-zinc-200 bg-white p-1 shadow-lg">
          <button
            type="button"
            onClick={() => {
              setOpen(false);
              onCreateOrder();
            }}
            disabled={creatingOrder}
            className="block w-full rounded px-2 py-2 text-left text-sm text-zinc-700 hover:bg-zinc-50 disabled:opacity-50"
          >
            {creatingOrder ? t.actions.creatingOrder : t.actions.createOrder}
          </button>
          <button
            type="button"
            onClick={() => {
              setOpen(false);
              onCreateTask();
            }}
            className="block w-full rounded px-2 py-2 text-left text-sm text-zinc-700 hover:bg-zinc-50"
          >
            {t.actions.createTask}
          </button>
          <button
            type="button"
            onClick={() => {
              setOpen(false);
              onScheduleVisit();
            }}
            className="block w-full rounded px-2 py-2 text-left text-sm text-zinc-700 hover:bg-zinc-50"
          >
            {t.actions.scheduleVisit}
          </button>
          <a
            href={phone ? `tel:${phone}` : undefined}
            className={`block rounded px-2 py-2 text-sm ${
              phone ? "text-zinc-700 hover:bg-zinc-50" : "pointer-events-none text-zinc-400"
            }`}
          >
            {t.actions.callTel}
          </a>
          {phone ? (
            <div className="px-2 py-2">
              <KyivstarDialButton phone={phone} size="md" className="w-full justify-center" />
            </div>
          ) : null}
          <a
            href={email ? `mailto:${email}` : undefined}
            className={`block rounded px-2 py-2 text-sm ${
              email ? "text-zinc-700 hover:bg-zinc-50" : "pointer-events-none text-zinc-400"
            }`}
          >
            {t.actions.email}
          </a>
          <a
            href={
              telegramConversationId
                ? `/inbox/telegram?conversationId=${telegramConversationId}`
                : undefined
            }
            className={`block rounded px-2 py-2 text-sm ${
              telegramConversationId
                ? "text-zinc-700 hover:bg-zinc-50"
                : "pointer-events-none text-zinc-400"
            }`}
          >
            {t.actions.message}
          </a>
          {canEnqueueDialer ? (
            <button
              type="button"
              disabled={queueingDialer}
              onClick={() => {
                setOpen(false);
                onEnqueueDialer();
              }}
              className="block w-full rounded px-2 py-2 text-left text-sm text-zinc-700 hover:bg-zinc-50 disabled:opacity-50"
            >
              {queueingDialer ? t.actions.enqueueingDialer : t.actions.enqueueDialer}
            </button>
          ) : null}
          <button
            type="button"
            disabled={resetPasswordLoading}
            onClick={() => {
              setOpen(false);
              onResetPassword();
            }}
            className="block w-full rounded px-2 py-2 text-left text-sm text-zinc-700 hover:bg-zinc-50 disabled:opacity-50"
          >
            {resetPasswordLoading ? t.actions.resettingPassword : t.actions.resetPassword}
          </button>
          {canDelete ? (
            <>
              <div className="my-1 h-px bg-zinc-100" />
              <button
                type="button"
                onClick={() => {
                  setOpen(false);
                  onDelete();
                }}
                className="block w-full rounded px-2 py-2 text-left text-sm text-red-700 hover:bg-red-50"
              >
                {t.actions.deleteContact}
              </button>
            </>
          ) : null}
        </div>
      ) : null}
    </div>
  );

  return {
    title,
    subtitle: subtitleParts.length ? subtitleParts.join(" · ") : undefined,
    headerActions,
  };
}

export function badgesFromSummary(summary: ContactCardSummary | null): string[] {
  return summary?.contact.badges ?? [];
}

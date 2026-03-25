"use client";

import Link from "next/link";

type Props = {
  phone: string | null | undefined;
  email: string | null | undefined;
  telegramLinked: boolean;
  telegramConversationId: string | null | undefined;
  onCreateOrder: () => void;
  onScheduleVisit: () => void;
  /** §15: швидкий перехід на вкладку задач */
  onOpenTasks?: () => void;
  /** §15: відкрити замовлення з боргом (payment flow у OrderModal) */
  onOpenPayment?: () => void;
  visitDisabled?: boolean;
  labels: {
    quickCall: string;
    quickEmail: string;
    quickTelegram: string;
    quickVisit: string;
    quickOrderShort: string;
    quickTask: string;
    quickPayment: string;
    tooltipNoPhone: string;
  };
};

function telHref(phone: string): string {
  const digits = phone.replace(/[^\d+]/g, "");
  return digits.startsWith("+") ? `tel:${digits}` : `tel:+${digits.replace(/^\+/, "")}`;
}

function chipClassName(kind: "default" | "telegram" | "payment" = "default"): string {
  if (kind === "telegram") {
    return "inline-flex min-h-10 shrink-0 items-center justify-center rounded-lg border border-sky-200 bg-sky-50 px-3 py-2 text-sm font-medium text-sky-900 hover:bg-sky-100 sm:min-h-0 sm:rounded-md sm:px-2.5 sm:py-1.5 sm:text-xs";
  }
  if (kind === "payment") {
    return "inline-flex min-h-10 shrink-0 items-center justify-center rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm font-medium text-amber-950 hover:bg-amber-100 sm:min-h-0 sm:rounded-md sm:px-2.5 sm:py-1.5 sm:text-xs";
  }
  return "inline-flex min-h-10 shrink-0 items-center justify-center rounded-lg border border-zinc-200 bg-white px-3 py-2 text-sm font-medium text-zinc-800 hover:bg-zinc-50 sm:min-h-0 sm:rounded-md sm:px-2.5 sm:py-1.5 sm:text-xs";
}

export function ContactQuickActions({
  phone,
  email,
  telegramLinked,
  telegramConversationId,
  onCreateOrder,
  onScheduleVisit,
  onOpenTasks,
  onOpenPayment,
  visitDisabled,
  labels,
}: Props) {
  const hasPhone = !!(phone && phone.trim());
  const hasEmail = !!(email && email.trim());

  return (
    <div className="border-b border-zinc-100 pb-3">
      <div className="flex gap-2 overflow-x-auto pb-1 sm:flex-wrap sm:items-center">
      {hasPhone ? (
        <a
          href={telHref(phone!)}
          className={chipClassName()}
        >
          {labels.quickCall}
        </a>
      ) : (
        <span
          className="inline-flex min-h-10 shrink-0 cursor-not-allowed items-center justify-center rounded-lg border border-zinc-100 px-3 py-2 text-sm text-zinc-400 sm:min-h-0 sm:rounded-md sm:px-2.5 sm:py-1.5 sm:text-xs"
          title={labels.tooltipNoPhone}
        >
          {labels.quickCall}
        </span>
      )}
      {hasEmail ? (
        <a
          href={`mailto:${encodeURIComponent(email!.trim())}`}
          className={chipClassName()}
        >
          {labels.quickEmail}
        </a>
      ) : (
        <span className="inline-flex min-h-10 shrink-0 cursor-not-allowed items-center justify-center rounded-lg border border-zinc-100 px-3 py-2 text-sm text-zinc-400 sm:min-h-0 sm:rounded-md sm:px-2.5 sm:py-1.5 sm:text-xs">
          {labels.quickEmail}
        </span>
      )}
      {telegramLinked && telegramConversationId ? (
        <Link
          href={`/inbox/telegram?conversationId=${encodeURIComponent(telegramConversationId)}`}
          className={chipClassName("telegram")}
        >
          {labels.quickTelegram}
        </Link>
      ) : (
        <span className="inline-flex min-h-10 shrink-0 cursor-not-allowed items-center justify-center rounded-lg border border-zinc-100 px-3 py-2 text-sm text-zinc-400 sm:min-h-0 sm:rounded-md sm:px-2.5 sm:py-1.5 sm:text-xs">
          {labels.quickTelegram}
        </span>
      )}
      <button
        type="button"
        onClick={() => onScheduleVisit()}
        disabled={visitDisabled}
        className={`${chipClassName()} disabled:cursor-not-allowed disabled:opacity-50`}
      >
        {labels.quickVisit}
      </button>
      <button
        type="button"
        onClick={onCreateOrder}
        className={chipClassName()}
      >
        {labels.quickOrderShort}
      </button>
      {onOpenTasks ? (
        <button
          type="button"
          onClick={onOpenTasks}
          className={chipClassName()}
        >
          {labels.quickTask}
        </button>
      ) : null}
      {onOpenPayment ? (
        <button
          type="button"
          onClick={onOpenPayment}
          className={chipClassName("payment")}
        >
          {labels.quickPayment}
        </button>
      ) : null}
      </div>
    </div>
  );
}

export function ContactQuickActionsMobileBar({
  phone,
  onCreateOrder,
  onScheduleVisit,
  onOpenTasks,
  onOpenPayment,
  visitDisabled,
  labels,
}: Pick<
  Props,
  | "phone"
  | "onCreateOrder"
  | "onScheduleVisit"
  | "onOpenTasks"
  | "onOpenPayment"
  | "visitDisabled"
  | "labels"
>) {
  const hasPhone = !!(phone && phone.trim());
  const actionClassName =
    "inline-flex min-h-11 items-center justify-center rounded-xl border border-zinc-200 bg-white px-3 py-2 text-sm font-medium text-zinc-900 shadow-sm";

  return (
    <div className="grid grid-cols-4 gap-2">
      {hasPhone ? (
        <a href={telHref(phone!)} className={actionClassName}>
          {labels.quickCall}
        </a>
      ) : (
        <span className={`${actionClassName} cursor-not-allowed border-zinc-100 text-zinc-400`} title={labels.tooltipNoPhone}>
          {labels.quickCall}
        </span>
      )}
      <button type="button" onClick={onCreateOrder} className={actionClassName}>
        {labels.quickOrderShort}
      </button>
      <button
        type="button"
        onClick={onScheduleVisit}
        disabled={visitDisabled}
        className={`${actionClassName} disabled:cursor-not-allowed disabled:opacity-50`}
      >
        {labels.quickVisit}
      </button>
      {onOpenPayment ? (
        <button
          type="button"
          onClick={onOpenPayment}
          className="inline-flex min-h-11 items-center justify-center rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-sm font-medium text-amber-950 shadow-sm"
        >
          {labels.quickPayment}
        </button>
      ) : onOpenTasks ? (
        <button type="button" onClick={onOpenTasks} className={actionClassName}>
          {labels.quickTask}
        </button>
      ) : (
        <span className={`${actionClassName} cursor-not-allowed border-zinc-100 text-zinc-400`}>
          {labels.quickTask}
        </span>
      )}
    </div>
  );
}

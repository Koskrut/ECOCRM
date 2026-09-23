"use client";

import { Pin } from "lucide-react";
import { inboxStatusLabel } from "@/lib/status-labels";

export type InboxListRowItem = {
  id: string;
  title: string;
  status: "OPEN" | "PENDING" | "CLOSED";
  pinnedAt: string | null;
  unreadCount: number;
  lastMessageAt: string | null;
  lastMessageText: string | null;
  lastMessageDirection?: "INBOUND" | "OUTBOUND" | "INTERNAL" | null;
};

type Props = {
  item: InboxListRowItem;
  selected: boolean;
  timeLabel: string;
  onSelect: () => void;
  onTogglePin: () => void;
};

export function InboxConversationRow({
  item,
  selected,
  timeLabel,
  onSelect,
  onTogglePin,
}: Props) {
  const unread = item.unreadCount > 0;
  const preview =
    item.lastMessageDirection === "INTERNAL" && item.lastMessageText
      ? `[нотатка] ${item.lastMessageText}`
      : item.lastMessageText;

  return (
    <li>
      <div
        className={`flex w-full items-stretch transition-colors ${
          selected ? "bg-accent-gradient/10" : "hover:bg-zinc-100/80"
        } ${unread ? "border-l-2 border-l-blue-600" : ""}`}
      >
        <button
          type="button"
          onClick={onSelect}
          className="min-w-0 flex-1 px-3 py-3 text-left"
        >
          <div className="flex items-center justify-between gap-2">
            <span
              className={`truncate text-zinc-900 ${unread ? "font-semibold" : "font-medium"}`}
            >
              {item.pinnedAt ? (
                <Pin className="mr-1 inline h-3 w-3 text-amber-600" aria-hidden />
              ) : null}
              {item.title}
            </span>
            <span className="flex shrink-0 items-center gap-1.5">
              {unread ? (
                <span
                  className="inline-flex min-w-[1.25rem] items-center justify-center rounded-full bg-blue-600 px-1.5 py-0.5 text-[10px] font-semibold text-white"
                  aria-label={`${item.unreadCount} непрочитаних`}
                >
                  {item.unreadCount > 99 ? "99+" : item.unreadCount}
                </span>
              ) : null}
              <span className="text-xs text-zinc-500">{timeLabel}</span>
            </span>
          </div>
          {preview ? (
            <p
              className={`mt-0.5 truncate text-xs ${unread ? "text-zinc-700" : "text-zinc-500"}`}
            >
              {preview}
            </p>
          ) : null}
          <span className="mt-1 inline-block rounded bg-zinc-200/80 px-1.5 py-0.5 text-[10px] text-zinc-600">
            {inboxStatusLabel(item.status)}
          </span>
        </button>
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            onTogglePin();
          }}
          title={item.pinnedAt ? "Відкріпити" : "Закріпити"}
          aria-label={item.pinnedAt ? "Відкріпити" : "Закріпити"}
          className={`shrink-0 px-2 text-zinc-400 hover:text-amber-600 ${
            item.pinnedAt ? "text-amber-600" : ""
          }`}
        >
          <Pin className="h-3.5 w-3.5" />
        </button>
      </div>
    </li>
  );
}

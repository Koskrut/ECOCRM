"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useSearchParams } from "next/navigation";
import {
  contactsApi,
  metaConversationsApi,
  type Contact,
  type MetaConversationItem,
  type MetaInboxChannel,
  type MetaMessageItem,
} from "@/lib/api";
import { isTextSelected } from "@/lib/dom";
import { Link2, MessageCircle, Send, User, UserPlus } from "lucide-react";
import { DateTime } from "luxon";
import { CRM_LOCALE, CRM_TIME_ZONE } from "@/lib/crmDatetime";
import { inboxStatusLabel } from "@/lib/status-labels";

const PAGE_SIZE = 50;
const LIST_PAGE_SIZE = 30;
const INBOX_POLL_MS = 5_000;

function isConversationUnread(c: MetaConversationItem, activeId: string | null): boolean {
  if (c.status !== "OPEN") return false;
  if (c.id === activeId) return false;
  return c.lastMessage?.direction === "INBOUND";
}

function formatTime(iso: string): string {
  const d = DateTime.fromISO(iso, { setZone: true }).setZone(CRM_TIME_ZONE);
  if (!d.isValid) return iso;
  const now = DateTime.now().setZone(CRM_TIME_ZONE);
  if (d.toISODate() === now.toISODate()) {
    return d.setLocale(CRM_LOCALE).toLocaleString(DateTime.TIME_SIMPLE);
  }
  return d.setLocale(CRM_LOCALE).toLocaleString({
    day: "numeric",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function conversationTitle(c: MetaConversationItem): string {
  if (c.contact) {
    return [c.contact.lastName, c.contact.firstName].filter(Boolean).join(" ") || c.contact.phone;
  }
  if (c.lead) {
    return (
      c.lead.fullName ||
      [c.lead.lastName, c.lead.firstName].filter(Boolean).join(" ") ||
      c.lead.phone ||
      "Лід"
    );
  }
  if (c.displayName?.trim()) return c.displayName.trim();
  return `Чат ${c.participantId ?? c.id}`;
}

type MetaInboxPageProps = {
  channel: MetaInboxChannel;
  title: string;
  emptyChannelLabel: string;
};

export function MetaInboxPage({ channel, title, emptyChannelLabel }: MetaInboxPageProps) {
  const searchParams = useSearchParams();
  const conversationIdFromUrl = searchParams.get("conversationId");

  const [mobilePanel, setMobilePanel] = useState<"list" | "chat" | "card">("list");
  const [conversations, setConversations] = useState<MetaConversationItem[]>([]);
  const [conversationsTotal, setConversationsTotal] = useState(0);
  const [conversationsLoading, setConversationsLoading] = useState(true);
  const [selectedId, setSelectedId] = useState<string | null>(conversationIdFromUrl);
  const [messages, setMessages] = useState<MetaMessageItem[]>([]);
  const [messagesLoading, setMessagesLoading] = useState(false);
  const [sendText, setSendText] = useState("");
  const [sending, setSending] = useState(false);
  const [statusFilter, setStatusFilter] = useState<string>("OPEN");
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const [linkModalOpen, setLinkModalOpen] = useState(false);
  const [linkSearch, setLinkSearch] = useState("");
  const [linkResults, setLinkResults] = useState<Contact[]>([]);
  const [linkSearching, setLinkSearching] = useState(false);
  const [linkContactLoading, setLinkContactLoading] = useState(false);
  const [createContactLoading, setCreateContactLoading] = useState(false);
  const linkSearchTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const selected = conversations.find((c) => c.id === selectedId);

  const loadConversations = useCallback(async (opts?: { silent?: boolean }) => {
    if (!opts?.silent) setConversationsLoading(true);
    try {
      const res = await metaConversationsApi.list({
        channel,
        status: statusFilter || undefined,
        page: 1,
        pageSize: LIST_PAGE_SIZE,
      });
      setConversations(res.items);
      setConversationsTotal(res.total);
    } catch {
      if (!opts?.silent) {
        setConversations([]);
        setConversationsTotal(0);
      }
    } finally {
      if (!opts?.silent) setConversationsLoading(false);
    }
  }, [channel, statusFilter]);

  const loadMessages = useCallback(async (convId: string, opts?: { silent?: boolean }) => {
    if (!opts?.silent) setMessagesLoading(true);
    try {
      const res = await metaConversationsApi.getMessages(convId, {
        page: 1,
        pageSize: PAGE_SIZE,
      });
      setMessages(res.items);
    } catch {
      if (!opts?.silent) setMessages([]);
    } finally {
      if (!opts?.silent) setMessagesLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadConversations();
  }, [loadConversations]);

  const selectedIdRef = useRef(selectedId);
  useEffect(() => {
    selectedIdRef.current = selectedId;
  }, [selectedId]);

  useEffect(() => {
    const tick = () => {
      if (document.visibilityState !== "visible") return;
      void loadConversations({ silent: true });
      const activeId = selectedIdRef.current;
      if (activeId) void loadMessages(activeId, { silent: true });
    };
    const id = window.setInterval(tick, INBOX_POLL_MS);
    return () => window.clearInterval(id);
  }, [loadConversations, loadMessages]);

  useEffect(() => {
    if (conversationIdFromUrl && conversationIdFromUrl !== selectedId) {
      setSelectedId(conversationIdFromUrl);
      setMobilePanel("chat");
    }
  }, [conversationIdFromUrl, selectedId]);

  const selectConversation = (id: string) => {
    setSelectedId(id);
    setMobilePanel("chat");
  };

  const backToList = () => {
    setMobilePanel("list");
    setSelectedId(null);
  };

  useEffect(() => {
    if (selectedId) void loadMessages(selectedId);
    else setMessages([]);
  }, [selectedId, loadMessages]);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  const handleSend = useCallback(async () => {
    const text = sendText.trim();
    if (!text || !selectedId || sending) return;

    setSendText("");
    const optimistic: MetaMessageItem = {
      id: `opt-${Date.now()}`,
      conversationId: selectedId,
      direction: "OUTBOUND",
      text,
      externalMessageId: null,
      authorUserId: null,
      author: null,
      sentAt: new Date().toISOString(),
      createdAt: new Date().toISOString(),
      mediaType: null,
      fileId: null,
      fileUrl: null,
    };
    setMessages((prev) => [...prev, optimistic]);
    setSending(true);

    try {
      const created = await metaConversationsApi.sendMessage(selectedId, text);
      setMessages((prev) => prev.map((m) => (m.id === optimistic.id ? created : m)));
      void loadConversations();
    } catch {
      setMessages((prev) => prev.filter((m) => m.id !== optimistic.id));
    } finally {
      setSending(false);
    }
  }, [selectedId, sendText, sending, loadConversations]);

  const handleStatusChange = useCallback(
    async (convId: string, status: "OPEN" | "PENDING" | "CLOSED") => {
      try {
        await metaConversationsApi.updateStatus(convId, status);
        setConversations((prev) => prev.map((c) => (c.id === convId ? { ...c, status } : c)));
      } catch {
        // keep UI
      }
    },
    [],
  );

  const handleLinkContact = useCallback(
    async (contactId: string) => {
      if (!selectedId || linkContactLoading) return;
      setLinkContactLoading(true);
      try {
        await metaConversationsApi.linkContact(selectedId, contactId);
        setLinkModalOpen(false);
        setLinkSearch("");
        setLinkResults([]);
        void loadConversations();
      } finally {
        setLinkContactLoading(false);
      }
    },
    [selectedId, linkContactLoading, loadConversations],
  );

  const handleCreateContactFromLead = useCallback(async () => {
    if (!selectedId || createContactLoading) return;
    setCreateContactLoading(true);
    try {
      await metaConversationsApi.createContactFromLead(selectedId);
      void loadConversations();
    } finally {
      setCreateContactLoading(false);
    }
  }, [selectedId, createContactLoading, loadConversations]);

  const linkSearchDebounced = useMemo(() => linkSearch.trim(), [linkSearch]);
  useEffect(() => {
    if (!linkModalOpen) return;
    if (linkSearchTimerRef.current) clearTimeout(linkSearchTimerRef.current);
    if (!linkSearchDebounced) {
      setLinkResults([]);
      return;
    }
    linkSearchTimerRef.current = setTimeout(() => {
      setLinkSearching(true);
      contactsApi
        .list({ q: linkSearchDebounced, pageSize: 10 })
        .then((r) => setLinkResults(r.items))
        .catch(() => setLinkResults([]))
        .finally(() => setLinkSearching(false));
    }, 300);
    return () => {
      if (linkSearchTimerRef.current) clearTimeout(linkSearchTimerRef.current);
    };
  }, [linkModalOpen, linkSearchDebounced]);

  return (
    <div className="flex h-[calc(100dvh-5rem)] max-w-full min-w-0 gap-0 overflow-hidden rounded-xl border border-zinc-200 bg-white shadow-sm">
      <aside
        className={`flex w-full flex-shrink-0 flex-col border-r border-zinc-200 bg-zinc-50/50 md:w-80 ${
          mobilePanel === "list" ? "flex" : "hidden md:flex"
        }`}
      >
        <div className="border-b border-zinc-200 p-3">
          <h2 className="flex items-center gap-2 text-lg font-semibold text-zinc-900">
            <MessageCircle className="h-5 w-5" />
            {title}
          </h2>
          <div className="mt-2 flex gap-1">
            {(["OPEN", "PENDING", "CLOSED"] as const).map((s) => (
              <button
                key={s}
                type="button"
                onClick={() => setStatusFilter(s)}
                className={`rounded px-2 py-1 text-xs font-medium ${
                  statusFilter === s
                    ? "bg-accent-gradient text-white"
                    : "bg-zinc-200/80 text-zinc-600 hover:bg-zinc-200"
                }`}
              >
                {s}
              </button>
            ))}
          </div>
        </div>
        <div className="flex-1 overflow-y-auto">
          {conversationsLoading ? (
            <div className="p-4 text-center text-sm text-zinc-500">Завантаження…</div>
          ) : conversations.length === 0 ? (
            <div className="p-4 text-center text-sm text-zinc-500">Немає діалогів</div>
          ) : (
            <ul className="divide-y divide-zinc-100">
              {conversations.map((c) => {
                const unread = isConversationUnread(c, selectedId);
                return (
                  <li key={c.id}>
                    <button
                      type="button"
                      onClick={() => {
                        if (isTextSelected()) return;
                        selectConversation(c.id);
                      }}
                      className={`w-full px-3 py-3 text-left transition-colors ${
                        selectedId === c.id ? "bg-accent-gradient/10" : "hover:bg-zinc-100/80"
                      } ${unread ? "border-l-2 border-l-blue-600" : ""}`}
                    >
                      <div className="flex items-center justify-between gap-2">
                        <span
                          className={`truncate text-zinc-900 ${unread ? "font-semibold" : "font-medium"}`}
                        >
                          {conversationTitle(c)}
                        </span>
                        <span className="flex shrink-0 items-center gap-1.5">
                          {unread && (
                            <span
                              className="size-2 rounded-full bg-blue-600"
                              aria-label="Нове повідомлення"
                            />
                          )}
                          <span className="text-xs text-zinc-500">
                            {c.lastMessageAt ? formatTime(c.lastMessageAt) : ""}
                          </span>
                        </span>
                      </div>
                      {c.lastMessage?.text && (
                        <p
                          className={`mt-0.5 truncate text-xs ${unread ? "text-zinc-700" : "text-zinc-500"}`}
                        >
                          {c.lastMessage.text}
                        </p>
                      )}
                      <span className="mt-1 inline-block rounded bg-zinc-200/80 px-1.5 py-0.5 text-[10px] text-zinc-600">
                        {inboxStatusLabel(c.status)}
                      </span>
                    </button>
                  </li>
                );
              })}
            </ul>
          )}
        </div>
        {conversationsTotal > LIST_PAGE_SIZE ? (
          <p className="border-t border-zinc-200 p-2 text-center text-xs text-zinc-500">
            Показано {conversations.length} з {conversationsTotal}
          </p>
        ) : null}
      </aside>

      <section
        className={`min-w-0 flex-1 flex-col bg-white ${
          mobilePanel === "chat" ? "flex" : "hidden md:flex"
        }`}
      >
        {!selectedId ? (
          <div className="hidden flex-1 items-center justify-center text-zinc-500 md:flex">
            <div className="text-center">
              <MessageCircle className="mx-auto h-12 w-12 text-zinc-300" />
              <p className="mt-2">Оберіть діалог зі списку</p>
            </div>
          </div>
        ) : (
          <>
            <div className="border-b border-zinc-200 px-4 py-2">
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={backToList}
                  className="rounded-md border border-zinc-200 px-2 py-1 text-sm text-zinc-700 hover:bg-zinc-50 md:hidden"
                  aria-label="Назад до списку"
                >
                  ←
                </button>
                <h3 className="min-w-0 flex-1 truncate font-medium text-zinc-900">
                  {selected ? conversationTitle(selected) : "…"}
                </h3>
                <button
                  type="button"
                  onClick={() => setMobilePanel("card")}
                  className="rounded-md border border-zinc-200 p-1.5 text-zinc-600 hover:bg-zinc-50 md:hidden"
                  aria-label="Картка контакту"
                >
                  <User className="h-4 w-4" />
                </button>
              </div>
              <div className="mt-1 flex gap-2">
                {(["OPEN", "PENDING", "CLOSED"] as const).map((s) => (
                  <button
                    key={s}
                    type="button"
                    onClick={() => selected && handleStatusChange(selected.id, s)}
                    className={`rounded px-2 py-0.5 text-xs ${
                      selected?.status === s
                        ? "bg-zinc-800 text-white"
                        : "bg-zinc-100 text-zinc-600 hover:bg-zinc-200"
                    }`}
                  >
                    {s}
                  </button>
                ))}
              </div>
            </div>

            <div className="flex-1 overflow-y-auto p-4">
              {messagesLoading ? (
                <div className="flex justify-center py-8 text-zinc-500">Завантаження повідомлень…</div>
              ) : (
                <div className="space-y-3">
                  {messages.map((m) => (
                    <div
                      key={m.id}
                      className={`flex ${m.direction === "OUTBOUND" ? "justify-end" : "justify-start"}`}
                    >
                      <div
                        className={`max-w-[75%] rounded-lg px-3 py-2 text-sm ${
                          m.direction === "OUTBOUND"
                            ? "bg-accent-gradient text-white"
                            : "bg-zinc-100 text-zinc-900"
                        }`}
                      >
                        <p className="whitespace-pre-wrap break-words">{m.text || "(вкладення)"}</p>
                        <p
                          className={`mt-1 text-[10px] ${
                            m.direction === "OUTBOUND" ? "text-white/80" : "text-zinc-500"
                          }`}
                        >
                          {formatTime(m.sentAt)}
                          {m.direction === "OUTBOUND" && m.author && ` · ${m.author.fullName}`}
                        </p>
                      </div>
                    </div>
                  ))}
                  <div ref={messagesEndRef} />
                </div>
              )}
            </div>

            <div className="border-t border-zinc-200 p-3">
              <form
                onSubmit={(e) => {
                  e.preventDefault();
                  void handleSend();
                }}
                className="flex gap-2"
              >
                <input
                  type="text"
                  value={sendText}
                  onChange={(e) => setSendText(e.target.value)}
                  placeholder="Повідомлення…"
                  className="min-w-0 flex-1 rounded-lg border border-zinc-200 px-3 py-2 text-sm outline-none focus:border-zinc-400 focus:ring-1 focus:ring-zinc-400"
                  disabled={sending}
                />
                <button
                  type="submit"
                  disabled={!sendText.trim() || sending}
                  className="rounded-lg bg-accent-gradient px-4 py-2 text-white shadow-sm transition-opacity hover:opacity-90 disabled:opacity-50"
                  aria-label="Відправити"
                >
                  <Send className="h-4 w-4" />
                </button>
              </form>
            </div>
          </>
        )}
      </section>

      <aside
        className={`flex w-full flex-shrink-0 flex-col border-l border-zinc-200 bg-zinc-50/50 p-4 md:w-72 ${
          mobilePanel === "card" ? "flex" : "hidden md:flex"
        }`}
      >
        {mobilePanel === "card" ? (
          <button
            type="button"
            onClick={() => setMobilePanel("chat")}
            className="mb-3 self-start rounded-md border border-zinc-200 px-2 py-1 text-sm text-zinc-700 hover:bg-zinc-100 md:hidden"
          >
            ← До чату
          </button>
        ) : null}
        {!selected ? (
          <div className="flex flex-1 items-center justify-center text-center text-sm text-zinc-500">
            <div>
              <User className="mx-auto h-10 w-10 text-zinc-300" />
              <p className="mt-2">Контакт або лід</p>
            </div>
          </div>
        ) : (
          <div className="space-y-3">
            <h4 className="text-sm font-medium text-zinc-700">Картка</h4>
            {selected.contact && (
              <div className="rounded-lg border border-zinc-200 bg-white p-3 text-sm">
                <p className="font-medium text-zinc-900">
                  {selected.contact.lastName} {selected.contact.firstName}
                </p>
                <p className="mt-1 text-zinc-600">{selected.contact.phone}</p>
                <a
                  href={`/contacts?contactId=${selected.contact.id}`}
                  className="mt-2 inline-block text-xs text-blue-600 hover:underline"
                >
                  Відкрити контакт →
                </a>
              </div>
            )}
            {selected.lead && !selected.contact && (
              <div className="rounded-lg border border-zinc-200 bg-white p-3 text-sm">
                <p className="font-medium text-zinc-900">
                  {selected.lead.fullName ||
                    [selected.lead.lastName, selected.lead.firstName].filter(Boolean).join(" ") ||
                    "Лід"}
                </p>
                {selected.lead.phone && (
                  <p className="mt-1 text-zinc-600">{selected.lead.phone}</p>
                )}
                <div className="mt-2 flex flex-wrap gap-2">
                  <a
                    href={`/leads?leadId=${selected.lead.id}`}
                    className="inline-flex items-center gap-1 text-xs text-blue-600 hover:underline"
                  >
                    Відкрити лід →
                  </a>
                  <button
                    type="button"
                    onClick={() => setLinkModalOpen(true)}
                    disabled={linkContactLoading}
                    className="inline-flex items-center gap-1 rounded border border-zinc-200 px-2 py-1 text-xs font-medium text-zinc-700 hover:bg-zinc-50 disabled:opacity-50"
                  >
                    <Link2 className="h-3 w-3" />
                    Прив&apos;язати до контакту
                  </button>
                  <button
                    type="button"
                    onClick={() => void handleCreateContactFromLead()}
                    disabled={createContactLoading || !selected.lead.phone}
                    title={
                      !selected.lead.phone
                        ? "Додайте телефон до ліда"
                        : "Створити контакт з даних ліда"
                    }
                    className="inline-flex items-center gap-1 rounded border border-zinc-200 px-2 py-1 text-xs font-medium text-zinc-700 hover:bg-zinc-50 disabled:opacity-50"
                  >
                    <UserPlus className="h-3 w-3" />
                    {createContactLoading ? "…" : "Створити контакт"}
                  </button>
                </div>
                {linkModalOpen && (
                  <div className="mt-3 rounded border border-zinc-200 bg-zinc-50 p-2">
                    <input
                      type="text"
                      value={linkSearch}
                      onChange={(e) => setLinkSearch(e.target.value)}
                      placeholder="Пошук контакту…"
                      className="w-full rounded border border-zinc-200 px-2 py-1.5 text-sm outline-none"
                      autoFocus
                    />
                    {linkSearching && <p className="mt-1 text-xs text-zinc-500">Пошук…</p>}
                    {!linkSearching && linkSearch.trim() && linkResults.length === 0 && (
                      <p className="mt-1 text-xs text-zinc-500">Нічого не знайдено</p>
                    )}
                    <ul className="mt-2 max-h-32 overflow-y-auto">
                      {linkResults.map((c) => (
                        <li key={c.id}>
                          <button
                            type="button"
                            onClick={() => void handleLinkContact(c.id)}
                            disabled={linkContactLoading}
                            className="w-full rounded px-2 py-1.5 text-left text-xs hover:bg-zinc-200 disabled:opacity-50"
                          >
                            {c.lastName} {c.firstName} — {c.phone}
                          </button>
                        </li>
                      ))}
                    </ul>
                    <button
                      type="button"
                      onClick={() => {
                        setLinkModalOpen(false);
                        setLinkSearch("");
                        setLinkResults([]);
                      }}
                      className="mt-2 text-xs text-zinc-500 hover:underline"
                    >
                      Скасувати
                    </button>
                  </div>
                )}
              </div>
            )}
            {!selected.contact && !selected.lead && (
              <p className="text-sm text-zinc-500">{emptyChannelLabel}</p>
            )}
          </div>
        )}
      </aside>
    </div>
  );
}

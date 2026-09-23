"use client";

import { Suspense, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import {
  conversationsApi,
  contactsApi,
  type ConversationItem,
  type Contact,
  type MessageItem,
} from "@/lib/api";
import { apiHttp } from "@/lib/api/client";
import { authApi } from "@/lib/api/resources/auth";
import { MessageCircle, User } from "lucide-react";
import { DateTime } from "luxon";
import { CRM_LOCALE, CRM_TIME_ZONE } from "@/lib/crmDatetime";
import { PageLoading, ErrorPanel } from "@/components/feedback";
import { InboxStatusFilter } from "@/components/inbox/InboxStatusFilter";
import { InboxStatusActions } from "@/components/inbox/InboxStatusActions";
import { InboxConversationRow } from "@/components/inbox/InboxConversationRow";
import { InboxComposer } from "@/components/inbox/InboxComposer";
import { InboxClientCard } from "@/components/inbox/InboxClientCard";
import { InboxSelectionToolbar } from "@/components/inbox/InboxSelectionToolbar";
import { TaskCreateModal } from "@/components/tasks/TaskCreateModal";
import {
  useEntityModalStack,
  type EntityModalFrame,
} from "@/lib/modal/useEntityModalStack";
import { EntityModalStackLayers } from "@/components/modals/EntityModalStackLayers";

const PAGE_SIZE = 50;
const LIST_PAGE_SIZE = 30;
const INBOX_POLL_MS = 5_000;
const HIDE_NOISE_KEY = "inbox.hideNoise.telegram";

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

function conversationTitle(c: ConversationItem): string {
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
  return `Чат ${c.telegramChatId}`;
}

function readHideNoise(): boolean {
  if (typeof window === "undefined") return true;
  const v = window.localStorage.getItem(HIDE_NOISE_KEY);
  if (v == null) return true;
  return v === "1" || v === "true";
}

export default function InboxTelegramPage() {
  return (
    <Suspense fallback={<PageLoading />}>
      <InboxTelegramContent />
    </Suspense>
  );
}

type MobilePanel = "list" | "chat" | "card";

function InboxTelegramContent() {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const conversationIdFromUrl = searchParams.get("conversationId");
  const statusFromUrl = searchParams.get("status");

  const [conversations, setConversations] = useState<ConversationItem[]>([]);
  const [conversationsLoading, setConversationsLoading] = useState(true);
  const [conversationsError, setConversationsError] = useState<string | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(conversationIdFromUrl);
  const [mobilePanel, setMobilePanel] = useState<MobilePanel>(
    conversationIdFromUrl ? "chat" : "list",
  );
  const [messages, setMessages] = useState<MessageItem[]>([]);
  const [messagesLoading, setMessagesLoading] = useState(false);
  const [sendText, setSendText] = useState("");
  const [sending, setSending] = useState(false);
  const [statusFilter, setStatusFilter] = useState<string>(() => {
    if (statusFromUrl === "OPEN" || statusFromUrl === "PENDING" || statusFromUrl === "CLOSED") {
      return statusFromUrl;
    }
    return "OPEN";
  });
  const [hideNoise, setHideNoise] = useState(true);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const [linkModalOpen, setLinkModalOpen] = useState(false);
  const [linkSearch, setLinkSearch] = useState("");
  const [linkResults, setLinkResults] = useState<Contact[]>([]);
  const [linkSearching, setLinkSearching] = useState(false);
  const [linkContactLoading, setLinkContactLoading] = useState(false);
  const [createContactLoading, setCreateContactLoading] = useState(false);
  const linkSearchTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [suggestions, setSuggestions] = useState<string[]>([]);
  const [suggestLoading, setSuggestLoading] = useState(false);
  const [meId, setMeId] = useState<string | null>(null);
  const [assignLoading, setAssignLoading] = useState(false);
  const [taskModalOpen, setTaskModalOpen] = useState(false);
  const [taskPreset, setTaskPreset] = useState<{
    contactId?: string | null;
    leadId?: string | null;
    linkLabel?: string;
    initialBody?: string;
    initialTitle?: string;
  } | null>(null);
  const [orderRoot, setOrderRoot] = useState<EntityModalFrame | null>(null);
  const orderStack = useEntityModalStack(orderRoot);

  const selected = conversations.find((c) => c.id === selectedId);

  useEffect(() => {
    setHideNoise(readHideNoise());
  }, []);

  useEffect(() => {
    authApi
      .me()
      .then((r) => setMeId(r.user?.id ?? null))
      .catch(() => setMeId(null));
  }, []);

  const loadConversations = useCallback(
    async (opts?: { silent?: boolean }) => {
      if (!opts?.silent) {
        setConversationsLoading(true);
        setConversationsError(null);
      }
      try {
        const res = await conversationsApi.list({
          channel: "TELEGRAM",
          status: statusFilter || undefined,
          hideNoise,
          page: 1,
          pageSize: LIST_PAGE_SIZE,
        });
        setConversations(res.items);
        setConversationsError(null);
      } catch (e) {
        if (!opts?.silent) {
          setConversations([]);
          setConversationsError(e instanceof Error ? e.message : "Не вдалося завантажити діалоги");
        }
      } finally {
        if (!opts?.silent) setConversationsLoading(false);
      }
    },
    [statusFilter, hideNoise],
  );

  useEffect(() => {
    const params = new URLSearchParams(searchParams.toString());
    if (statusFilter && statusFilter !== "OPEN") params.set("status", statusFilter);
    else params.delete("status");
    if (selectedId) params.set("conversationId", selectedId);
    else params.delete("conversationId");
    const next = params.toString();
    const current = searchParams.toString();
    if (next !== current) {
      router.replace(`${pathname}${next ? `?${next}` : ""}`, { scroll: false });
    }
  }, [statusFilter, selectedId, pathname, router, searchParams]);

  const loadMessages = useCallback(async (convId: string, opts?: { silent?: boolean }) => {
    if (!opts?.silent) setMessagesLoading(true);
    try {
      const res = await conversationsApi.getMessages(convId, {
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
    void conversationsApi.markRead(id).then(() => {
      setConversations((prev) =>
        prev.map((c) =>
          c.id === id ? { ...c, unreadCount: 0, lastReadAt: new Date().toISOString() } : c,
        ),
      );
    });
  };

  const backToList = () => {
    setMobilePanel("list");
    setSelectedId(null);
  };

  useEffect(() => {
    if (selectedId) {
      void loadMessages(selectedId);
      setSuggestions([]);
      void conversationsApi.markRead(selectedId).then(() => {
        setConversations((prev) =>
          prev.map((c) =>
            c.id === selectedId
              ? { ...c, unreadCount: 0, lastReadAt: new Date().toISOString() }
              : c,
          ),
        );
      });
    } else {
      setMessages([]);
      setSuggestions([]);
    }
  }, [selectedId, loadMessages]);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  const handleSend = useCallback(async () => {
    const text = sendText.trim();
    if (!text || !selectedId || sending) return;

    setSendText("");
    const optimistic: MessageItem = {
      id: `opt-${Date.now()}`,
      conversationId: selectedId,
      direction: "OUTBOUND",
      text,
      tgMessageId: null,
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
      const created = await conversationsApi.sendMessage(selectedId, text);
      setMessages((prev) => prev.map((m) => (m.id === optimistic.id ? created : m)));
      void loadConversations();
    } catch {
      setMessages((prev) => prev.filter((m) => m.id !== optimistic.id));
    } finally {
      setSending(false);
    }
  }, [selectedId, sendText, sending, loadConversations]);

  const handleSendNote = useCallback(async () => {
    const text = sendText.trim();
    if (!text || !selectedId || sending) return;
    setSendText("");
    setSending(true);
    try {
      const created = await conversationsApi.addNote(selectedId, text);
      setMessages((prev) => [...prev, created]);
      void loadConversations();
    } finally {
      setSending(false);
    }
  }, [selectedId, sendText, sending, loadConversations]);

  const handleStatusChange = useCallback(
    async (convId: string, status: "OPEN" | "PENDING" | "CLOSED") => {
      try {
        await conversationsApi.updateStatus(convId, status);
        setConversations((prev) => {
          if (status !== statusFilter) {
            return prev.filter((c) => c.id !== convId);
          }
          return prev.map((c) => (c.id === convId ? { ...c, status } : c));
        });
      } catch {
        // keep UI
      }
    },
    [statusFilter],
  );

  const handleTogglePin = useCallback(
    async (convId: string, currentlyPinned: boolean) => {
      try {
        const res = await conversationsApi.setPinned(convId, !currentlyPinned);
        setConversations((prev) => {
          const next = prev.map((c) =>
            c.id === convId ? { ...c, pinnedAt: res.pinnedAt } : c,
          );
          return [...next].sort((a, b) => {
            if (a.pinnedAt && !b.pinnedAt) return -1;
            if (!a.pinnedAt && b.pinnedAt) return 1;
            const ta = a.lastMessageAt ? Date.parse(a.lastMessageAt) : 0;
            const tb = b.lastMessageAt ? Date.parse(b.lastMessageAt) : 0;
            return tb - ta;
          });
        });
      } catch {
        // ignore
      }
    },
    [],
  );

  const handleAssign = useCallback(
    async (userId: string | null) => {
      if (!selectedId || assignLoading) return;
      setAssignLoading(true);
      try {
        await conversationsApi.assign(selectedId, userId);
        void loadConversations();
      } finally {
        setAssignLoading(false);
      }
    },
    [selectedId, assignLoading, loadConversations],
  );

  const handleSuggestReplies = useCallback(async () => {
    if (!selectedId || suggestLoading) return;
    setSuggestLoading(true);
    try {
      const res = await conversationsApi.suggestReplies(selectedId);
      setSuggestions(res.suggestions ?? []);
    } catch {
      setSuggestions([]);
    } finally {
      setSuggestLoading(false);
    }
  }, [selectedId, suggestLoading]);

  const handleLinkContact = useCallback(
    async (contactId: string) => {
      if (!selectedId || linkContactLoading) return;
      setLinkContactLoading(true);
      try {
        await conversationsApi.linkContact(selectedId, contactId);
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
      await conversationsApi.createContactFromLead(selectedId);
      void loadConversations();
    } finally {
      setCreateContactLoading(false);
    }
  }, [selectedId, createContactLoading, loadConversations]);

  const openTaskModal = useCallback(
    (opts?: { initialBody?: string }) => {
      if (!selected) return;
      setTaskPreset({
        contactId: selected.contactId,
        leadId: selected.contactId ? null : selected.leadId,
        linkLabel: conversationTitle(selected),
        initialBody: opts?.initialBody,
        initialTitle: opts?.initialBody
          ? `Чат: ${conversationTitle(selected)}`
          : undefined,
      });
      setTaskModalOpen(true);
    },
    [selected],
  );

  const handleCreateOrder = useCallback(async () => {
    if (!selected?.contactId) return;
    const contactId = selected.contactId;
    let companyId: string | null = null;
    try {
      const card = await apiHttp.get<{ contact: { company: { id: string } | null } }>(
        `/contacts/${contactId}/card`,
      );
      companyId = card.data?.contact?.company?.id ?? null;
    } catch {
      // optional
    }
    const res = await apiHttp.post<{ id: string }>("/orders", {
      clientId: contactId,
      contactId,
      companyId,
    });
    const createdId = res.data?.id;
    if (createdId) setOrderRoot({ type: "order", id: createdId });
  }, [selected?.contactId]);

  const linkSearchDebounced = useMemo(() => linkSearch.trim(), [linkSearch]);
  useEffect(() => {
    if (!linkModalOpen) return;
    if (linkSearchTimerRef.current) clearTimeout(linkSearchTimerRef.current);
    if (!linkSearchDebounced) {
      setLinkResults([]);
      setLinkSearching(false);
      return;
    }
    setLinkSearching(true);
    linkSearchTimerRef.current = setTimeout(async () => {
      try {
        const res = await contactsApi.list({ q: linkSearchDebounced, pageSize: 10 });
        setLinkResults(res.items ?? []);
      } catch {
        setLinkResults([]);
      } finally {
        setLinkSearching(false);
      }
    }, 300);
    return () => {
      if (linkSearchTimerRef.current) clearTimeout(linkSearchTimerRef.current);
    };
  }, [linkModalOpen, linkSearchDebounced]);

  const placeholderContext = useMemo(() => {
    if (!selected) return {};
    if (selected.contact) {
      return {
        clientName: [selected.contact.lastName, selected.contact.firstName]
          .filter(Boolean)
          .join(" "),
        phone: selected.contact.phone,
      };
    }
    if (selected.lead) {
      return {
        clientName:
          selected.lead.fullName ||
          [selected.lead.lastName, selected.lead.firstName].filter(Boolean).join(" "),
        phone: selected.lead.phone,
      };
    }
    return {};
  }, [selected]);

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
            Вхідні Telegram
          </h2>
          <div className="mt-2">
            <InboxStatusFilter
              value={statusFilter}
              onChange={setStatusFilter}
              hideNoise={hideNoise}
              onHideNoiseChange={(next) => {
                setHideNoise(next);
                window.localStorage.setItem(HIDE_NOISE_KEY, next ? "1" : "0");
              }}
            />
          </div>
        </div>
        <div className="flex-1 overflow-y-auto">
          {conversationsLoading ? (
            <div className="p-4 text-center text-sm text-zinc-500">Завантаження…</div>
          ) : conversationsError ? (
            <div className="p-3">
              <ErrorPanel
                message={conversationsError}
                onRetry={() => void loadConversations()}
              />
            </div>
          ) : conversations.length === 0 ? (
            <div className="p-4 text-center text-sm text-zinc-500">Немає діалогів</div>
          ) : (
            <ul className="divide-y divide-zinc-100">
              {conversations.map((c) => (
                <InboxConversationRow
                  key={c.id}
                  item={{
                    id: c.id,
                    title: conversationTitle(c),
                    status: c.status,
                    pinnedAt: c.pinnedAt,
                    unreadCount: selectedId === c.id ? 0 : c.unreadCount ?? 0,
                    lastMessageAt: c.lastMessageAt,
                    lastMessageText: c.lastMessage?.text ?? null,
                    lastMessageDirection: c.lastMessage?.direction ?? null,
                  }}
                  selected={selectedId === c.id}
                  timeLabel={c.lastMessageAt ? formatTime(c.lastMessageAt) : ""}
                  onSelect={() => selectConversation(c.id)}
                  onTogglePin={() => void handleTogglePin(c.id, !!c.pinnedAt)}
                />
              ))}
            </ul>
          )}
        </div>
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
              {selected ? (
                <InboxStatusActions
                  value={selected.status}
                  onChange={(s) => void handleStatusChange(selected.id, s)}
                />
              ) : null}
            </div>

            <div className="relative flex-1 overflow-y-auto p-4">
              {messagesLoading ? (
                <div className="flex justify-center py-8 text-zinc-500">
                  Завантаження повідомлень…
                </div>
              ) : (
                <div className="space-y-3">
                  {messages.map((m) => {
                    if (m.direction === "INTERNAL") {
                      return (
                        <div key={m.id} className="flex justify-center">
                          <div className="max-w-[85%] rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-950">
                            <p className="text-[10px] font-medium text-amber-700">
                              Тільки для команди
                              {m.author ? ` · ${m.author.fullName}` : ""}
                            </p>
                            <p className="mt-0.5 whitespace-pre-wrap break-words">
                              {m.text}
                            </p>
                            <p className="mt-1 text-[10px] text-amber-600/80">
                              {formatTime(m.sentAt)}
                            </p>
                          </div>
                        </div>
                      );
                    }
                    return (
                      <div
                        key={m.id}
                        className={`flex ${m.direction === "OUTBOUND" ? "justify-end" : "justify-start"}`}
                      >
                        <div
                          data-inbox-inbound={m.direction === "INBOUND" ? "1" : undefined}
                          className={`max-w-[75%] rounded-lg px-3 py-2 text-sm ${
                            m.direction === "OUTBOUND"
                              ? "bg-accent-gradient text-white"
                              : "bg-zinc-100 text-zinc-900"
                          }`}
                        >
                          <p className="whitespace-pre-wrap break-words">
                            {m.text || "(вкладення)"}
                          </p>
                          <p
                            className={`mt-1 text-[10px] ${
                              m.direction === "OUTBOUND"
                                ? "text-white/80"
                                : "text-zinc-500"
                            }`}
                          >
                            {formatTime(m.sentAt)}
                            {m.direction === "OUTBOUND" && m.author && ` · ${m.author.fullName}`}
                            {m.direction === "OUTBOUND" &&
                              m.status === "FAILED" &&
                              " · ⚠ не доставлено"}
                          </p>
                        </div>
                      </div>
                    );
                  })}
                  <div ref={messagesEndRef} />
                </div>
              )}
              <InboxSelectionToolbar
                onCreateTaskFromSelection={(text) => openTaskModal({ initialBody: text })}
              />
            </div>

            <InboxComposer
              value={sendText}
              onChange={setSendText}
              onSend={() => void handleSend()}
              onSendNote={() => void handleSendNote()}
              sending={sending}
              placeholderContext={placeholderContext}
              showAiSuggest
              onSuggestReplies={handleSuggestReplies}
              suggestLoading={suggestLoading}
              suggestions={suggestions}
            />
          </>
        )}
      </section>

      <aside
        className={`flex w-full flex-shrink-0 flex-col border-l border-zinc-200 bg-zinc-50/50 p-4 md:w-72 ${
          mobilePanel === "card" ? "flex" : "hidden md:flex"
        }`}
      >
        {!selected ? (
          <div className="flex flex-1 items-center justify-center text-center text-sm text-zinc-500">
            <div>
              <User className="mx-auto h-10 w-10 text-zinc-300" />
              <p className="mt-2">Контакт або лід</p>
            </div>
          </div>
        ) : (
          <InboxClientCard
            contact={selected.contact}
            lead={selected.lead}
            assign={{
              assignedTo: selected.assignedTo,
              meId,
              assignLoading,
              onAssign: (uid) => void handleAssign(uid),
            }}
            link={{
              linkModalOpen,
              linkSearch,
              linkSearching,
              linkResults,
              linkContactLoading,
              createContactLoading,
              onOpenLink: () => setLinkModalOpen(true),
              onCloseLink: () => {
                setLinkModalOpen(false);
                setLinkSearch("");
                setLinkResults([]);
              },
              onLinkSearchChange: setLinkSearch,
              onLinkContact: (id) => void handleLinkContact(id),
              onCreateContact: () => void handleCreateContactFromLead(),
            }}
            onCreateTask={() => openTaskModal()}
            onCreateOrder={selected.contactId ? handleCreateOrder : undefined}
            mobileBack={
              mobilePanel === "card" ? () => setMobilePanel("chat") : undefined
            }
          />
        )}
      </aside>

      <TaskCreateModal
        open={taskModalOpen}
        onClose={() => setTaskModalOpen(false)}
        onCreated={() => setTaskModalOpen(false)}
        preset={taskPreset ?? undefined}
      />
      <EntityModalStackLayers
        frames={orderStack.frames}
        root={orderRoot}
        onOpen={orderStack.open}
        onCloseFrom={(index) => {
          if (index <= 0) setOrderRoot(null);
          else orderStack.closeFrom(index);
        }}
        onReplace={orderStack.replace}
        onReplaceRoot={setOrderRoot}
        onUpdate={() => undefined}
      />
    </div>
  );
}

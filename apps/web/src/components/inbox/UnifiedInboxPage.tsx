"use client";

import Link from "next/link";
import { Suspense, useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { usePathname, useSearchParams } from "next/navigation";
import {
  conversationsApi,
  contactsApi,
  metaConversationsApi,
  usersApi,
  type Contact,
  type ConversationItem,
  type MessageItem,
  type MetaConversationItem,
  type MetaMessageItem,
} from "@/lib/api";
import { apiHttp } from "@/lib/api/client";
import { ApiError, getUserFriendlyApiError } from "@/lib/api/errors";
import { authApi } from "@/lib/api/resources/auth";
import { MessageCircle, Settings, User } from "lucide-react";
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
import { useEntityModalStack, type EntityModalFrame } from "@/lib/modal/useEntityModalStack";
import { EntityModalStackLayers } from "@/components/modals/EntityModalStackLayers";
import { strings } from "@/locales";
import { useModules } from "@/lib/modules/useModules";
import { ModuleIds } from "@/lib/modules/module-ids";

const PAGE_SIZE = 50;
const LIST_PAGE_SIZE = 30;
const INBOX_POLL_MS = 5_000;
const HIDE_NOISE_KEY = "inbox.hideNoise.unified";

export type InboxSource = "TELEGRAM" | "INSTAGRAM" | "FACEBOOK";

type UnifiedConversation = {
  source: InboxSource;
  id: string;
  contactId: string | null;
  leadId: string | null;
  contact: ConversationItem["contact"] | MetaConversationItem["contact"];
  lead: ConversationItem["lead"] | MetaConversationItem["lead"];
  assignedTo: ConversationItem["assignedTo"] | MetaConversationItem["assignedTo"];
  collaborators?: Array<{ id: string; fullName: string; email?: string }>;
  status: "OPEN" | "PENDING" | "CLOSED";
  pinnedAt: string | null;
  lastReadAt: string | null;
  unreadCount: number;
  waitingForReply?: boolean;
  noteHint?: string | null;
  lastMessageAt: string | null;
  lastMessage: {
    text: string | null;
    direction: "INBOUND" | "OUTBOUND" | "INTERNAL";
  } | null;
  displayName?: string | null;
  telegramChatId?: string;
  participantId?: string | null;
};

type UnifiedMessage = {
  id: string;
  conversationId: string;
  direction: "INBOUND" | "OUTBOUND" | "INTERNAL";
  text: string | null;
  author: { id: string; fullName: string; email: string } | null;
  sentAt: string;
  status?: "PENDING" | "SENT" | "FAILED";
  mediaType?: string | null;
  fileUrl?: string | null;
};

type QueueScope = "all" | "mine" | "unassigned";

function inboxActionError(error: unknown, fallback: string): string {
  if (error instanceof ApiError && error.message.trim()) return error.message;
  return getUserFriendlyApiError(error, fallback);
}

function mergeMessages(prev: UnifiedMessage[], incoming: UnifiedMessage[]): UnifiedMessage[] {
  const byId = new Map(prev.map((m) => [m.id, m]));
  for (const message of incoming) byId.set(message.id, message);
  return [...byId.values()].sort((a, b) => {
    const delta = Date.parse(a.sentAt) - Date.parse(b.sentAt);
    if (delta !== 0) return delta;
    return a.id.localeCompare(b.id);
  });
}

function MessageAttachment({ message }: { message: UnifiedMessage }) {
  const kind = message.mediaType;
  const url = message.fileUrl;
  if (!kind || !url || kind === "sticker") return null;
  if (kind === "photo") {
    return (
      <a href={url} target="_blank" rel="noopener noreferrer" className="mb-1 block overflow-hidden rounded-md">
        {/* Proxied through CRM so the bot token never reaches the browser. */}
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={url} alt={message.text || "фото"} className="max-h-64 max-w-full object-contain" />
      </a>
    );
  }
  if (kind === "voice" || kind === "audio") {
    return <audio controls preload="none" src={url} className="mb-1 w-full max-w-xs" />;
  }
  if (kind === "video" || kind === "video_note") {
    return <video controls preload="metadata" src={url} className="mb-1 max-h-64 max-w-full rounded-md" />;
  }
  return (
    <a
      href={url}
      target="_blank"
      rel="noopener noreferrer"
      className="mb-1 inline-block text-xs underline"
    >
      {strings.inboxPage.openFile}
      {kind === "document" ? "" : ` (${kind})`}
    </a>
  );
}

function telegramInboxFileUrl(m: MessageItem): string | null {
  if (m.fileId) {
    return `/api/conversations/${m.conversationId}/messages/${m.id}/file`;
  }
  if (!m.fileUrl || m.fileUrl.includes("/file/bot")) return null;
  return m.fileUrl;
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

function conversationTitle(c: UnifiedConversation): string {
  if (c.displayName?.trim()) return c.displayName.trim();
  if (c.contact) {
    const name = [c.contact.lastName, c.contact.firstName].filter(Boolean).join(" ");
    if (name) return c.contact.phone ? `${name} · ${c.contact.phone}` : name;
    if (c.contact.phone) return c.contact.phone;
  }
  if (c.lead) {
    return (
      c.lead.fullName ||
      [c.lead.lastName, c.lead.firstName].filter(Boolean).join(" ") ||
      c.lead.phone ||
      "Лід"
    );
  }
  if (c.source === "TELEGRAM" && c.telegramChatId) return `Telegram · ${c.telegramChatId}`;
  return `Чат ${c.participantId ?? c.id}`;
}

function channelLabel(source: InboxSource): string {
  const t = strings.inboxPage;
  if (source === "TELEGRAM") return t.channelTelegram;
  if (source === "INSTAGRAM") return t.channelInstagram;
  return t.channelFacebook;
}

function unlinkedLabel(source: InboxSource): string {
  const t = strings.inboxPage;
  if (source === "TELEGRAM") return t.telegramUnlinked;
  if (source === "INSTAGRAM") return t.instagramUnlinked;
  return t.facebookUnlinked;
}

function sortConversations(items: UnifiedConversation[]): UnifiedConversation[] {
  return [...items].sort((a, b) => {
    if (a.pinnedAt && !b.pinnedAt) return -1;
    if (!a.pinnedAt && b.pinnedAt) return 1;
    const ta = a.lastMessageAt ? Date.parse(a.lastMessageAt) : 0;
    const tb = b.lastMessageAt ? Date.parse(b.lastMessageAt) : 0;
    return tb - ta;
  });
}

function fromTelegram(c: ConversationItem): UnifiedConversation {
  return {
    source: "TELEGRAM",
    id: c.id,
    contactId: c.contactId,
    leadId: c.leadId,
    contact: c.contact,
    lead: c.lead,
    assignedTo: c.assignedTo,
    collaborators: c.collaborators ?? [],
    status: c.status,
    pinnedAt: c.pinnedAt,
    lastReadAt: c.lastReadAt,
    unreadCount: c.unreadCount,
    waitingForReply: c.waitingForReply,
    noteHint: c.noteHint,
    lastMessageAt: c.lastMessageAt,
    lastMessage: c.lastMessage
      ? { text: c.lastMessage.text, direction: c.lastMessage.direction }
      : null,
    displayName: c.displayName ?? null,
    telegramChatId: c.telegramChatId,
  };
}

function fromMeta(c: MetaConversationItem): UnifiedConversation {
  return {
    source: c.channel,
    id: c.id,
    contactId: c.contactId,
    leadId: c.leadId,
    contact: c.contact,
    lead: c.lead,
    assignedTo: c.assignedTo,
    status: c.status,
    pinnedAt: c.pinnedAt,
    lastReadAt: c.lastReadAt,
    unreadCount: c.unreadCount,
    lastMessageAt: c.lastMessageAt,
    lastMessage: c.lastMessage
      ? { text: c.lastMessage.text, direction: c.lastMessage.direction }
      : null,
    displayName: c.displayName,
    participantId: c.participantId,
  };
}

function parseChannelFilter(raw: string | null): InboxSource | "ALL" {
  if (raw === "TELEGRAM" || raw === "INSTAGRAM" || raw === "FACEBOOK") return raw;
  return "ALL";
}

function readHideNoise(): boolean {
  if (typeof window === "undefined") return true;
  const v = window.localStorage.getItem(HIDE_NOISE_KEY);
  if (v == null) return true;
  return v === "1" || v === "true";
}

type MobilePanel = "list" | "chat" | "card";

function UnifiedInboxContent() {
  const t = strings.inboxPage;
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const conversationIdFromUrl = searchParams.get("conversationId");
  const statusFromUrl = searchParams.get("status");
  const channelFromUrl = parseChannelFilter(searchParams.get("channel"));

  const { status: modulesStatus, effective: moduleEffective } = useModules();
  const telegramEnabled =
    modulesStatus === "ready" && moduleEffective(ModuleIds.IntegrationsTelegram);
  const metaEnabled =
    modulesStatus === "ready" && moduleEffective(ModuleIds.IntegrationsMetaMessaging);

  const availableChannels = useMemo(() => {
    const channels: InboxSource[] = [];
    if (telegramEnabled) channels.push("TELEGRAM");
    if (metaEnabled) {
      channels.push("INSTAGRAM", "FACEBOOK");
    }
    return channels;
  }, [telegramEnabled, metaEnabled]);

  const [channelFilter, setChannelFilter] = useState<InboxSource | "ALL">(() => {
    if (channelFromUrl !== "ALL") return channelFromUrl;
    return "ALL";
  });

  const [conversations, setConversations] = useState<UnifiedConversation[]>([]);
  const [conversationsLoading, setConversationsLoading] = useState(true);
  const [conversationsError, setConversationsError] = useState<string | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(conversationIdFromUrl);
  const [selectedSource, setSelectedSource] = useState<InboxSource | null>(null);
  const [mobilePanel, setMobilePanel] = useState<MobilePanel>(
    conversationIdFromUrl ? "chat" : "list",
  );
  const [messages, setMessages] = useState<UnifiedMessage[]>([]);
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
  const [searchInput, setSearchInput] = useState("");
  const [searchQuery, setSearchQuery] = useState("");
  const [queueScope, setQueueScope] = useState<QueueScope>("all");
  const [unreadOnly, setUnreadOnly] = useState(false);
  const [waitingOnly, setWaitingOnly] = useState(false);
  const [telegramTotal, setTelegramTotal] = useState(0);
  const [loadingMore, setLoadingMore] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);
  const [hasOlderMessages, setHasOlderMessages] = useState(false);
  const [loadingOlder, setLoadingOlder] = useState(false);
  const telegramPagesRef = useRef(1);
  const messagesPageRef = useRef(1);
  const loadingOlderRef = useRef(false);
  const preserveScrollRef = useRef<{ height: number; top: number } | null>(null);
  const messagesScrollRef = useRef<HTMLDivElement>(null);
  const messagesContentRef = useRef<HTMLDivElement>(null);
  /** Stay on the latest message until the user scrolls up into history. */
  const stickToBottomRef = useRef(true);
  const openedConversationRef = useRef<string | null>(conversationIdFromUrl);
  const listScrollRef = useRef<HTMLDivElement>(null);
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
  const [meRole, setMeRole] = useState<string | null>(null);
  const [staffOptions, setStaffOptions] = useState<Array<{ id: string; fullName: string }>>([]);
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

  const selectedFromList = useMemo(() => {
    if (!selectedId) return undefined;
    return conversations.find(
      (c) => c.id === selectedId && (!selectedSource || c.source === selectedSource),
    );
  }, [conversations, selectedId, selectedSource]);

  // Keep the open thread when the channel filter hides it, so the chat column
  // does not unmount and the page does not jump.
  const [openedConversation, setOpenedConversation] = useState<UnifiedConversation | null>(null);
  useEffect(() => {
    if (!selectedId) {
      setOpenedConversation(null);
      return;
    }
    if (selectedFromList) setOpenedConversation(selectedFromList);
  }, [selectedId, selectedFromList]);

  const selected = selectedFromList ?? openedConversation ?? undefined;

  const effectiveSource: InboxSource | null =
    selected?.source ?? selectedSource ?? (channelFilter !== "ALL" ? channelFilter : null);

  useEffect(() => {
    setHideNoise(readHideNoise());
  }, []);

  useEffect(() => {
    const timer = window.setTimeout(() => setSearchQuery(searchInput.trim()), 300);
    return () => window.clearTimeout(timer);
  }, [searchInput]);

  useEffect(() => {
    const html = document.documentElement;
    const body = document.body;
    const prevHtml = html.style.overflow;
    const prevBody = body.style.overflow;
    html.style.overflow = "hidden";
    body.style.overflow = "hidden";
    return () => {
      html.style.overflow = prevHtml;
      body.style.overflow = prevBody;
    };
  }, []);

  useEffect(() => {
    authApi
      .me()
      .then((r) => {
        setMeId(r.user?.id ?? null);
        setMeRole(r.user?.role ?? null);
      })
      .catch(() => {
        setMeId(null);
        setMeRole(null);
      });
  }, []);

  useEffect(() => {
    void usersApi
      .list()
      .then((users) =>
        setStaffOptions(
          users
            .filter(
              (u) =>
                u.isActive !== false &&
                (u.role === "MANAGER" || u.role === "LEAD" || u.role === "ADMIN"),
            )
            .map((u) => ({ id: u.id, fullName: u.fullName?.trim() || u.email })),
        ),
      )
      .catch(() => setStaffOptions([]));
  }, []);

  useEffect(() => {
    if (channelFromUrl !== channelFilter) {
      setChannelFilter(channelFromUrl);
    }
  }, [channelFromUrl]); // eslint-disable-line react-hooks/exhaustive-deps -- sync URL → state only

  useEffect(() => {
    if (channelFilter === "ALL") return;
    if (availableChannels.length === 0) return;
    if (!availableChannels.includes(channelFilter)) {
      setChannelFilter("ALL");
    }
  }, [channelFilter, availableChannels]);

  const channelsToLoad = useMemo((): InboxSource[] => {
    if (channelFilter === "ALL") return availableChannels;
    if (availableChannels.includes(channelFilter)) return [channelFilter];
    return [];
  }, [channelFilter, availableChannels]);

  const telegramQueueActive = queueScope !== "all" || unreadOnly || waitingOnly;

  const loadConversations = useCallback(
    async (opts?: { silent?: boolean; append?: boolean }) => {
      if (modulesStatus !== "ready") return;
      if (channelsToLoad.length === 0) {
        setConversations([]);
        setConversationsLoading(false);
        setConversationsError(null);
        setTelegramTotal(0);
        return;
      }
      const pages = opts?.append
        ? telegramPagesRef.current + 1
        : opts?.silent
          ? telegramPagesRef.current
          : 1;
      if (!opts?.silent && !opts?.append) {
        setConversationsLoading(true);
        setConversationsError(null);
      }
      if (opts?.append) setLoadingMore(true);
      try {
        const tasks: Promise<UnifiedConversation[]>[] = [];
        if (channelsToLoad.includes("TELEGRAM")) {
          tasks.push(
            Promise.all(
              Array.from({ length: pages }, (_, index) =>
                conversationsApi.list({
                  channel: "TELEGRAM",
                  status: statusFilter || undefined,
                  hideNoise,
                  scope: queueScope,
                  q: searchQuery || undefined,
                  unread: unreadOnly || undefined,
                  waiting: waitingOnly || undefined,
                  page: index + 1,
                  pageSize: LIST_PAGE_SIZE,
                }),
              ),
            ).then((pagesRes) => {
              setTelegramTotal(pagesRes[0]?.total ?? 0);
              telegramPagesRef.current = pages;
              const seen = new Set<string>();
              const items: UnifiedConversation[] = [];
              for (const res of pagesRes) {
                for (const item of res.items.map(fromTelegram)) {
                  if (seen.has(item.id)) continue;
                  seen.add(item.id);
                  items.push(item);
                }
              }
              return items;
            }),
          );
        } else {
          setTelegramTotal(0);
        }
        const loadMeta = !(telegramQueueActive && channelsToLoad.includes("TELEGRAM"));
        if (loadMeta && channelsToLoad.includes("INSTAGRAM")) {
          tasks.push(
            metaConversationsApi
              .list({
                channel: "INSTAGRAM",
                status: statusFilter || undefined,
                hideNoise,
                page: 1,
                pageSize: LIST_PAGE_SIZE,
              })
              .then((res) => res.items.map(fromMeta)),
          );
        }
        if (loadMeta && channelsToLoad.includes("FACEBOOK")) {
          tasks.push(
            metaConversationsApi
              .list({
                channel: "FACEBOOK",
                status: statusFilter || undefined,
                hideNoise,
                page: 1,
                pageSize: LIST_PAGE_SIZE,
              })
              .then((res) => res.items.map(fromMeta)),
          );
        }
        const settled = await Promise.allSettled(tasks);
        const merged: UnifiedConversation[] = [];
        const errors: string[] = [];
        for (const result of settled) {
          if (result.status === "fulfilled") merged.push(...result.value);
          else {
            errors.push(
              result.reason instanceof Error
                ? result.reason.message
                : "Не вдалося завантажити діалоги",
            );
          }
        }
        const q = searchQuery.toLowerCase();
        const visible = q
          ? merged.filter((c) => {
              if (c.source === "TELEGRAM") return true;
              const hay = [conversationTitle(c), c.contact?.phone, c.lead?.phone]
                .filter(Boolean)
                .join(" ")
                .toLowerCase();
              return hay.includes(q) || hay.includes(q.replace(/^@/, ""));
            })
          : merged;
        if (
          opts?.append &&
          errors.length > 0 &&
          !merged.some((c) => c.source === "TELEGRAM")
        ) {
          setActionError(errors[0] ?? t.loadMore);
          return;
        }
        setConversations(sortConversations(visible));
        if (merged.length === 0 && errors.length === settled.length && errors[0]) {
          setConversationsError(errors[0]);
        } else {
          setConversationsError(null);
        }
      } catch (e) {
        if (!opts?.silent) {
          setConversations([]);
          setConversationsError(e instanceof Error ? e.message : "Не вдалося завантажити діалоги");
        }
      } finally {
        if (!opts?.silent) setConversationsLoading(false);
        if (opts?.append) setLoadingMore(false);
      }
    },
    [channelsToLoad, statusFilter, hideNoise, modulesStatus, queueScope, unreadOnly, waitingOnly, searchQuery, telegramQueueActive, t.loadMore],
  );

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    if (statusFilter && statusFilter !== "OPEN") params.set("status", statusFilter);
    else params.delete("status");
    if (channelFilter !== "ALL") params.set("channel", channelFilter);
    else params.delete("channel");
    if (selectedId) params.set("conversationId", selectedId);
    else params.delete("conversationId");
    const next = params.toString();
    const current = window.location.search.replace(/^\?/, "");
    if (next !== current) {
      const url = `${pathname}${next ? `?${next}` : ""}`;
      window.history.replaceState(window.history.state, "", url);
    }
  }, [statusFilter, channelFilter, selectedId, pathname]);

  const messagesRequestRef = useRef(0);

  const clearLostAccess = useCallback(() => {
    setSelectedId(null);
    setSelectedSource(null);
    setOpenedConversation(null);
    setMessages([]);
    setSuggestions([]);
    setMobilePanel("list");
  }, []);

  const mapTelegramMessages = (items: MessageItem[]): UnifiedMessage[] =>
    items.map((m) => ({
      id: m.id,
      conversationId: m.conversationId,
      direction: m.direction,
      text: m.text,
      author: m.author,
      sentAt: m.sentAt,
      status: m.status,
      mediaType: m.mediaType,
      fileUrl: telegramInboxFileUrl(m),
    }));

  const mapMetaMessages = (items: MetaMessageItem[]): UnifiedMessage[] =>
    items.map((m) => ({
      id: m.id,
      conversationId: m.conversationId,
      direction: m.direction,
      text: m.text,
      author: m.author,
      sentAt: m.sentAt,
      mediaType: m.mediaType,
      fileUrl: m.fileUrl,
    }));

  const loadMessages = useCallback(
    async (convId: string, source: InboxSource, opts?: { silent?: boolean; older?: boolean }) => {
      const requestId = opts?.older ? messagesRequestRef.current : ++messagesRequestRef.current;
      const page = opts?.older ? messagesPageRef.current + 1 : 1;
      if (!opts?.silent && !opts?.older) {
        setMessagesLoading(true);
        setMessages([]);
        setHasOlderMessages(false);
        messagesPageRef.current = 1;
      }
      if (opts?.older) {
        if (loadingOlderRef.current) return;
        loadingOlderRef.current = true;
        setLoadingOlder(true);
      }
      try {
        const res =
          source === "TELEGRAM"
            ? await conversationsApi.getMessages(convId, { page, pageSize: PAGE_SIZE })
            : await metaConversationsApi.getMessages(convId, { page, pageSize: PAGE_SIZE });
        if (requestId !== messagesRequestRef.current) return;
        const mapped =
          source === "TELEGRAM"
            ? mapTelegramMessages(res.items as MessageItem[])
            : mapMetaMessages(res.items as MetaMessageItem[]);
        const olderRemains = page * PAGE_SIZE < res.total;
        if (!opts?.silent) setHasOlderMessages(olderRemains);
        if (opts?.older) {
          messagesPageRef.current = page;
          const el = messagesScrollRef.current;
          if (el) preserveScrollRef.current = { height: el.scrollHeight, top: el.scrollTop };
          setMessages((prev) => mergeMessages(prev, mapped));
        } else if (opts?.silent) {
          setMessages((prev) => mergeMessages(prev, mapped));
        } else {
          messagesPageRef.current = 1;
          setMessages(mapped);
        }
      } catch (e) {
        if (requestId !== messagesRequestRef.current) return;
        // Opening a thread the manager can no longer access (transferred away).
        if (!opts?.older && e instanceof ApiError && (e.code === "FORBIDDEN" || e.status === 403)) {
          clearLostAccess();
          return;
        }
        if (!opts?.silent && !opts?.older) setMessages([]);
        if (opts?.older) {
          setActionError(inboxActionError(e, strings.inboxPage.loadOlder));
        }
      } finally {
        if (requestId === messagesRequestRef.current && !opts?.silent && !opts?.older) {
          setMessagesLoading(false);
        }
        if (opts?.older) {
          loadingOlderRef.current = false;
          setLoadingOlder(false);
        }
      }
    },
    [clearLostAccess],
  );

  useEffect(() => {
    void loadConversations();
  }, [loadConversations]);

  const selectedIdRef = useRef(selectedId);
  const selectedSourceRef = useRef(effectiveSource);
  useEffect(() => {
    selectedIdRef.current = selectedId;
  }, [selectedId]);
  useEffect(() => {
    selectedSourceRef.current = effectiveSource;
  }, [effectiveSource]);

  useEffect(() => {
    const tick = () => {
      if (document.visibilityState !== "visible") return;
      void loadConversations({ silent: true });
      const activeId = selectedIdRef.current;
      const activeSource = selectedSourceRef.current;
      if (activeId && activeSource) void loadMessages(activeId, activeSource, { silent: true });
    };
    const id = window.setInterval(tick, INBOX_POLL_MS);
    return () => window.clearInterval(id);
  }, [loadConversations, loadMessages]);

  useEffect(() => {
    if (!conversationIdFromUrl || conversationIdFromUrl === selectedId) return;
    stickToBottomRef.current = true;
    setSelectedId(conversationIdFromUrl);
    if (channelFromUrl !== "ALL") setSelectedSource(channelFromUrl);
    setMobilePanel("chat");
    // selectedId is read once per URL change so a click is not overwritten by the previous query.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [conversationIdFromUrl, channelFromUrl]);

  useEffect(() => {
    if (!selectedId || selectedSource) return;
    const found = conversations.find((c) => c.id === selectedId);
    if (found) setSelectedSource(found.source);
  }, [conversations, selectedId, selectedSource]);

  const selectConversation = (c: UnifiedConversation) => {
    setActionError(null);
    stickToBottomRef.current = true;
    setSelectedId(c.id);
    setSelectedSource(c.source);
    setMobilePanel("chat");
    const mark =
      c.source === "TELEGRAM"
        ? conversationsApi.markRead(c.id)
        : metaConversationsApi.markRead(c.id);
    void mark.then(() => {
      setConversations((prev) =>
        prev.map((row) =>
          row.id === c.id && row.source === c.source
            ? { ...row, unreadCount: 0, lastReadAt: new Date().toISOString() }
            : row,
        ),
      );
    });
  };

  const backToList = () => {
    setMobilePanel("list");
    setSelectedId(null);
    setSelectedSource(null);
  };

  useEffect(() => {
    if (selectedId && effectiveSource) {
      void loadMessages(selectedId, effectiveSource);
      setSuggestions([]);
      const mark =
        effectiveSource === "TELEGRAM"
          ? conversationsApi.markRead(selectedId)
          : metaConversationsApi.markRead(selectedId);
      void mark.then(() => {
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
  }, [selectedId, effectiveSource, loadMessages]);

  useEffect(() => {
    listScrollRef.current?.scrollTo({ top: 0 });
  }, [channelFilter]);

  const pinMessagesToBottom = useCallback(() => {
    const el = messagesScrollRef.current;
    if (!el || !stickToBottomRef.current) return;
    el.scrollTop = el.scrollHeight;
  }, []);

  useLayoutEffect(() => {
    const el = messagesScrollRef.current;
    if (!el) return;
    if (openedConversationRef.current !== selectedId) {
      openedConversationRef.current = selectedId;
      stickToBottomRef.current = true;
      preserveScrollRef.current = null;
    }
    const preserved = preserveScrollRef.current;
    if (preserved) {
      preserveScrollRef.current = null;
      const delta = el.scrollHeight - preserved.height;
      el.scrollTop = preserved.top + Math.max(0, delta);
      return;
    }
    if (messagesLoading) return;
    if (selectedId && messages.some((m) => m.conversationId !== selectedId)) return;
    pinMessagesToBottom();
    const frame = requestAnimationFrame(() => pinMessagesToBottom());
    return () => cancelAnimationFrame(frame);
  }, [messages, messagesLoading, selectedId, pinMessagesToBottom]);

  useEffect(() => {
    const content = messagesContentRef.current;
    const scroller = messagesScrollRef.current;
    if (!content || !scroller) return;
    const observer = new ResizeObserver(() => {
      if (!stickToBottomRef.current || preserveScrollRef.current) return;
      scroller.scrollTop = scroller.scrollHeight;
    });
    observer.observe(content);
    observer.observe(scroller);
    return () => observer.disconnect();
  }, [selectedId, messagesLoading, messages.length]);

  useEffect(() => {
    if (!selectedId || effectiveSource !== "TELEGRAM") return;
    if (typeof document !== "undefined" && document.visibilityState !== "visible") return;
    const timer = window.setTimeout(() => {
      void conversationsApi.markRead(selectedId).then(() => {
        setConversations((prev) =>
          prev.map((c) =>
            c.id === selectedId && c.source === "TELEGRAM" ? { ...c, unreadCount: 0 } : c,
          ),
        );
      });
    }, 700);
    return () => window.clearTimeout(timer);
  }, [selectedId, effectiveSource, messages]);

  const handleSend = useCallback(async () => {
    const text = sendText.trim();
    if (!text || !selectedId || !effectiveSource || sending) return;

    const draft = text;
    setActionError(null);
    stickToBottomRef.current = true;
    setSendText("");
    const optimistic: UnifiedMessage = {
      id: `opt-${Date.now()}`,
      conversationId: selectedId,
      direction: "OUTBOUND",
      text,
      author: null,
      sentAt: new Date().toISOString(),
    };
    setMessages((prev) => [...prev, optimistic]);
    setSending(true);

    try {
      const created =
        effectiveSource === "TELEGRAM"
          ? await conversationsApi.sendMessage(selectedId, text)
          : await metaConversationsApi.sendMessage(selectedId, text);
      setMessages((prev) => {
        const withoutOpt = prev.filter((m) => m.id !== optimistic.id);
        if (withoutOpt.some((m) => m.id === created.id)) return withoutOpt;
        return [
          ...withoutOpt,
          {
            id: created.id,
            conversationId: created.conversationId,
            direction: created.direction,
            text: created.text,
            author: created.author,
            sentAt: created.sentAt,
            status: "status" in created ? created.status : undefined,
          },
        ];
      });
      void loadConversations({ silent: true });
      // Refresh from server so the bubble survives the next poll (newest window).
      if (effectiveSource) {
        void loadMessages(selectedId, effectiveSource, { silent: true });
      }
    } catch (e) {
      setMessages((prev) => prev.filter((m) => m.id !== optimistic.id));
      setSendText((current) => (current.trim() ? current : draft));
      setActionError(inboxActionError(e, t.sendFailed));
    } finally {
      setSending(false);
    }
  }, [
    selectedId,
    effectiveSource,
    sendText,
    sending,
    loadConversations,
    loadMessages,
    t.sendFailed,
  ]);

  const handleSendNote = useCallback(async () => {
    const text = sendText.trim();
    if (!text || !selectedId || !effectiveSource || sending) return;
    const draft = text;
    setActionError(null);
    stickToBottomRef.current = true;
    setSendText("");
    setSending(true);
    try {
      const created =
        effectiveSource === "TELEGRAM"
          ? await conversationsApi.addNote(selectedId, text)
          : await metaConversationsApi.addNote(selectedId, text);
      setMessages((prev) => [
        ...prev,
        {
          id: created.id,
          conversationId: created.conversationId,
          direction: created.direction,
          text: created.text,
          author: created.author,
          sentAt: created.sentAt,
        },
      ]);
      void loadConversations({ silent: true });
    } catch (e) {
      setSendText((current) => (current.trim() ? current : draft));
      setActionError(inboxActionError(e, t.noteFailed));
    } finally {
      setSending(false);
    }
  }, [selectedId, effectiveSource, sendText, sending, loadConversations, t.noteFailed]);

  const handleStatusChange = useCallback(
    async (convId: string, source: InboxSource, status: "OPEN" | "PENDING" | "CLOSED") => {
      setActionError(null);
      try {
        if (source === "TELEGRAM") await conversationsApi.updateStatus(convId, status);
        else await metaConversationsApi.updateStatus(convId, status);
        setConversations((prev) => {
          if (status !== statusFilter) {
            return prev.filter((c) => !(c.id === convId && c.source === source));
          }
          return prev.map((c) => (c.id === convId && c.source === source ? { ...c, status } : c));
        });
      } catch (e) {
        setActionError(inboxActionError(e, t.statusFailed));
      }
    },
    [statusFilter, t.statusFailed],
  );

  const handleTogglePin = useCallback(
    async (convId: string, source: InboxSource, currentlyPinned: boolean) => {
      setActionError(null);
      try {
        const res =
          source === "TELEGRAM"
            ? await conversationsApi.setPinned(convId, !currentlyPinned)
            : await metaConversationsApi.setPinned(convId, !currentlyPinned);
        setConversations((prev) =>
          sortConversations(
            prev.map((c) =>
              c.id === convId && c.source === source ? { ...c, pinnedAt: res.pinnedAt } : c,
            ),
          ),
        );
      } catch (e) {
        setActionError(inboxActionError(e, t.pinFailed));
      }
    },
    [t.pinFailed],
  );

  const handleAssign = useCallback(
    async (userId: string | null) => {
      if (!selectedId || effectiveSource !== "TELEGRAM" || assignLoading) return;
      setActionError(null);
      setAssignLoading(true);
      try {
        const updated = await conversationsApi.assign(selectedId, userId);
        const collaborators = updated.collaborators ?? [];
        setConversations((prev) =>
          sortConversations(
            prev.map((c) =>
              c.id === selectedId && c.source === "TELEGRAM"
                ? {
                    ...c,
                    assignedTo: updated.assignedTo,
                    collaborators,
                  }
                : c,
            ),
          ),
        );
        const stillHasAccess =
          meRole !== "MANAGER" ||
          !updated.assignedTo?.id ||
          updated.assignedTo.id === meId ||
          collaborators.some((c) => c.id === meId);
        if (!stillHasAccess) {
          clearLostAccess();
        }
        void loadConversations({ silent: true });
      } catch (e) {
        setActionError(inboxActionError(e, t.assignFailed));
      } finally {
        setAssignLoading(false);
      }
    },
    [selectedId, effectiveSource, assignLoading, loadConversations, meId, meRole, clearLostAccess, t.assignFailed],
  );

  const handleAddCollaborator = useCallback(
    async (userId: string) => {
      if (!selectedId || effectiveSource !== "TELEGRAM" || assignLoading) return;
      setAssignLoading(true);
      try {
        const res = await conversationsApi.addCollaborator(selectedId, userId);
        setConversations((prev) =>
          prev.map((c) =>
            c.id === selectedId && c.source === "TELEGRAM"
              ? { ...c, collaborators: res.collaborators }
              : c,
          ),
        );
      } catch (e) {
        setActionError(inboxActionError(e, t.assignFailed));
      } finally {
        setAssignLoading(false);
      }
    },
    [selectedId, effectiveSource, assignLoading, t.assignFailed],
  );

  const handleRemoveCollaborator = useCallback(
    async (userId: string) => {
      if (!selectedId || effectiveSource !== "TELEGRAM" || assignLoading) return;
      setAssignLoading(true);
      try {
        const res = await conversationsApi.removeCollaborator(selectedId, userId);
        setConversations((prev) =>
          prev.map((c) =>
            c.id === selectedId && c.source === "TELEGRAM"
              ? { ...c, collaborators: res.collaborators }
              : c,
          ),
        );
        // Left the joint thread: drop sticky open state if no longer assignee.
        if (
          meRole === "MANAGER" &&
          userId === meId &&
          selected?.assignedTo?.id !== meId
        ) {
          clearLostAccess();
        }
      } catch (e) {
        setActionError(inboxActionError(e, t.assignFailed));
      } finally {
        setAssignLoading(false);
      }
    },
    [selectedId, effectiveSource, assignLoading, meId, meRole, selected?.assignedTo?.id, clearLostAccess, t.assignFailed],
  );

  const handleSuggestReplies = useCallback(async () => {
    if (!selectedId || effectiveSource !== "TELEGRAM" || suggestLoading) return;
    setSuggestLoading(true);
    try {
      const res = await conversationsApi.suggestReplies(selectedId);
      setSuggestions(res.suggestions ?? []);
    } catch {
      setSuggestions([]);
    } finally {
      setSuggestLoading(false);
    }
  }, [selectedId, effectiveSource, suggestLoading]);

  const handleLinkContact = useCallback(
    async (contactId: string) => {
      if (!selectedId || !effectiveSource || linkContactLoading) return;
      setLinkContactLoading(true);
      try {
        if (effectiveSource === "TELEGRAM") {
          const linked = await conversationsApi.linkContact(selectedId, contactId);
          setConversations((prev) =>
            prev.map((c) =>
              c.id === selectedId && c.source === "TELEGRAM"
                ? {
                    ...c,
                    contactId: linked.contactId,
                    leadId: linked.leadId ?? null,
                    lead: linked.leadId ? c.lead : null,
                    assignedTo: linked.assignedTo ?? c.assignedTo,
                  }
                : c,
            ),
          );
        } else {
          await metaConversationsApi.linkContact(selectedId, contactId);
        }
        setLinkModalOpen(false);
        setLinkSearch("");
        setLinkResults([]);
        void loadConversations({ silent: true });
      } finally {
        setLinkContactLoading(false);
      }
    },
    [selectedId, effectiveSource, linkContactLoading, loadConversations],
  );

  const handleCreateContactFromLead = useCallback(async () => {
    if (!selectedId || !effectiveSource || createContactLoading) return;
    setCreateContactLoading(true);
    try {
      if (effectiveSource === "TELEGRAM") {
        await conversationsApi.createContactFromLead(selectedId);
      } else {
        await metaConversationsApi.createContactFromLead(selectedId);
      }
      void loadConversations();
    } finally {
      setCreateContactLoading(false);
    }
  }, [selectedId, effectiveSource, createContactLoading, loadConversations]);

  const openTaskModal = useCallback(
    (opts?: { initialBody?: string }) => {
      if (!selected) return;
      setTaskPreset({
        contactId: selected.contactId,
        leadId: selected.contactId ? null : selected.leadId,
        linkLabel: conversationTitle(selected),
        initialBody: opts?.initialBody,
        initialTitle: opts?.initialBody ? `Чат: ${conversationTitle(selected)}` : undefined,
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

  const channelChips: { id: InboxSource | "ALL"; label: string }[] = useMemo(() => {
    const chips: { id: InboxSource | "ALL"; label: string }[] = [
      { id: "ALL", label: t.channelAll },
    ];
    if (availableChannels.includes("TELEGRAM")) {
      chips.push({ id: "TELEGRAM", label: t.channelTelegram });
    }
    if (availableChannels.includes("INSTAGRAM")) {
      chips.push({ id: "INSTAGRAM", label: t.channelInstagram });
    }
    if (availableChannels.includes("FACEBOOK")) {
      chips.push({ id: "FACEBOOK", label: t.channelFacebook });
    }
    return chips;
  }, [availableChannels, t]);

  const channelListStale =
    conversationsLoading &&
    channelFilter !== "ALL" &&
    conversations.some((c) => c.source !== channelFilter);

  return (
    <div className="flex h-[calc(100dvh-3.5rem-2rem)] min-h-0 flex-col gap-3 overflow-hidden">
      {(telegramEnabled || metaEnabled) && (
        <div className="flex shrink-0 flex-wrap justify-end gap-3">
          {telegramEnabled ? (
            <Link
              href="/settings/telegram"
              className="inline-flex items-center gap-1.5 text-sm text-zinc-600 hover:text-zinc-900"
            >
              <Settings className="h-4 w-4" aria-hidden />
              {t.telegramSettingsLink}
            </Link>
          ) : null}
          {metaEnabled ? (
            <Link
              href="/settings/meta-messaging"
              className="inline-flex items-center gap-1.5 text-sm text-zinc-600 hover:text-zinc-900"
            >
              <Settings className="h-4 w-4" aria-hidden />
              {t.metaSettingsLink}
            </Link>
          ) : null}
        </div>
      )}

      <div className="flex min-h-0 flex-1 max-w-full min-w-0 gap-0 overflow-hidden rounded-xl border border-zinc-200 bg-white shadow-sm">
        <aside
          className={`flex w-full min-h-0 flex-shrink-0 flex-col border-r border-zinc-200 bg-zinc-50/50 md:w-80 ${
            mobilePanel === "list" ? "flex" : "hidden md:flex"
          }`}
        >
          <div className="shrink-0 border-b border-zinc-200 p-3">
            <h2 className="flex items-center gap-2 text-lg font-semibold text-zinc-900">
              <MessageCircle className="h-5 w-5" />
              {t.title}
            </h2>
            {channelChips.length > 2 ? (
              <div className="mt-2 flex flex-wrap gap-1">
                {channelChips.map((chip) => (
                  <button
                    key={chip.id}
                    type="button"
                    onMouseDown={(e) => e.preventDefault()}
                    onClick={() => {
                      setChannelFilter(chip.id);
                    }}
                    className={`rounded px-2 py-1 text-xs font-medium ${
                      channelFilter === chip.id
                        ? "bg-accent-gradient text-white"
                        : "bg-zinc-200/80 text-zinc-600 hover:bg-zinc-200"
                    }`}
                  >
                    {chip.label}
                  </button>
                ))}
              </div>
            ) : null}
            <div className="mt-2 space-y-2">
              <input
                type="search"
                value={searchInput}
                onChange={(e) => setSearchInput(e.target.value)}
                placeholder={t.searchPlaceholder}
                className="w-full rounded-lg border border-zinc-200 bg-white px-2.5 py-1.5 text-sm outline-none focus:border-zinc-400"
              />
              <div className="flex flex-wrap gap-1">
                {(
                  [
                    ["all", t.scopeAll],
                    ["mine", t.scopeMine],
                    ["unassigned", t.scopeUnassigned],
                  ] as const
                ).map(([id, label]) => (
                  <button
                    key={id}
                    type="button"
                    onClick={() => setQueueScope(id)}
                    className={`rounded px-2 py-1 text-xs font-medium ${
                      queueScope === id
                        ? "bg-accent-gradient text-white"
                        : "bg-zinc-200/80 text-zinc-600 hover:bg-zinc-200"
                    }`}
                  >
                    {label}
                  </button>
                ))}
              </div>
              <div className="flex flex-wrap gap-3 text-xs text-zinc-600">
                <label className="flex cursor-pointer items-center gap-1.5">
                  <input
                    type="checkbox"
                    checked={unreadOnly}
                    onChange={(e) => setUnreadOnly(e.target.checked)}
                    className="rounded border-zinc-300"
                  />
                  {t.unreadOnly}
                </label>
                <label className="flex cursor-pointer items-center gap-1.5">
                  <input
                    type="checkbox"
                    checked={waitingOnly}
                    onChange={(e) => setWaitingOnly(e.target.checked)}
                    className="rounded border-zinc-300"
                  />
                  {t.waitingOnly}
                </label>
              </div>
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
          <div ref={listScrollRef} className="min-h-0 flex-1 overflow-y-auto overscroll-contain">
            {modulesStatus === "loading" ||
            (conversationsLoading && (conversations.length === 0 || channelListStale)) ? (
              <div className="flex min-h-full items-center justify-center p-4 text-center text-sm text-zinc-500">
                {strings.common.loading}
              </div>
            ) : conversationsError ? (
              <div className="p-3">
                <ErrorPanel message={conversationsError} onRetry={() => void loadConversations()} />
              </div>
            ) : conversations.length === 0 ? (
              <div className="p-4 text-center text-sm text-zinc-500">{t.empty}</div>
            ) : (
              <ul
                className={`divide-y divide-zinc-100 ${conversationsLoading ? "opacity-60" : ""}`}
              >
                {conversations.map((c) => (
                  <InboxConversationRow
                    key={`${c.source}:${c.id}`}
                    item={{
                      id: c.id,
                      title: conversationTitle(c),
                      status: c.status,
                      pinnedAt: c.pinnedAt,
                      unreadCount: selectedId === c.id ? 0 : (c.unreadCount ?? 0),
                      lastMessageAt: c.lastMessageAt,
                      lastMessageText: c.lastMessage?.text ?? null,
                      lastMessageDirection: c.lastMessage?.direction ?? null,
                      waitingForReply: c.waitingForReply,
                      noteHint: c.noteHint,
                      channelLabel: channelLabel(c.source),
                    }}
                    selected={
                      selectedId === c.id && (!selectedSource || selectedSource === c.source)
                    }
                    timeLabel={c.lastMessageAt ? formatTime(c.lastMessageAt) : ""}
                    onSelect={() => selectConversation(c)}
                    onTogglePin={() => void handleTogglePin(c.id, c.source, !!c.pinnedAt)}
                  />
                ))}
              </ul>
            )}
            {channelsToLoad.includes("TELEGRAM") &&
            conversations.filter((c) => c.source === "TELEGRAM").length < telegramTotal ? (
              <div className="border-t border-zinc-100 p-2">
                <button
                  type="button"
                  disabled={loadingMore}
                  onClick={() => void loadConversations({ silent: true, append: true })}
                  className="w-full rounded-lg border border-zinc-200 bg-white px-3 py-2 text-xs font-medium text-zinc-700 hover:bg-zinc-50 disabled:opacity-50"
                >
                  {loadingMore ? strings.common.loading : t.loadMore}
                </button>
              </div>
            ) : null}
          </div>
        </aside>

        <section
          className={`min-h-0 min-w-0 flex-1 flex-col bg-white ${
            mobilePanel === "chat" ? "flex" : "hidden md:flex"
          }`}
        >
          {!selectedId ? (
            <div className="hidden flex-1 items-center justify-center text-zinc-500 md:flex">
              <div className="text-center">
                <MessageCircle className="mx-auto h-12 w-12 text-zinc-300" />
                <p className="mt-2">{t.pickConversation}</p>
              </div>
            </div>
          ) : (
            <>
              <div className="shrink-0 border-b border-zinc-200 px-4 py-2">
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
                  {selected ? (
                    <span className="shrink-0 rounded bg-sky-100 px-1.5 py-0.5 text-[10px] font-medium text-sky-800">
                      {channelLabel(selected.source)}
                    </span>
                  ) : null}
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
                    onChange={(s) => void handleStatusChange(selected.id, selected.source, s)}
                  />
                ) : null}
                {actionError ? (
                  <p className="mt-2 text-xs text-red-600" role="alert">
                    {actionError}
                  </p>
                ) : null}
              </div>

              <div
                ref={messagesScrollRef}
                onScroll={() => {
                  const el = messagesScrollRef.current;
                  if (!el) return;
                  const overflows = el.scrollHeight > el.clientHeight + 48;
                  const distanceFromBottom = el.scrollHeight - el.scrollTop - el.clientHeight;
                  if (overflows) stickToBottomRef.current = distanceFromBottom < 160;
                  if (
                    !overflows ||
                    loadingOlder ||
                    !hasOlderMessages ||
                    !selectedId ||
                    !effectiveSource ||
                    stickToBottomRef.current
                  ) {
                    return;
                  }
                  if (el.scrollTop < 48) {
                    void loadMessages(selectedId, effectiveSource, { older: true });
                  }
                }}
                className="relative min-h-0 flex-1 overflow-y-auto overscroll-contain p-4 [overflow-anchor:none]"
              >
                {messagesLoading ? (
                  <div className="absolute inset-0 z-10 flex items-center justify-center bg-white text-sm text-zinc-500">
                    {strings.common.loading}
                  </div>
                ) : null}
                {hasOlderMessages ? (
                  <div className="mb-3 text-center">
                    <button
                      type="button"
                      disabled={loadingOlder || !selectedId || !effectiveSource}
                      onClick={() => {
                        if (selectedId && effectiveSource) {
                          void loadMessages(selectedId, effectiveSource, { older: true });
                        }
                      }}
                      className="rounded border border-zinc-200 px-2 py-1 text-xs text-zinc-600 hover:bg-zinc-50 disabled:opacity-50"
                    >
                      {loadingOlder ? strings.common.loading : t.loadOlder}
                    </button>
                  </div>
                ) : null}
                {messages.length > 0 ? (
                  <div ref={messagesContentRef} className="space-y-3">
                    {messages.map((m) => {
                      if (m.direction === "INTERNAL") {
                        return (
                          <div key={m.id} className="flex justify-center">
                            <div className="max-w-[85%] rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-950">
                              <p className="text-[10px] font-medium text-amber-700">
                                Тільки для команди
                                {m.author ? ` · ${m.author.fullName}` : ""}
                              </p>
                              <p className="mt-0.5 whitespace-pre-wrap break-words">{m.text}</p>
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
                            <MessageAttachment message={m} />
                            <p className="whitespace-pre-wrap break-words">
                              {m.text || (m.mediaType ? `(${m.mediaType})` : "(вкладення)")}
                            </p>
                            <p
                              className={`mt-1 text-[10px] ${
                                m.direction === "OUTBOUND" ? "text-white/80" : "text-zinc-500"
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
                  </div>
                ) : null}
                <InboxSelectionToolbar
                  onCreateTaskFromSelection={(text) => openTaskModal({ initialBody: text })}
                />
              </div>

              <div className="shrink-0">
                <InboxComposer
                  value={sendText}
                  onChange={setSendText}
                  onSend={() => void handleSend()}
                  onSendNote={() => void handleSendNote()}
                  sending={sending}
                  placeholderContext={placeholderContext}
                  showAiSuggest={effectiveSource === "TELEGRAM"}
                  onSuggestReplies={
                    effectiveSource === "TELEGRAM" ? handleSuggestReplies : undefined
                  }
                  suggestLoading={suggestLoading}
                  suggestions={suggestions}
                />
              </div>
            </>
          )}
        </section>

        <aside
          className={`flex w-full min-h-0 flex-shrink-0 flex-col overflow-y-auto overscroll-contain border-l border-zinc-200 bg-zinc-50/50 p-4 md:w-72 ${
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
              conversationId={selected.source === "TELEGRAM" ? selected.id : null}
              telegramChatId={selected.telegramChatId}
              onTelegramLinksChanged={() => void loadConversations()}
              assign={
                selected.source === "TELEGRAM"
                  ? {
                      assignedTo: selected.assignedTo,
                      collaborators: selected.collaborators,
                      staffOptions,
                      meId,
                      meRole,
                      assignLoading,
                      onAssign: (uid) => void handleAssign(uid),
                      onAddCollaborator: (uid) => void handleAddCollaborator(uid),
                      onRemoveCollaborator: (uid) => void handleRemoveCollaborator(uid),
                    }
                  : null
              }
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
              unlinkedLabel={unlinkedLabel(selected.source)}
              mobileBack={mobilePanel === "card" ? () => setMobilePanel("chat") : undefined}
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
    </div>
  );
}

export function UnifiedInboxPage() {
  return (
    <Suspense fallback={<PageLoading />}>
      <UnifiedInboxContent />
    </Suspense>
  );
}

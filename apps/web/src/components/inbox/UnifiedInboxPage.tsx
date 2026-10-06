"use client";

import Link from "next/link";
import { Suspense, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import {
  conversationsApi,
  contactsApi,
  metaConversationsApi,
  type Contact,
  type ConversationItem,
  type MessageItem,
  type MetaConversationItem,
  type MetaMessageItem,
} from "@/lib/api";
import { apiHttp } from "@/lib/api/client";
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
import {
  useEntityModalStack,
  type EntityModalFrame,
} from "@/lib/modal/useEntityModalStack";
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
  status: "OPEN" | "PENDING" | "CLOSED";
  pinnedAt: string | null;
  lastReadAt: string | null;
  unreadCount: number;
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
};

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
  if (c.source === "TELEGRAM" && c.telegramChatId) return `Чат ${c.telegramChatId}`;
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
    status: c.status,
    pinnedAt: c.pinnedAt,
    lastReadAt: c.lastReadAt,
    unreadCount: c.unreadCount,
    lastMessageAt: c.lastMessageAt,
    lastMessage: c.lastMessage
      ? { text: c.lastMessage.text, direction: c.lastMessage.direction }
      : null,
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
  const router = useRouter();
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

  const selected = useMemo(() => {
    if (!selectedId) return undefined;
    const found = conversations.find((c) => c.id === selectedId);
    if (found) return found;
    if (selectedSource) {
      return conversations.find((c) => c.id === selectedId && c.source === selectedSource);
    }
    return undefined;
  }, [conversations, selectedId, selectedSource]);

  const effectiveSource: InboxSource | null =
    selected?.source ?? selectedSource ?? (channelFilter !== "ALL" ? channelFilter : null);

  useEffect(() => {
    setHideNoise(readHideNoise());
  }, []);

  useEffect(() => {
    authApi
      .me()
      .then((r) => setMeId(r.user?.id ?? null))
      .catch(() => setMeId(null));
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

  const loadConversations = useCallback(
    async (opts?: { silent?: boolean }) => {
      if (modulesStatus !== "ready") return;
      if (channelsToLoad.length === 0) {
        setConversations([]);
        setConversationsLoading(false);
        setConversationsError(null);
        return;
      }
      if (!opts?.silent) {
        setConversationsLoading(true);
        setConversationsError(null);
      }
      try {
        const tasks: Promise<UnifiedConversation[]>[] = [];
        if (channelsToLoad.includes("TELEGRAM")) {
          tasks.push(
            conversationsApi
              .list({
                channel: "TELEGRAM",
                status: statusFilter || undefined,
                hideNoise,
                page: 1,
                pageSize: LIST_PAGE_SIZE,
              })
              .then((res) => res.items.map(fromTelegram)),
          );
        }
        if (channelsToLoad.includes("INSTAGRAM")) {
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
        if (channelsToLoad.includes("FACEBOOK")) {
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
        setConversations(sortConversations(merged));
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
      }
    },
    [channelsToLoad, statusFilter, hideNoise, modulesStatus],
  );

  useEffect(() => {
    const params = new URLSearchParams(searchParams.toString());
    if (statusFilter && statusFilter !== "OPEN") params.set("status", statusFilter);
    else params.delete("status");
    if (channelFilter !== "ALL") params.set("channel", channelFilter);
    else params.delete("channel");
    if (selectedId) params.set("conversationId", selectedId);
    else params.delete("conversationId");
    const next = params.toString();
    const current = searchParams.toString();
    if (next !== current) {
      router.replace(`${pathname}${next ? `?${next}` : ""}`, { scroll: false });
    }
  }, [statusFilter, channelFilter, selectedId, pathname, router, searchParams]);

  const loadMessages = useCallback(
    async (convId: string, source: InboxSource, opts?: { silent?: boolean }) => {
      if (!opts?.silent) setMessagesLoading(true);
      try {
        if (source === "TELEGRAM") {
          const res = await conversationsApi.getMessages(convId, {
            page: 1,
            pageSize: PAGE_SIZE,
          });
          setMessages(
            res.items.map((m: MessageItem) => ({
              id: m.id,
              conversationId: m.conversationId,
              direction: m.direction,
              text: m.text,
              author: m.author,
              sentAt: m.sentAt,
              status: m.status,
            })),
          );
        } else {
          const res = await metaConversationsApi.getMessages(convId, {
            page: 1,
            pageSize: PAGE_SIZE,
          });
          setMessages(
            res.items.map((m: MetaMessageItem) => ({
              id: m.id,
              conversationId: m.conversationId,
              direction: m.direction,
              text: m.text,
              author: m.author,
              sentAt: m.sentAt,
            })),
          );
        }
      } catch {
        if (!opts?.silent) setMessages([]);
      } finally {
        if (!opts?.silent) setMessagesLoading(false);
      }
    },
    [],
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
    if (conversationIdFromUrl && conversationIdFromUrl !== selectedId) {
      setSelectedId(conversationIdFromUrl);
      if (channelFromUrl !== "ALL") setSelectedSource(channelFromUrl);
      setMobilePanel("chat");
    }
  }, [conversationIdFromUrl, selectedId, channelFromUrl]);

  useEffect(() => {
    if (!selectedId || selectedSource) return;
    const found = conversations.find((c) => c.id === selectedId);
    if (found) setSelectedSource(found.source);
  }, [conversations, selectedId, selectedSource]);

  const selectConversation = (c: UnifiedConversation) => {
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
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  const handleSend = useCallback(async () => {
    const text = sendText.trim();
    if (!text || !selectedId || !effectiveSource || sending) return;

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
      setMessages((prev) =>
        prev.map((m) =>
          m.id === optimistic.id
            ? {
                id: created.id,
                conversationId: created.conversationId,
                direction: created.direction,
                text: created.text,
                author: created.author,
                sentAt: created.sentAt,
                status: "status" in created ? created.status : undefined,
              }
            : m,
        ),
      );
      void loadConversations();
    } catch {
      setMessages((prev) => prev.filter((m) => m.id !== optimistic.id));
    } finally {
      setSending(false);
    }
  }, [selectedId, effectiveSource, sendText, sending, loadConversations]);

  const handleSendNote = useCallback(async () => {
    const text = sendText.trim();
    if (!text || !selectedId || !effectiveSource || sending) return;
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
      void loadConversations();
    } finally {
      setSending(false);
    }
  }, [selectedId, effectiveSource, sendText, sending, loadConversations]);

  const handleStatusChange = useCallback(
    async (convId: string, source: InboxSource, status: "OPEN" | "PENDING" | "CLOSED") => {
      try {
        if (source === "TELEGRAM") await conversationsApi.updateStatus(convId, status);
        else await metaConversationsApi.updateStatus(convId, status);
        setConversations((prev) => {
          if (status !== statusFilter) {
            return prev.filter((c) => !(c.id === convId && c.source === source));
          }
          return prev.map((c) =>
            c.id === convId && c.source === source ? { ...c, status } : c,
          );
        });
      } catch {
        // keep UI
      }
    },
    [statusFilter],
  );

  const handleTogglePin = useCallback(
    async (convId: string, source: InboxSource, currentlyPinned: boolean) => {
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
      } catch {
        // ignore
      }
    },
    [],
  );

  const handleAssign = useCallback(
    async (userId: string | null) => {
      if (!selectedId || effectiveSource !== "TELEGRAM" || assignLoading) return;
      setAssignLoading(true);
      try {
        await conversationsApi.assign(selectedId, userId);
        void loadConversations();
      } finally {
        setAssignLoading(false);
      }
    },
    [selectedId, effectiveSource, assignLoading, loadConversations],
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
          await conversationsApi.linkContact(selectedId, contactId);
        } else {
          await metaConversationsApi.linkContact(selectedId, contactId);
        }
        setLinkModalOpen(false);
        setLinkSearch("");
        setLinkResults([]);
        void loadConversations();
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

  return (
    <div className="space-y-3">
      {(telegramEnabled || metaEnabled) && (
        <div className="flex flex-wrap justify-end gap-3">
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

      <div className="flex h-[calc(100dvh-5rem)] max-w-full min-w-0 gap-0 overflow-hidden rounded-xl border border-zinc-200 bg-white shadow-sm">
        <aside
          className={`flex w-full flex-shrink-0 flex-col border-r border-zinc-200 bg-zinc-50/50 md:w-80 ${
            mobilePanel === "list" ? "flex" : "hidden md:flex"
          }`}
        >
          <div className="border-b border-zinc-200 p-3">
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
                    onClick={() => {
                      setChannelFilter(chip.id);
                      if (chip.id !== "ALL") setSelectedSource(chip.id);
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
            {conversationsLoading || modulesStatus === "loading" ? (
              <div className="p-4 text-center text-sm text-zinc-500">{strings.common.loading}</div>
            ) : conversationsError ? (
              <div className="p-3">
                <ErrorPanel
                  message={conversationsError}
                  onRetry={() => void loadConversations()}
                />
              </div>
            ) : conversations.length === 0 ? (
              <div className="p-4 text-center text-sm text-zinc-500">{t.empty}</div>
            ) : (
              <ul className="divide-y divide-zinc-100">
                {conversations.map((c) => (
                  <InboxConversationRow
                    key={`${c.source}:${c.id}`}
                    item={{
                      id: c.id,
                      title: conversationTitle(c),
                      status: c.status,
                      pinnedAt: c.pinnedAt,
                      unreadCount: selectedId === c.id ? 0 : c.unreadCount ?? 0,
                      lastMessageAt: c.lastMessageAt,
                      lastMessageText: c.lastMessage?.text ?? null,
                      lastMessageDirection: c.lastMessage?.direction ?? null,
                      channelLabel: channelLabel(c.source),
                    }}
                    selected={selectedId === c.id && (!selectedSource || selectedSource === c.source)}
                    timeLabel={c.lastMessageAt ? formatTime(c.lastMessageAt) : ""}
                    onSelect={() => selectConversation(c)}
                    onTogglePin={() => void handleTogglePin(c.id, c.source, !!c.pinnedAt)}
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
                <p className="mt-2">{t.pickConversation}</p>
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
              </div>

              <div className="relative flex-1 overflow-y-auto p-4">
                {messagesLoading ? (
                  <div className="flex justify-center py-8 text-zinc-500">
                    {strings.common.loading}
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
                            <p className="whitespace-pre-wrap break-words">
                              {m.text || "(вкладення)"}
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
                showAiSuggest={effectiveSource === "TELEGRAM"}
                onSuggestReplies={
                  effectiveSource === "TELEGRAM" ? handleSuggestReplies : undefined
                }
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
              assign={
                selected.source === "TELEGRAM"
                  ? {
                      assignedTo: selected.assignedTo,
                      meId,
                      assignLoading,
                      onAssign: (uid) => void handleAssign(uid),
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

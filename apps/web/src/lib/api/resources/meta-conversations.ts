import { apiHttp } from "../client";

export type MetaConversationContactBrief = {
  id: string;
  firstName: string;
  lastName: string;
  phone: string;
};

export type MetaConversationLeadBrief = {
  id: string;
  firstName: string | null;
  lastName: string | null;
  fullName: string | null;
  phone: string | null;
};

export type MetaConversationLastMessage = {
  id: string;
  text: string | null;
  sentAt: string;
  direction: "INBOUND" | "OUTBOUND";
};

export type MetaConversationItem = {
  id: string;
  channel: "INSTAGRAM" | "FACEBOOK";
  metaParticipantId: string | null;
  participantId: string | null;
  displayName: string | null;
  contactId: string | null;
  leadId: string | null;
  contact: MetaConversationContactBrief | null;
  lead: MetaConversationLeadBrief | null;
  assignedTo: { id: string; fullName: string; email: string } | null;
  status: "OPEN" | "PENDING" | "CLOSED";
  lastMessageAt: string | null;
  lastMessage: MetaConversationLastMessage | null;
  createdAt: string;
  updatedAt: string;
};

export type MetaConversationsListResponse = {
  items: MetaConversationItem[];
  total: number;
  page: number;
  pageSize: number;
};

export type MetaMessageItem = {
  id: string;
  conversationId: string;
  direction: "INBOUND" | "OUTBOUND";
  text: string | null;
  externalMessageId: string | null;
  authorUserId: string | null;
  author: { id: string; fullName: string; email: string } | null;
  sentAt: string;
  createdAt: string;
  mediaType: string | null;
  fileId: string | null;
  fileUrl: string | null;
};

export type MetaMessagesListResponse = {
  items: MetaMessageItem[];
  total: number;
  page: number;
  pageSize: number;
};

export type MetaInboxChannel = "INSTAGRAM" | "FACEBOOK";

export type ListMetaConversationsParams = {
  channel: MetaInboxChannel;
  page?: number;
  pageSize?: number;
  status?: string;
  assignedTo?: string;
};

export const metaConversationsApi = {
  list: async (params: ListMetaConversationsParams): Promise<MetaConversationsListResponse> => {
    const searchParams = new URLSearchParams();
    searchParams.set("channel", params.channel);
    if (params.page != null) searchParams.set("page", String(params.page));
    if (params.pageSize != null) searchParams.set("pageSize", String(params.pageSize));
    if (params.status) searchParams.set("status", params.status);
    if (params.assignedTo) searchParams.set("assignedTo", params.assignedTo);
    const res = await apiHttp.get<MetaConversationsListResponse>(
      `/meta-conversations?${searchParams.toString()}`,
    );
    return res.data;
  },

  getMessages: async (
    conversationId: string,
    params?: { page?: number; pageSize?: number },
  ): Promise<MetaMessagesListResponse> => {
    const searchParams = new URLSearchParams();
    if (params?.page != null) searchParams.set("page", String(params.page));
    if (params?.pageSize != null) searchParams.set("pageSize", String(params.pageSize));
    const qs = searchParams.toString();
    const res = await apiHttp.get<MetaMessagesListResponse>(
      `/meta-conversations/${conversationId}/messages${qs ? `?${qs}` : ""}`,
    );
    return res.data;
  },

  sendMessage: async (conversationId: string, text: string): Promise<MetaMessageItem> => {
    const res = await apiHttp.post<MetaMessageItem>(
      `/meta-conversations/${conversationId}/messages`,
      { text },
    );
    return res.data;
  },

  updateStatus: async (
    conversationId: string,
    status: "OPEN" | "PENDING" | "CLOSED",
  ): Promise<MetaConversationItem> => {
    const res = await apiHttp.patch<MetaConversationItem>(
      `/meta-conversations/${conversationId}`,
      { status },
    );
    return res.data;
  },

  linkContact: async (
    conversationId: string,
    contactId: string,
  ): Promise<{ ok: boolean; contactId: string }> => {
    const res = await apiHttp.post<{ ok: boolean; contactId: string }>(
      `/meta-conversations/${conversationId}/link-contact`,
      { contactId },
    );
    return res.data;
  },

  createContactFromLead: async (
    conversationId: string,
  ): Promise<{ contact: { id: string } }> => {
    const res = await apiHttp.post<{ contact: { id: string } }>(
      `/meta-conversations/${conversationId}/create-contact`,
    );
    return res.data;
  },

  unreadCount: async (channel: MetaInboxChannel): Promise<{ count: number }> => {
    const res = await apiHttp.get<{ count: number }>(
      `/meta-conversations/unread-count?channel=${encodeURIComponent(channel)}`,
    );
    return res.data;
  },
};

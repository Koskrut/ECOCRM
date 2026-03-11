import { apiHttp } from "../client";

export type ConversationContactBrief = {
  id: string;
  firstName: string;
  lastName: string;
  phone: string;
};

export type ConversationLeadBrief = {
  id: string;
  firstName: string | null;
  lastName: string | null;
  fullName: string | null;
  phone: string | null;
};

export type ConversationLastMessage = {
  id: string;
  text: string | null;
  sentAt: string;
  direction: "INBOUND" | "OUTBOUND";
};

export type ConversationItem = {
  id: string;
  channel: string;
  telegramChatId: string;
  contactId: string | null;
  leadId: string | null;
  contact: ConversationContactBrief | null;
  lead: ConversationLeadBrief | null;
  assignedTo: { id: string; fullName: string; email: string } | null;
  status: "OPEN" | "PENDING" | "CLOSED";
  lastMessageAt: string | null;
  lastMessage: ConversationLastMessage | null;
  createdAt: string;
  updatedAt: string;
};

export type ConversationsListResponse = {
  items: ConversationItem[];
  total: number;
  page: number;
  pageSize: number;
};

export type MessageItem = {
  id: string;
  conversationId: string;
  direction: "INBOUND" | "OUTBOUND";
  text: string | null;
  tgMessageId: string | null;
  authorUserId: string | null;
  author: { id: string; fullName: string; email: string } | null;
  sentAt: string;
  createdAt: string;
  mediaType: string | null;
  fileId: string | null;
  fileUrl: string | null;
};

export type MessagesListResponse = {
  items: MessageItem[];
  total: number;
  page: number;
  pageSize: number;
};

export type ListConversationsParams = {
  page?: number;
  pageSize?: number;
  channel?: string;
  status?: string;
  assignedTo?: string;
};

export type ListMessagesParams = {
  page?: number;
  pageSize?: number;
};

export const conversationsApi = {
  list: async (params?: ListConversationsParams): Promise<ConversationsListResponse> => {
    const searchParams = new URLSearchParams();
    if (params?.page != null) searchParams.set("page", String(params.page));
    if (params?.pageSize != null) searchParams.set("pageSize", String(params.pageSize));
    if (params?.channel) searchParams.set("channel", params.channel);
    if (params?.status) searchParams.set("status", params.status);
    if (params?.assignedTo) searchParams.set("assignedTo", params.assignedTo);
    const qs = searchParams.toString();
    const res = await apiHttp.get<ConversationsListResponse>(
      `/conversations${qs ? `?${qs}` : ""}`,
    );
    return res.data;
  },

  getMessages: async (
    conversationId: string,
    params?: ListMessagesParams,
  ): Promise<MessagesListResponse> => {
    const searchParams = new URLSearchParams();
    if (params?.page != null) searchParams.set("page", String(params.page));
    if (params?.pageSize != null) searchParams.set("pageSize", String(params.pageSize));
    const qs = searchParams.toString();
    const res = await apiHttp.get<MessagesListResponse>(
      `/conversations/${conversationId}/messages${qs ? `?${qs}` : ""}`,
    );
    return res.data;
  },

  sendMessage: async (
    conversationId: string,
    text: string,
  ): Promise<MessageItem> => {
    const res = await apiHttp.post<MessageItem>(
      `/conversations/${conversationId}/messages`,
      { text },
    );
    return res.data;
  },

  updateStatus: async (
    conversationId: string,
    status: "OPEN" | "PENDING" | "CLOSED",
  ): Promise<ConversationItem> => {
    const res = await apiHttp.patch<ConversationItem>(
      `/conversations/${conversationId}`,
      { status },
    );
    return res.data;
  },

  linkContact: async (
    conversationId: string,
    contactId: string,
  ): Promise<{ ok: boolean; contactId: string }> => {
    const res = await apiHttp.post<{ ok: boolean; contactId: string }>(
      `/conversations/${conversationId}/link-contact`,
      { contactId },
    );
    return res.data;
  },

  createContactFromLead: async (
    conversationId: string,
  ): Promise<{ contact: { id: string } }> => {
    const res = await apiHttp.post<{ contact: { id: string } }>(
      `/conversations/${conversationId}/create-contact`,
    );
    return res.data;
  },

  suggestReplies: async (
    conversationId: string,
  ): Promise<{ suggestions: string[] }> => {
    const res = await apiHttp.get<{ suggestions: string[] }>(
      `/conversations/${conversationId}/suggest-replies`,
    );
    return res.data;
  },
};

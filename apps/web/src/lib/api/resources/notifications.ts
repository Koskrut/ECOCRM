import { apiHttp } from "../client";

export type NotificationType =
  | "ORDER_QTY_CHANGED"
  | "ORDER_SPLIT"
  | "ORDER_STAGE_CHANGED"
  | "MISSED_CALL"
  | "NEW_LEAD"
  | "TASK_ASSIGNED"
  | "TELEGRAM_MESSAGE"
  | "META_INSTAGRAM_MESSAGE"
  | "META_FACEBOOK_MESSAGE"
  | "FIELD_SHIFT_CLOSE_REMINDER"
  | "FIELD_GPS_STALE";

export type UserNotification = {
  id: string;
  userId: string;
  type: NotificationType;
  title: string;
  body: string | null;
  entityType: string | null;
  entityId: string | null;
  meta: Record<string, unknown> | null;
  readAt: string | null;
  createdAt: string;
};

export type ListNotificationsResponse = {
  items: UserNotification[];
  total: number;
  page: number;
  pageSize: number;
};

export type NotificationPreferencesResponse = {
  teamNotificationsEnabled: boolean;
  types: Array<{
    userId: string;
    type: NotificationType;
    inApp: boolean;
    browser: boolean;
    telegram: boolean;
    mobile: boolean;
  }>;
};

export const notificationsApi = {
  list: async (query?: {
    page?: number;
    pageSize?: number;
    unreadOnly?: boolean;
  }): Promise<ListNotificationsResponse> => {
    const params: Record<string, string | number | undefined> = {};
    if (query?.page != null) params.page = query.page;
    if (query?.pageSize != null) params.pageSize = query.pageSize;
    if (query?.unreadOnly) params.unreadOnly = "true";
    const res = await apiHttp.get<ListNotificationsResponse>("/notifications", { params } as never);
    return res.data;
  },

  unreadCount: async (): Promise<number> => {
    const res = await apiHttp.get<{ count: number }>("/notifications/unread-count");
    return res.data.count;
  },

  markRead: async (id: string): Promise<UserNotification> => {
    const res = await apiHttp.patch<UserNotification>(`/notifications/${id}/read`);
    return res.data;
  },

  markAllRead: async (): Promise<{ updated: number }> => {
    const res = await apiHttp.post<{ updated: number }>("/notifications/read-all");
    return res.data;
  },

  getPreferences: async (): Promise<NotificationPreferencesResponse> => {
    const res = await apiHttp.get<NotificationPreferencesResponse>("/notifications/preferences");
    return res.data;
  },

  updatePreferences: async (body: {
    teamNotificationsEnabled?: boolean;
    types?: Array<{
      type: NotificationType;
      inApp?: boolean;
      browser?: boolean;
      telegram?: boolean;
      mobile?: boolean;
    }>;
  }): Promise<NotificationPreferencesResponse> => {
    const res = await apiHttp.patch<NotificationPreferencesResponse>("/notifications/preferences", body);
    return res.data;
  },
};

export function notificationHref(n: UserNotification): string | null {
  if (!n.entityType || !n.entityId) return null;
  switch (n.entityType) {
    case "ORDER":
      return `/orders?orderId=${encodeURIComponent(n.entityId)}`;
    case "LEAD":
      return `/leads?leadId=${encodeURIComponent(n.entityId)}`;
    case "TASK":
      return `/tasks?taskId=${encodeURIComponent(n.entityId)}`;
    case "CONTACT":
      return `/contacts?contactId=${encodeURIComponent(n.entityId)}`;
    case "CONVERSATION":
      return `/inbox/telegram?conversationId=${encodeURIComponent(n.entityId)}`;
    case "FIELD_SHIFT":
      return "/visits";
    default:
      return null;
  }
}

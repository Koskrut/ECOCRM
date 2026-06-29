import { apiHttp } from "../client";

export type ClientPlatform = "WEB" | "MOBILE";

export type PresenceOverviewItem = {
  userId: string;
  fullName: string;
  email: string;
  role: string;
  isOnline: boolean;
  platforms: ClientPlatform[];
  activeSecondsToday: number;
  lastSeenAt: string | null;
  lastPlatform: ClientPlatform | null;
  location: string | null;
};

export type PresenceOverviewResponse = {
  date: string;
  onlineCount: number;
  totalUsers: number;
  items: PresenceOverviewItem[];
};

export type PresenceSession = {
  id: string;
  platform: ClientPlatform;
  startedAt: string;
  lastSeenAt: string;
  activeSeconds: number;
  ip: string | null;
  userAgent: string | null;
  location: string | null;
  lat: number | null;
  lng: number | null;
};

export type PresenceUserSessionsResponse = {
  user: {
    id: string;
    fullName: string;
    email: string;
    role: string;
  };
  from: string;
  to: string;
  sessions: PresenceSession[];
};

export const presenceApi = {
  heartbeat: async (): Promise<{ sessionId: string; activeSeconds: number }> => {
    const res = await apiHttp.post<{ sessionId: string; activeSeconds: number }>(
      "/presence/heartbeat",
      { platform: "WEB" },
    );
    return res.data;
  },

  end: async (): Promise<{ ended: number }> => {
    const res = await apiHttp.post<{ ended: number }>("/presence/end", { platform: "WEB" });
    return res.data;
  },

  getOverview: async (date?: string): Promise<PresenceOverviewResponse> => {
    const res = await apiHttp.get<PresenceOverviewResponse>("/presence/overview", {
      params: date ? { date } : undefined,
    } as never);
    return res.data;
  },

  getUserSessions: async (
    userId: string,
    from?: string,
    to?: string,
  ): Promise<PresenceUserSessionsResponse> => {
    const res = await apiHttp.get<PresenceUserSessionsResponse>(
      `/presence/users/${userId}/sessions`,
      {
        params: {
          ...(from ? { from } : {}),
          ...(to ? { to } : {}),
        },
      } as never,
    );
    return res.data;
  },
};

import { apiHttp } from "../client";

export type VisitContactSnippet = {
  firstName: string;
  lastName: string;
  middleName?: string | null;
};

export type Visit = {
  id: string;
  companyId?: string | null;
  contactId?: string | null;
  ownerId: string;
  contact?: VisitContactSnippet | null;
  title?: string | null;
  phone?: string | null;
  addressText?: string | null;
  lat?: number | null;
  lng?: number | null;
  locationSource: string;
  radiusM: number;
  status: "PLANNED_UNASSIGNED" | "SCHEDULED" | "IN_PROGRESS" | "DONE" | "CANCELED";
  startsAt?: string | null;
  endsAt?: string | null;
  durationMin: number;
  note?: string | null;
  createdAt: string;
  updatedAt: string;
  startedAt?: string | null;
  completedAt?: string | null;
  outcome?: "SUCCESS" | "FOLLOW_UP" | "NO_DECISION" | "NOT_RELEVANT" | "FAILED" | null;
  resultNote?: string | null;
  nextActionAt?: string | null;
  nextActionNote?: string | null;
  purpose?: string | null;
};

export type VisitBacklogResponse = Visit[];

export type VisitDayResponse = {
  items: Visit[];
};

export type RoutePlanStop = {
  id: string;
  position: number;
  visitId: string;
  visit: Visit;
};

export type RoutePlan = {
  id: string;
  ownerId: string;
  date: string;
  createdAt: string;
  updatedAt: string;
  stops: RoutePlanStop[];
};

export type RoutePlanResponse = {
  plan: RoutePlan | null;
};

export type RouteSession = {
  id: string;
  ownerId: string;
  date: string;
  routePlanId?: string | null;
  isActive: boolean;
  currentVisitId?: string | null;
  startedAt: string;
  endedAt?: string | null;
  createdAt: string;
  updatedAt: string;
};

export type RouteSessionState = {
  session: RouteSession;
  currentVisit: Visit | null;
  routePlan: RoutePlan | null;
};

export type NavigationUrlResponse = {
  url: string;
};

export type RouteMetricsResponse = {
  distanceKm: number | null;
  durationMin: number | null;
  source: "google" | "fallback" | "none";
};

export type RouteOptimizeResponse = {
  visitIds: string[];
  source: "google" | "fallback";
};

export type VisitHistoryItem = Visit & {
  owner?: { id: string; fullName: string; email: string };
  contact?: {
    id: string;
    firstName: string;
    lastName: string;
    phone: string;
  } | null;
};

export type VisitHistoryResponse = {
  items: VisitHistoryItem[];
  total: number;
  page: number;
  pageSize: number;
};

export const visitsApi = {
  create: async (body: {
    contactId?: string;
    companyId?: string;
    title?: string;
    phone?: string;
    addressText?: string;
    lat?: number;
    lng?: number;
    purpose?: string;
  }): Promise<Visit> => {
    const res = await apiHttp.post<Visit>("/visits", body);
    return res.data;
  },

  history: async (params: {
    from?: string;
    to?: string;
    ownerId?: string;
    page?: number;
    pageSize?: number;
  }): Promise<VisitHistoryResponse> => {
    const res = await apiHttp.get<VisitHistoryResponse>("/visits/history", { params } as never);
    return res.data;
  },

  backlog: async (): Promise<VisitBacklogResponse> => {
    const res = await apiHttp.get<VisitBacklogResponse>("/visits/backlog");
    return res.data;
  },

  day: async (date: string): Promise<VisitDayResponse> => {
    const res = await apiHttp.get<VisitDayResponse>("/visits/day", {
      params: { date },
    } as never);
    return res.data;
  },

  update: async (
    id: string,
    body: Partial<{
      title: string | null;
      phone: string | null;
      addressText: string | null;
      lat: number | null;
      lng: number | null;
      locationSource: string;
      status: Visit["status"];
      startsAt: string;
      endsAt: string;
      durationMin: number;
      note: string | null;
      purpose: string | null;
    }>,
  ): Promise<Visit> => {
    const res = await apiHttp.patch<Visit>(`/visits/${id}`, body);
    return res.data;
  },

  start: async (id: string): Promise<Visit> => {
    const res = await apiHttp.post<Visit>(`/visits/${id}/start`);
    return res.data;
  },

  complete: async (
    id: string,
    body: { outcome: string; resultNote: string; nextActionAt?: string; nextActionNote?: string },
  ): Promise<Visit> => {
    const res = await apiHttp.post<Visit>(`/visits/${id}/complete`, body);
    return res.data;
  },
};

export const routePlansApi = {
  getForDay: async (date: string): Promise<RoutePlanResponse> => {
    const res = await apiHttp.get<RoutePlanResponse>("/route-plans", { params: { date } } as never);
    return res.data;
  },

  metrics: async (date: string, opts?: { traffic?: boolean }): Promise<RouteMetricsResponse> => {
    const res = await apiHttp.get<RouteMetricsResponse>("/route-plans/metrics", {
      params: { date, ...(opts?.traffic ? { traffic: "1" } : {}) },
    } as never);
    return res.data;
  },

  metricsPreview: async (
    date: string,
    visitIds: string[],
    opts?: { traffic?: boolean },
  ): Promise<RouteMetricsResponse> => {
    const res = await apiHttp.post<RouteMetricsResponse>(
      "/route-plans/metrics/preview",
      { visitIds },
      { params: { date, ...(opts?.traffic ? { traffic: "1" } : {}) } } as never,
    );
    return res.data;
  },

  optimize: async (
    date: string,
    visitIds: string[],
    opts?: { traffic?: boolean },
  ): Promise<RouteOptimizeResponse> => {
    const res = await apiHttp.post<RouteOptimizeResponse>(
      "/route-plans/optimize",
      { visitIds },
      { params: { date, ...(opts?.traffic ? { traffic: "1" } : {}) } } as never,
    );
    return res.data;
  },

  factMetrics: async (date: string, opts?: { traffic?: boolean }): Promise<RouteMetricsResponse> => {
    const res = await apiHttp.get<RouteMetricsResponse>("/route-plans/metrics/fact", {
      params: { date, ...(opts?.traffic ? { traffic: "1" } : {}) },
    } as never);
    return res.data;
  },

  saveForDay: async (date: string, visitIds: string[]): Promise<RoutePlanResponse> => {
    const res = await apiHttp.put<RoutePlanResponse>("/route-plans", { visitIds }, {
      params: { date },
    } as never);
    return res.data;
  },

  navigation: async (
    date: string,
    mode: "single" | "multi",
    visitId?: string,
  ): Promise<NavigationUrlResponse> => {
    const params: Record<string, string> = { date, mode };
    if (visitId) params.visitId = visitId;
    const res = await apiHttp.get<NavigationUrlResponse>("/route-plans/navigation", {
      params,
    } as never);
    return res.data;
  },
};

export const routeSessionsApi = {
  get: async (date: string): Promise<RouteSessionState | null> => {
    const res = await apiHttp.get<{ session: RouteSession | null; currentVisit: Visit | null; routePlan: RoutePlan | null }>(
      "/route-sessions",
      { params: { date } } as never,
    );
    const data = res.data;
    if (!data.session) return null;
    return { session: data.session, currentVisit: data.currentVisit, routePlan: data.routePlan };
  },

  start: async (date: string): Promise<RouteSessionState> => {
    const res = await apiHttp.post<RouteSessionState>("/route-sessions/start", undefined, {
      params: { date },
    } as never);
    return res.data;
  },

  stop: async (date: string): Promise<RouteSessionState | null> => {
    const res = await apiHttp.post<{ session: RouteSession | null; currentVisit: Visit | null; routePlan: RoutePlan | null }>(
      "/route-sessions/stop",
      undefined,
      { params: { date } } as never,
    );
    const data = res.data;
    if (!data.session) return null;
    return { session: data.session, currentVisit: data.currentVisit, routePlan: data.routePlan };
  },

  next: async (date: string): Promise<RouteSessionState> => {
    const res = await apiHttp.post<RouteSessionState>("/route-sessions/next", undefined, {
      params: { date },
    } as never);
    return res.data;
  },

  setCurrent: async (date: string, visitId: string): Promise<RouteSessionState> => {
    const res = await apiHttp.post<RouteSessionState>(
      "/route-sessions/current",
      { visitId },
      { params: { date } } as never,
    );
    return res.data;
  },
};


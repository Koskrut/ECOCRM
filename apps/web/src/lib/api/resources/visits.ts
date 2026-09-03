import { apiHttp } from "../client";

export type VisitContactSnippet = {
  firstName: string;
  lastName: string;
  middleName?: string | null;
};

export type VisitOwnerSnippet = {
  id: string;
  fullName: string;
  email: string;
};

export type Visit = {
  id: string;
  companyId?: string | null;
  contactId?: string | null;
  contactAddressId?: string | null;
  companyAddressId?: string | null;
  ownerId: string;
  owner?: VisitOwnerSnippet;
  contact?: VisitContactSnippet | null;
  company?: { id: string; name: string } | null;
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
  confirmedAt?: string | null;
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
  source: "osrm" | "fallback" | "none";
};

export type RouteOptimizeResponse = {
  visitIds: string[];
  source: "fallback";
};

export type RouteGeometryPoint = { lat: number; lng: number };

export type RouteGeometryKind = "planned" | "fact_visits" | "fact_gps" | "fact_visits_gps";

export type RouteGeometrySource = "osrm" | "fallback" | "raw_gps" | "none";

export type RouteGeometryLayer = {
  kind: RouteGeometryKind;
  source: RouteGeometrySource;
  distanceKm: number | null;
  durationMin: number | null;
  path: RouteGeometryPoint[];
  encodedPolyline?: string | null;
  waypoints?: Array<{ lat: number; lng: number; label?: string | null; visitId?: string | null }>;
  quality?: {
    sampleCount?: number;
    coverageRatio?: number | null;
    degraded?: boolean;
    degradedReason?: string | null;
    lastSampleAt?: string | null;
    lastDoneVisitCompletedAt?: string | null;
    maxStitchGapKm?: number | null;
    hasUnfilledGaps?: boolean;
    pathDistanceMismatch?: boolean;
    displayPathPolylineKm?: number | null;
  };
};

export type RouteGeometryResult = RouteGeometryLayer & {
  encodedPolyline: string | null;
  waypoints: Array<{ lat: number; lng: number; label?: string | null; visitId?: string | null }>;
  quality: {
    sampleCount: number;
    coverageRatio: number | null;
    degraded: boolean;
    degradedReason: string | null;
    lastSampleAt?: string | null;
    lastDoneVisitCompletedAt?: string | null;
    maxStitchGapKm?: number | null;
    hasUnfilledGaps?: boolean;
    pathDistanceMismatch?: boolean;
    displayPathPolylineKm?: number | null;
  };
};

export type RouteGeometryBundle = {
  date: string;
  ownerId: string;
  compensationFactKind: "planned" | "fact_gps" | "fact_visits" | "none";
  compensationIneligibleReason?: string | null;
  compensationWarnings?: string[];
  shiftActive?: boolean;
  incompleteTour?: boolean;
  planIncludesScheduled?: boolean;
  plannedOrderInefficient?: boolean;
  planned: RouteGeometryLayer;
  factVisits: RouteGeometryLayer;
  factGps: RouteGeometryLayer;
  factVisitsGps?: RouteGeometryLayer;
};

export type VisitHistoryItem = Visit & {
  owner?: { id: string; fullName: string; email: string };
  contact?: {
    id: string;
    firstName: string;
    lastName: string;
    phone: string;
  } | null;
  company?: {
    id: string;
    name: string;
    phone?: string | null;
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
    contactAddressId?: string;
    companyAddressId?: string;
    title?: string;
    phone?: string;
    addressText?: string;
    lat?: number;
    lng?: number;
    locationSource?: string;
    purpose?: string;
  }): Promise<Visit> => {
    const res = await apiHttp.post<Visit>("/visits", body);
    return res.data;
  },

  get: async (id: string): Promise<Visit> => {
    const res = await apiHttp.get<Visit>(`/visits/${id}`);
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

  day: async (date: string, opts?: { ownerId?: string }): Promise<VisitDayResponse> => {
    const res = await apiHttp.get<VisitDayResponse>("/visits/day", {
      params: { date, ...(opts?.ownerId ? { ownerId: opts.ownerId } : {}) },
    } as never);
    return res.data;
  },

  backlog: async (): Promise<VisitBacklogResponse> => {
    const res = await apiHttp.get<VisitBacklogResponse>("/visits/backlog");
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
      contactAddressId?: string | null;
      companyAddressId?: string | null;
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

  logAdHoc: async (body: {
    phone: string;
    firstName: string;
    lastName: string;
    outcome: string;
    resultNote: string;
  }): Promise<Visit> => {
    const res = await apiHttp.post<Visit>("/visits/log-ad-hoc", body);
    return res.data;
  },
};

type RouteOwnerOpts = { ownerId?: string; traffic?: boolean };

function routePlanParams(date: string, opts?: RouteOwnerOpts): Record<string, string> {
  const p: Record<string, string> = { date };
  if (opts?.ownerId) p.ownerId = opts.ownerId;
  if (opts?.traffic) p.traffic = "1";
  return p;
}

export const routePlansApi = {
  getForDay: async (date: string, opts?: { ownerId?: string }): Promise<RoutePlanResponse> => {
    const res = await apiHttp.get<RoutePlanResponse>("/route-plans", {
      params: routePlanParams(date, opts),
    } as never);
    return res.data;
  },

  metrics: async (date: string, opts?: RouteOwnerOpts): Promise<RouteMetricsResponse> => {
    const res = await apiHttp.get<RouteMetricsResponse>("/route-plans/metrics", {
      params: routePlanParams(date, opts),
    } as never);
    return res.data;
  },

  metricsPreview: async (
    date: string,
    visitIds: string[],
    opts?: RouteOwnerOpts,
  ): Promise<RouteMetricsResponse> => {
    const res = await apiHttp.post<RouteMetricsResponse>(
      "/route-plans/metrics/preview",
      { visitIds },
      { params: routePlanParams(date, opts) } as never,
    );
    return res.data;
  },

  optimize: async (
    date: string,
    visitIds: string[],
    opts?: RouteOwnerOpts,
  ): Promise<RouteOptimizeResponse> => {
    const res = await apiHttp.post<RouteOptimizeResponse>(
      "/route-plans/optimize",
      { visitIds },
      { params: routePlanParams(date, opts) } as never,
    );
    return res.data;
  },

  factMetrics: async (date: string, opts?: RouteOwnerOpts): Promise<RouteMetricsResponse> => {
    const res = await apiHttp.get<RouteMetricsResponse>("/route-plans/metrics/fact", {
      params: routePlanParams(date, opts),
    } as never);
    return res.data;
  },

  saveForDay: async (
    date: string,
    visitIds: string[],
    opts?: { ownerId?: string },
  ): Promise<RoutePlanResponse> => {
    const res = await apiHttp.put<RoutePlanResponse>(
      "/route-plans",
      { visitIds },
      { params: routePlanParams(date, opts) } as never,
    );
    return res.data;
  },

  confirmForDay: async (
    date: string,
    opts?: { ownerId?: string },
  ): Promise<RoutePlanResponse> => {
    const res = await apiHttp.post<RoutePlanResponse>(
      "/route-plans/confirm",
      undefined,
      { params: routePlanParams(date, opts) } as never,
    );
    return res.data;
  },

  navigation: async (
    date: string,
    mode: "single" | "multi",
    visitId?: string,
    opts?: { ownerId?: string },
  ): Promise<NavigationUrlResponse> => {
    const params = routePlanParams(date, opts);
    params.mode = mode;
    if (visitId) params.visitId = visitId;
    const res = await apiHttp.get<NavigationUrlResponse>("/route-plans/navigation", {
      params,
    } as never);
    return res.data;
  },

  geometry: async (
    date: string,
    kind: RouteGeometryKind,
    opts?: RouteOwnerOpts,
  ): Promise<RouteGeometryResult> => {
    const res = await apiHttp.get<RouteGeometryResult>("/route-plans/geometry", {
      params: { ...routePlanParams(date, opts), kind },
    } as never);
    return res.data;
  },

  geometryBundle: async (
    date: string,
    opts?: RouteOwnerOpts,
  ): Promise<RouteGeometryBundle> => {
    const res = await apiHttp.get<RouteGeometryBundle>("/route-plans/geometry/bundle", {
      params: routePlanParams(date, opts),
    } as never);
    return res.data;
  },

  geometryPreview: async (
    date: string,
    visitIds: string[],
    opts?: RouteOwnerOpts,
  ): Promise<RouteGeometryResult> => {
    const res = await apiHttp.post<RouteGeometryResult>(
      "/route-plans/geometry/preview",
      { visitIds },
      { params: routePlanParams(date, opts) } as never,
    );
    return res.data;
  },
};

export const routeSessionsApi = {
  get: async (date: string, opts?: { ownerId?: string }): Promise<RouteSessionState | null> => {
    const params: Record<string, string> = { date };
    if (opts?.ownerId) params.ownerId = opts.ownerId;
    const res = await apiHttp.get<{ session: RouteSession | null; currentVisit: Visit | null; routePlan: RoutePlan | null }>(
      "/route-sessions",
      { params } as never,
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


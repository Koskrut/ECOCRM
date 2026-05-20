import { apiHttp } from "../client";

export type FuelCompensationStatus =
  | "DRAFT"
  | "SUBMITTED"
  | "APPROVED"
  | "REJECTED"
  | "PAID";

export type FuelVisitBreakdownRow = {
  id: string;
  title: string | null;
  completedAt: string | null;
  lat: number | null;
  lng: number | null;
  startGpsVerification: string | null;
  completeGpsVerification: string | null;
  includedInRoute: boolean;
  hasCoordinates: boolean;
};

export type RouteMetrics = {
  distanceKm: number | null;
  durationMin: number | null;
  source: "google" | "fallback" | "none";
};

export type FuelDayReport = {
  id: string;
  ownerId: string;
  date: string;
  plannedKm: number | null;
  actualKm: number | null;
  compensationKm: number | null;
  litersEstimated: number | null;
  amountEstimated: string | number | null;
  metricsSource: string | null;
  visitCount: number | null;
  compensationStatus: FuelCompensationStatus;
  submittedAt: string | null;
  managerNote: string | null;
};

export type UserFieldProfile = {
  userId: string;
  fuelLitersPer100km: number;
  fuelPricePerLiter: string | number | null;
  vehicleLabel: string | null;
  usePersonalCar: boolean;
};

export type FuelRouteAnchors = {
  startLabel: string | null;
  endLabel: string | null;
  hasExplicitStart: boolean;
  hasExplicitEnd: boolean;
  usesSettingsAnchors: boolean;
};

export type FuelDayResponse = {
  report: FuelDayReport;
  profile: UserFieldProfile;
  breakdown: FuelVisitBreakdownRow[];
  warnings: string[];
  plannedMetrics: RouteMetrics;
  factMetrics: RouteMetrics;
  routeAnchors?: FuelRouteAnchors;
};

export type FuelRangeDay = {
  date: string;
  report: FuelDayReport;
  breakdown: FuelVisitBreakdownRow[];
  warnings: string[];
};

export type FuelRangeResponse = {
  from: string;
  to: string;
  owner: { id: string; fullName: string; email: string } | null;
  profile: UserFieldProfile;
  totals: {
    totalKm: number;
    totalLiters: number;
    totalAmount: number;
    daysWithReport: number;
    daysDraft: number;
    daysWithoutCalc: number;
    dayCount: number;
  };
  days: FuelRangeDay[];
};

export const fieldFuelApi = {
  getDay: async (date: string, ownerId?: string): Promise<FuelDayResponse> => {
    const res = await apiHttp.get<FuelDayResponse>("/field/fuel/day", {
      params: { date, ...(ownerId ? { ownerId } : {}) },
    } as never);
    return res.data;
  },

  recalculate: async (date: string, ownerId?: string): Promise<FuelDayResponse> => {
    const res = await apiHttp.post<FuelDayResponse>(
      "/field/fuel/day/recalculate",
      {},
      { params: { date, ...(ownerId ? { ownerId } : {}) } } as never,
    );
    return res.data;
  },

  submit: async (
    date: string,
    body: { managerNote?: string | null },
  ): Promise<{ report: FuelDayReport; profile: UserFieldProfile }> => {
    const res = await apiHttp.patch<{ report: FuelDayReport; profile: UserFieldProfile }>(
      "/field/fuel/day",
      { compensationStatus: "SUBMITTED", ...body },
      { params: { date } } as never,
    );
    return res.data;
  },

  getRange: async (from: string, to: string, ownerId?: string): Promise<FuelRangeResponse> => {
    const res = await apiHttp.get<FuelRangeResponse>("/field/fuel/range", {
      params: { from, to, ...(ownerId ? { ownerId } : {}) },
    } as never);
    return res.data;
  },

  getProfile: async (): Promise<{ profile: UserFieldProfile }> => {
    const res = await apiHttp.get<{ profile: UserFieldProfile }>("/field/profile");
    return res.data;
  },

  updateProfile: async (body: Partial<UserFieldProfile>): Promise<{ profile: UserFieldProfile }> => {
    const res = await apiHttp.patch<{ profile: UserFieldProfile }>("/field/profile", body);
    return res.data;
  },

  downloadExport: async (
    from: string,
    to: string,
    format: "csv" | "xlsx",
    ownerId?: string,
  ): Promise<void> => {
    const res = await apiHttp.get("/field/fuel/export", {
      params: { from, to, format, ...(ownerId ? { ownerId } : {}) },
      responseType: "blob",
    } as never);
    const blob = res.data as Blob;
    const ext = format === "xlsx" ? "xlsx" : "csv";
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `fuel-${from}-${to}.${ext}`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
  },
};

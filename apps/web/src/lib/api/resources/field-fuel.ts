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
  source: "osrm" | "fallback" | "raw_gps" | "none";
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
  calculationSnapshot?: {
    warnings?: string[];
    plannedKmDegraded?: boolean;
    payoutConfirmedStopCount?: number;
    payoutPlanStopCount?: number;
    payoutReason?: string | null;
  } | null;
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

export type CompensationFactKind = "planned" | "fact_gps" | "fact_visits" | "none";

export type FuelRefuelEntry = {
  id: string;
  ownerId: string;
  date: string;
  fuelDayReportId: string;
  liters: number;
  amount: number;
  currency: string;
  receiptFileName: string;
  receiptMimeType: string;
  receiptSizeBytes: number;
  createdAt: string;
  updatedAt: string;
};

export type FuelRefuelTotals = {
  count: number;
  liters: number;
  amount: number;
};

export type FuelDayResponse = {
  report: FuelDayReport;
  profile: UserFieldProfile;
  breakdown: FuelVisitBreakdownRow[];
  warnings: string[];
  plannedMetrics: RouteMetrics;
  /** Fact by completed visit order (legacy alias). */
  factMetrics: RouteMetrics;
  factVisitsMetrics?: RouteMetrics;
  factGpsMetrics?: RouteMetrics;
  compensationFactKind?: CompensationFactKind;
  snapFailureReason?: string | null;
  rawPolylineDistanceKm?: number | null;
  snappedTrackDistanceKm?: number | null;
  routeAnchors?: FuelRouteAnchors;
  refuels?: FuelRefuelEntry[];
  refuelTotals?: FuelRefuelTotals;
  mobilityMode?: "CAR" | "WALK_TRANSIT";
  mobilityNote?: string | null;
  shiftId?: string | null;
};

export type FuelRangeDay = {
  date: string;
  report: FuelDayReport;
  breakdown: FuelVisitBreakdownRow[];
  warnings: string[];
  refuelCount?: number;
  refuelLitersTotal?: number;
  refuelAmountTotal?: number;
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

  review: async (
    date: string,
    ownerId: string,
    compensationStatus: "APPROVED" | "REJECTED",
  ): Promise<{ report: FuelDayReport; profile: UserFieldProfile }> => {
    const res = await apiHttp.patch<{ report: FuelDayReport; profile: UserFieldProfile }>(
      "/field/fuel/day",
      { compensationStatus },
      { params: { date, ownerId } } as never,
    );
    return res.data;
  },

  getPending: async (
    from: string,
    to: string,
  ): Promise<{
    from: string;
    to: string;
    items: Array<{
      report: FuelDayReport;
      owner: { id: string; fullName: string; email: string };
      refuelTotals?: FuelRefuelTotals;
    }>;
  }> => {
    const res = await apiHttp.get("/field/fuel/pending", { params: { from, to } } as never);
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

  listRefuels: async (
    date: string,
    ownerId?: string,
  ): Promise<{ items: FuelRefuelEntry[]; totals: FuelRefuelTotals }> => {
    const res = await apiHttp.get<{ items: FuelRefuelEntry[]; totals: FuelRefuelTotals }>(
      "/field/fuel/refuels",
      { params: { date, ...(ownerId ? { ownerId } : {}) } } as never,
    );
    return res.data;
  },

  createRefuel: async (
    date: string,
    body: { liters: number; amount: number; file: File },
    ownerId?: string,
  ): Promise<{ item: FuelRefuelEntry }> => {
    const formData = new FormData();
    formData.append("liters", String(body.liters));
    formData.append("amount", String(body.amount));
    formData.append("file", body.file);
    const qs = new URLSearchParams({ date, ...(ownerId ? { ownerId } : {}) });
    const r = await fetch(`/api/field/fuel/refuels?${qs.toString()}`, {
      method: "POST",
      body: formData,
      credentials: "include",
    });
    if (!r.ok) {
      if (r.status === 413) {
        throw new Error("Фото занадто велике. Спробуйте інше зображення або зробіть фото ближче.");
      }
      const err = (await r.json().catch(() => ({}))) as { message?: string };
      throw new Error(err.message ?? `Upload failed (${r.status})`);
    }
    return r.json() as Promise<{ item: FuelRefuelEntry }>;
  },

  deleteRefuel: async (id: string): Promise<{ ok: true }> => {
    const res = await apiHttp.delete<{ ok: true }>(`/field/fuel/refuels/${id}`);
    return res.data;
  },

  refuelReceiptUrl: (id: string): string => `/api/field/fuel/refuels/${id}/receipt`,
};

import { apiGet } from "../client";

export type PayrollCompanyRates = {
  thresholdUah: number;
  percentUpTo: number;
  percentAbove: number;
};

export type PayrollUserRates = {
  baseSalaryUah: number;
  amortizationUahPerKm: number;
  bonusThresholdUah: number | null;
  bonusPercentUpTo: number | null;
  bonusPercentAbove: number | null;
};

export type PayrollOrderLine = {
  orderId: string;
  orderNumber: string;
  closedAt: string;
  currency: string;
  amountOriginal: number;
  exchangeRate: number;
  amountUah: number;
  rateFallback: boolean;
};

export type PayrollFuelDayLine = {
  date: string;
  km: number;
  amountUah: number;
};

export type PayrollBreakdown = {
  userId: string;
  fullName: string;
  month: string;
  rates: PayrollUserRates;
  companyRates: PayrollCompanyRates & { source: "company" };
  baseSalaryUah: number;
  salesBaseUah: number;
  bonusRates: {
    thresholdUah: number;
    percentUpTo: number;
    percentAbove: number;
    source: "company" | "personal";
  };
  appliedPercent: number;
  bonusUah: number;
  amortizationUahPerKm: number;
  totalKm: number;
  amortizationUah: number;
  totalUah: number;
  orders: PayrollOrderLine[];
  fuelDays: PayrollFuelDayLine[];
};

export type PayrollTeamRow = {
  userId: string;
  fullName: string;
  role: string;
  baseSalaryUah: number;
  salesBaseUah: number;
  appliedPercent: number;
  bonusUah: number;
  totalKm: number;
  amortizationUah: number;
  totalUah: number;
  bonusSource: "company" | "personal";
};

export type PayrollTeamResponse = {
  month: string;
  companyRates: PayrollCompanyRates;
  rows: PayrollTeamRow[];
};

export const payrollApi = {
  me: async (month?: string): Promise<PayrollBreakdown> => {
    const params: Record<string, string> = {};
    if (month) params.month = month;
    return apiGet<PayrollBreakdown>("/payroll/me", params);
  },

  user: async (userId: string, month?: string): Promise<PayrollBreakdown> => {
    const params: Record<string, string> = {};
    if (month) params.month = month;
    return apiGet<PayrollBreakdown>(`/payroll/users/${userId}`, params);
  },

  team: async (month?: string): Promise<PayrollTeamResponse> => {
    const params: Record<string, string> = {};
    if (month) params.month = month;
    return apiGet<PayrollTeamResponse>("/payroll/team", params);
  },
};

import { apiGet } from "../client";

export type PayrollCompanyRates = {
  thresholdUsd: number;
  percentUpTo: number;
  percentAbove: number;
  leadTeamBonusPercent: number;
};

export type PayrollUserRates = {
  baseSalaryUah: number;
  amortizationUahPerKm: number;
  bonusThresholdUsd: number | null;
  bonusPercentUpTo: number | null;
  bonusPercentAbove: number | null;
};

export type PayrollOrderLine = {
  orderId: string;
  orderNumber: string;
  closedAt: string;
  currency: string;
  amountOriginal: number;
  amountUsd: number;
  rateFallback: boolean;
};

export type PayrollFuelDayLine = {
  date: string;
  km: number;
  amountUah: number;
  fuelCompensationUah: number;
};

export type PayrollBreakdown = {
  userId: string;
  fullName: string;
  month: string;
  rates: PayrollUserRates;
  companyRates: PayrollCompanyRates & { source: "company" };
  baseSalaryUah: number;
  salesBaseUsd: number;
  bonusRates: {
    thresholdUsd: number;
    percentUpTo: number;
    percentAbove: number;
    source: "company" | "personal";
  };
  appliedPercent: number;
  bonusUsd: number;
  bonusUah: number;
  teamSalesBaseUsd: number;
  leadTeamBonusPercent: number;
  leadTeamBonusUsd: number;
  leadTeamBonusUah: number;
  usdToUahRate: number;
  amortizationUahPerKm: number;
  totalKm: number;
  amortizationUah: number;
  fuelCompensationUah: number;
  totalUah: number;
  orders: PayrollOrderLine[];
  fuelDays: PayrollFuelDayLine[];
};

export type PayrollTeamRow = {
  userId: string;
  fullName: string;
  role: string;
  baseSalaryUah: number;
  salesBaseUsd: number;
  appliedPercent: number;
  bonusUsd: number;
  bonusUah: number;
  leadTeamBonusUsd: number;
  leadTeamBonusUah: number;
  totalKm: number;
  amortizationUah: number;
  fuelCompensationUah: number;
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

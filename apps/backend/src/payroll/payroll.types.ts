import type { PayrollMonthResult } from "./payroll-accrual.util";

export type PayrollUserRatesDto = {
  baseSalaryUah: number;
  amortizationUahPerKm: number;
  bonusThresholdUah: number | null;
  bonusPercentUpTo: number | null;
  bonusPercentAbove: number | null;
};

export type PayrollBreakdownResponse = PayrollMonthResult & {
  userId: string;
  fullName: string;
  rates: PayrollUserRatesDto;
  companyRates: {
    thresholdUah: number;
    percentUpTo: number;
    percentAbove: number;
    leadTeamBonusPercent: number;
    source: "company";
  };
};

export type PayrollTeamRow = {
  userId: string;
  fullName: string;
  role: string;
  baseSalaryUah: number;
  salesBaseUah: number;
  appliedPercent: number;
  bonusUah: number;
  leadTeamBonusUah: number;
  totalKm: number;
  amortizationUah: number;
  fuelCompensationUah: number;
  totalUah: number;
  bonusSource: "company" | "personal";
};

export type PayrollTeamResponse = {
  month: string;
  companyRates: {
    thresholdUah: number;
    percentUpTo: number;
    percentAbove: number;
    leadTeamBonusPercent: number;
  };
  rows: PayrollTeamRow[];
};

import type { PayrollMonthResult } from "./payroll-accrual.util";

export type PayrollUserRatesDto = {
  baseSalaryUah: number;
  amortizationUahPerKm: number;
  bonusThresholdUsd: number | null;
  bonusPercentUpTo: number | null;
  bonusPercentAbove: number | null;
};

export type PayrollBreakdownResponse = PayrollMonthResult & {
  userId: string;
  fullName: string;
  rates: PayrollUserRatesDto;
  companyRates: {
    thresholdUsd: number;
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
  companyRates: {
    thresholdUsd: number;
    percentUpTo: number;
    percentAbove: number;
    leadTeamBonusPercent: number;
  };
  rows: PayrollTeamRow[];
};

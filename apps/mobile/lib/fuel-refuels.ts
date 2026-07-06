import { getApiBaseUrl } from "./config";

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

export function refuelReceiptUrl(id: string): string {
  return `${getApiBaseUrl()}/field/fuel/refuels/${id}/receipt`;
}

export type FuelRefuelEntryDto = {
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

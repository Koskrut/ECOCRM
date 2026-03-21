export type PublicPayPayload = {
  status: string;
  effectiveStatus: string;
  amount: number;
  currency: string;
  purpose: string;
  expiresAt: string;
  recipientName: string;
  iban: string;
  edrpou: string | null;
  mfo: string | null;
  bankName: string | null;
  nbuDeeplink: string;
  qrPngDataUrl: string;
};

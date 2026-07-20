export type TransferCreditDto = {
  fromOrderId: string;
  toOrderId: string;
  amount: number;
  note?: string;
};

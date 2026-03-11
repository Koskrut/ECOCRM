export type StoreJwtPayload = {
  sub: string;
  contactId: string;
  aud: "store";
};

export type StoreCustomer = {
  customerId: string;
  contactId: string;
};

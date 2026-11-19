export type OfficeToolsFilterOp =
  | "="
  | "<>"
  | ">"
  | ">="
  | "<"
  | "<="
  | "LIKE"
  | "NOT LIKE"
  | "IN";

export type OfficeToolsFilterValue = string | number | boolean | Array<string | number>;

export type OfficeToolsListQuery = {
  SELECT?: string[];
  FILTER?: Record<string, Partial<Record<OfficeToolsFilterOp, OfficeToolsFilterValue>>>;
  ORDER?: Record<string, "ASC" | "DESC">;
  LIMIT?: number;
  OFFSET?: number;
};

export type OfficeToolsEnvelope<T> = {
  messageId?: string;
  status: "processed" | "failed" | string;
  result?: T;
  error?: string;
};

export type OfficeToolsComp = {
  CompID?: number | string;
  CompName?: string;
  CompNameFull?: string;
  Code?: string;
  Phone1?: string;
  Phone2?: string;
  City?: string;
  Address?: string;
  TaxPayer?: string | number;
  TaxCode?: string;
  TaxRegNo?: string;
  [key: string]: unknown;
};

export type OfficeToolsRem = {
  StockGID?: number;
  StockGName?: string;
  StockID?: number;
  StockName?: string;
  ProdID?: number;
  ProdName?: string;
  Article1?: string;
  ProdBarCode?: string;
  SeriesNomenclatures?: string;
  Qty?: number | string;
  AccQty?: number | string;
  [key: string]: unknown;
};

export type OfficeToolsCompRec = {
  OurID?: number;
  OurName?: string;
  CompID?: number | string;
  CompName?: string;
  Code?: string;
  ManagerID?: number;
  ManagerName?: string;
  DocDate?: string;
  SumMC?: number | string;
  SumCC?: number | string;
  [key: string]: unknown;
};

export type OfficeToolsCompBalans = {
  CompID?: number | string;
  CompName?: string;
  Code?: string;
  SumAC?: number | string;
  [key: string]: unknown;
};

export type OfficeToolsAccHeader = {
  DocDate: string;
  StockID: number;
  CompID: number;
  CodeID1: number;
  CodeID2: number;
  CodeID3: number;
  CodeID4: number;
  CodeID5: number;
  EmpID: number;
  CurrID: number;
  Notes: string;
  ManagerID: number;
};

export type OfficeToolsAccDetail = {
  ProdID: number;
  Qty: number;
  Price: number;
  SeriesNomenclatures: string;
};

export type OfficeToolsAccCreateBody = {
  HEADER: OfficeToolsAccHeader;
  DETAILS: OfficeToolsAccDetail[];
};

export type OfficeToolsAccCreateResult = {
  chid?: number;
  docid?: number;
};

export type OfficeToolsConfig = {
  isEnabled?: boolean;
  baseUrl?: string;
  stockId?: number;
  empId?: number;
  managerId?: number;
  codeId1?: number;
  currId?: number;
  /** User who last saved settings — used as importedBy for receivables/inventory. */
  configuredByUserId?: string;
};

export class OfficeToolsApiError extends Error {
  constructor(
    message: string,
    readonly statusCode: number,
    readonly body?: unknown,
  ) {
    super(message);
    this.name = "OfficeToolsApiError";
  }
}

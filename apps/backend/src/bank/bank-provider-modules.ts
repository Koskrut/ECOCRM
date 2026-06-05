import type { BankProvider } from "@prisma/client";
import { ModuleIds, type ModuleId } from "../modules/module-ids";

export const BANK_PROVIDER_MODULE: Record<BankProvider, ModuleId> = {
  PRIVAT24: ModuleIds.Privat24,
  UPC: ModuleIds.Upc,
};

export const BANK_PROVIDER_ORDER: BankProvider[] = ["PRIVAT24", "UPC"];

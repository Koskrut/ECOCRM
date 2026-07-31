import { strings } from "@/locales";

export type ReturnReasonCode = "CUSTOMER_CHANGE" | "DEFECT" | "WRONG_ITEM";
export type ReplacementModeCode = "REPLACE_FIRST" | "RETURN_FIRST";
export type ReturnItemDispositionCode =
  | "PENDING"
  | "RESTOCK"
  | "QUARANTINE"
  | "WRITE_OFF";

const t = strings.returns;

export function returnReasonLabel(reason: string | null | undefined): string {
  if (!reason) return t.reasonUnknown;
  const map: Record<string, string> = {
    CUSTOMER_CHANGE: t.reasonCustomerChange,
    DEFECT: t.reasonDefect,
    WRONG_ITEM: t.reasonWrongItem,
  };
  return map[reason] ?? t.reasonUnknown;
}

export function replacementModeLabel(mode: string | null | undefined): string {
  if (!mode) return t.modeUnknown;
  const map: Record<string, string> = {
    REPLACE_FIRST: t.modeReplaceFirst,
    RETURN_FIRST: t.modeReturnFirst,
  };
  return map[mode] ?? t.modeUnknown;
}

export function dispositionLabel(disposition: string | null | undefined): string {
  if (!disposition) return t.dispositionUnknown;
  const map: Record<string, string> = {
    PENDING: t.dispositionPending,
    RESTOCK: t.dispositionRestock,
    QUARANTINE: t.dispositionQuarantine,
    WRITE_OFF: t.dispositionWriteOff,
  };
  return map[disposition] ?? t.dispositionUnknown;
}

export type ChecklistLegState = "pending" | "done" | "waived";

export function checklistLegLabel(state: ChecklistLegState): string {
  const map: Record<ChecklistLegState, string> = {
    pending: t.checklistPending,
    done: t.checklistDone,
    waived: t.checklistWaived,
  };
  return map[state];
}

export function outboundLegLabel(shipped: boolean, waived: boolean): string {
  if (waived) return t.checklistWaived;
  if (shipped) return t.checklistShipped;
  return t.checklistPending;
}

export const RETURN_REASON_OPTIONS: Array<{ value: ReturnReasonCode; label: string }> = [
  { value: "CUSTOMER_CHANGE", label: t.reasonCustomerChange },
  { value: "DEFECT", label: t.reasonDefect },
  { value: "WRONG_ITEM", label: t.reasonWrongItem },
];

export const REPLACEMENT_MODE_OPTIONS: Array<{ value: ReplacementModeCode; label: string }> = [
  { value: "REPLACE_FIRST", label: t.modeReplaceFirst },
  { value: "RETURN_FIRST", label: t.modeReturnFirst },
];

export const DISPOSITION_OPTIONS: Array<{ value: Exclude<ReturnItemDispositionCode, "PENDING">; label: string }> = [
  { value: "RESTOCK", label: t.dispositionRestock },
  { value: "QUARANTINE", label: t.dispositionQuarantine },
  { value: "WRITE_OFF", label: t.dispositionWriteOff },
];

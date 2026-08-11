export type FactoryOrderLifecycleStatus =
  | "DRAFT"
  | "OPEN"
  | "PARTIAL"
  | "CLOSED"
  | "CANCELLED";

export function canEditFactoryOrder(status: FactoryOrderLifecycleStatus | string): boolean {
  return status === "DRAFT";
}

export function canApproveFactoryOrder(status: FactoryOrderLifecycleStatus | string): boolean {
  return status === "DRAFT";
}

export function canAssignFactoryExternalCode(status: FactoryOrderLifecycleStatus | string): boolean {
  return status === "OPEN" || status === "PARTIAL" || status === "CLOSED";
}

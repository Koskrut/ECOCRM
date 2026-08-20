export type FactoryOrderLifecycleStatus =
  | "DRAFT"
  | "OPEN"
  | "PARTIAL"
  | "CLOSED"
  | "CANCELLED";

export function canEditFactoryOrder(status: FactoryOrderLifecycleStatus | string): boolean {
  return status === "DRAFT";
}

/** Alias — draft line add/remove/qty only while DRAFT. */
export function canEditFactoryOrderLines(status: FactoryOrderLifecycleStatus | string): boolean {
  return canEditFactoryOrder(status);
}

export function canApproveFactoryOrder(status: FactoryOrderLifecycleStatus | string): boolean {
  return status === "DRAFT";
}

export function canAssignFactoryExternalCode(status: FactoryOrderLifecycleStatus | string): boolean {
  return status === "OPEN" || status === "PARTIAL" || status === "CLOSED";
}

/** Line-level due dates can be set/updated while draft or after approve (factory reschedule). */
export function canEditLineDueAt(status: FactoryOrderLifecycleStatus | string): boolean {
  return status === "DRAFT" || status === "OPEN" || status === "PARTIAL";
}

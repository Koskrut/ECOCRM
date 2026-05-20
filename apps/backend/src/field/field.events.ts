export const VISIT_COMPLETED_EVENT = "visit.completed";

export type VisitCompletedEvent = {
  ownerId: string;
  dateStr: string;
};

export const VISIT_COMPLETED_EVENT = "visit.completed";
export const SHIFT_ENDED_EVENT = "field.shift.ended";

export type VisitCompletedEvent = {
  ownerId: string;
  dateStr: string;
};

export type ShiftEndedEvent = {
  ownerId: string;
  dateStr: string;
};

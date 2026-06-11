export type FieldShiftLastSample = {
  lat: number;
  lng: number;
  accuracyM: number | null;
  clientRecordedAt: string;
};

export type FieldShiftCurrentVisit = {
  id: string;
  title: string | null;
  status: string;
};

export type FieldShiftTeamItem = {
  shift: {
    id: string;
    ownerId: string;
    date: string;
    status: string;
    startedAt: string;
    endedAt: string | null;
    trackingEnabled: boolean;
    plannedDistanceKm: number | null;
  };
  owner: { id: string; fullName: string; email: string };
  lastSample: FieldShiftLastSample | null;
  sampleCountToday: number;
  currentVisit: FieldShiftCurrentVisit | null;
};

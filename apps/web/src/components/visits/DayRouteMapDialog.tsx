"use client";

import { EntityModalShell } from "@/components/modals/EntityModalShell";
import { DayRouteMapPanel } from "@/components/visits/DayRouteMapPanel";

type Props = {
  open: boolean;
  dateKey: string;
  ownerId: string;
  title: string;
  mapsApiKey: string | null;
  showTeamLink?: boolean;
  onClose: () => void;
};

export function DayRouteMapDialog({
  open,
  dateKey,
  ownerId,
  title,
  mapsApiKey,
  showTeamLink,
  onClose,
}: Props) {
  if (!open) return null;

  return (
    <EntityModalShell
      title={title}
      subtitle={`Маршрут за ${formatDateKey(dateKey)}`}
      canClose
      onClose={onClose}
      left={
        <DayRouteMapPanel
          dateKey={dateKey}
          ownerId={ownerId}
          mapsApiKey={mapsApiKey}
          showTeamLink={showTeamLink}
          mapHeightClass="h-[min(60vh,520px)]"
        />
      }
    />
  );
}

function formatDateKey(dateKey: string): string {
  const [y, m, d] = dateKey.split("-");
  return `${d}.${m}.${y}`;
}

"use client";

import type {
  FieldShiftTeamItem,
  FieldTeamDevicePresence,
  FieldTeamGpsStatus,
} from "@/lib/api/resources/field-shifts";
import { strings } from "@/locales";

const t = strings.visitsTeam;

function formatAgo(iso: string | null | undefined): string {
  if (!iso) return t.gpsNoSignal;
  const diff = Date.now() - new Date(iso).getTime();
  if (diff < 60_000) return strings.monitoring.lastSeenJustNow;
  const min = Math.round(diff / 60_000);
  if (min < 60) return strings.monitoring.lastSeenMinutes.replace("{n}", String(min));
  const h = Math.round(min / 60);
  return strings.monitoring.lastSeenHours.replace("{n}", String(h));
}

function appStatusLabel(
  device: FieldTeamDevicePresence | null,
  gpsStatus: FieldTeamGpsStatus,
): string {
  if (!device?.appState) {
    if (gpsStatus === "ok") return t.appNoHeartbeat;
    return t.appOffline;
  }
  if (device.appState === "ACTIVE") return t.appOpen;
  if (device.appState === "BACKGROUND") return t.appBackground;
  return t.appInactive;
}

function appStatusClass(
  device: FieldTeamDevicePresence | null,
  gpsStatus: FieldTeamGpsStatus,
): string {
  if (!device?.appState) {
    if (gpsStatus === "ok") return "bg-sky-100 text-sky-800";
    return "bg-zinc-100 text-zinc-600";
  }
  if (device.appState === "ACTIVE") return "bg-emerald-100 text-emerald-800";
  if (device.appState === "BACKGROUND") return "bg-sky-100 text-sky-800";
  return "bg-amber-100 text-amber-800";
}

function gpsStatusLabel(status: FieldTeamGpsStatus): string {
  switch (status) {
    case "ok":
      return t.gpsOk;
    case "stale":
      return t.gpsStale;
    case "disabled":
      return t.gpsDisabled;
    default:
      return t.gpsNone;
  }
}

function gpsStatusClass(status: FieldTeamGpsStatus): string {
  switch (status) {
    case "ok":
      return "bg-emerald-100 text-emerald-800";
    case "stale":
      return "bg-amber-100 text-amber-800";
    case "disabled":
      return "bg-zinc-100 text-zinc-600";
    default:
      return "bg-red-100 text-red-800";
  }
}

export function teamMarkerTitle(item: FieldShiftTeamItem): string {
  return t.markerTitle
    .replace("{name}", item.owner.fullName)
    .replace("{app}", appStatusLabel(item.device, item.gpsStatus))
    .replace("{gps}", gpsStatusLabel(item.gpsStatus));
}

type TeamFieldListProps = {
  items: FieldShiftTeamItem[];
  selectedOwnerId: string | null;
  onSelect: (ownerId: string) => void;
};

export function TeamFieldList({ items, selectedOwnerId, onSelect }: TeamFieldListProps) {
  if (items.length === 0) {
    return (
      <p className="rounded-lg border border-dashed border-zinc-200 bg-zinc-50 px-4 py-8 text-center text-sm text-zinc-500">
        {t.empty}
      </p>
    );
  }

  return (
    <ul className="space-y-2">
      {items.map((item) => {
        const selected = item.owner.id === selectedOwnerId;
        const samplesSuffix =
          item.sampleCountToday > 0
            ? t.gpsSamplesSuffix.replace("{count}", String(item.sampleCountToday))
            : "";
        const heartbeatAgo = formatAgo(item.device?.lastSeenAt);
        const gpsAgo = formatAgo(item.lastSample?.clientRecordedAt);

        return (
          <li key={item.shift.id}>
            <button
              type="button"
              onClick={() => onSelect(item.owner.id)}
              className={`w-full rounded-lg border px-3 py-3 text-left transition ${
                selected
                  ? "border-blue-400 bg-blue-50"
                  : "border-zinc-200 bg-white hover:border-zinc-300"
              }`}>
              <div className="flex items-start justify-between gap-2">
                <div>
                  <p className="font-semibold text-zinc-900">{item.owner.fullName}</p>
                  <p className="text-xs text-zinc-500">{item.owner.email}</p>
                </div>
                <div className="flex flex-col items-end gap-1">
                  <span className="rounded-full bg-emerald-100 px-2 py-0.5 text-xs font-medium text-emerald-800">
                    {t.onShift}
                  </span>
                  <div className="flex flex-wrap justify-end gap-1">
                    <span
                      className={`rounded-full px-2 py-0.5 text-xs font-medium ${appStatusClass(item.device, item.gpsStatus)}`}
                      title={t.badgeApp}>
                      {appStatusLabel(item.device, item.gpsStatus)}
                    </span>
                    <span
                      className={`rounded-full px-2 py-0.5 text-xs font-medium ${gpsStatusClass(item.gpsStatus)}`}
                      title={t.badgeGps}>
                      {gpsStatusLabel(item.gpsStatus)}
                    </span>
                  </div>
                </div>
              </div>
              <div className="mt-2 space-y-1 text-xs text-zinc-600">
                {item.currentVisit ? (
                  <p>
                    {t.visitLabel}:{" "}
                    <span className="font-medium">{item.currentVisit.title ?? "—"}</span> (
                    {item.currentVisit.status})
                  </p>
                ) : (
                  <p className="text-zinc-400">{t.noCurrentVisit}</p>
                )}
                <p>
                  {t.teamPresenceDetail
                    .replace("{heartbeat}", heartbeatAgo)
                    .replace("{gps}", gpsAgo)
                    .replace("{samples}", samplesSuffix)}
                </p>
              </div>
            </button>
          </li>
        );
      })}
    </ul>
  );
}

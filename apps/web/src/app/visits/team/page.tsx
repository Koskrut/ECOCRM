"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import { useSearchParams } from "next/navigation";
import { apiHttp } from "@/lib/api/client";
import { fieldFuelApi } from "@/lib/api/resources/field-fuel";
import {
  fieldShiftsApi,
  type FieldShiftTeamItem,
} from "@/lib/api/resources/field-shifts";
import {
  routePlansApi,
  type RouteGeometryBundle,
} from "@/lib/api/resources/visits";
import { todayYmdInKyiv } from "@/lib/crmDatetime";
import { strings } from "@/locales";
import { TeamFieldList } from "@/components/visits/TeamFieldList";
import { TeamFieldMap } from "@/components/visits/TeamFieldMap";
import type { RouteLayerKey } from "@/components/visits/RouteLayerControls";
import { VisitsSubNav } from "../VisitsSubNav";

const POLL_MS = 30_000;

type MeUser = { role?: string };

export default function VisitsTeamPage() {
  const searchParams = useSearchParams();
  const [role, setRole] = useState<string | null>(null);
  const [items, setItems] = useState<FieldShiftTeamItem[]>([]);
  const [selectedOwnerId, setSelectedOwnerId] = useState<string | null>(null);
  const [routeBundle, setRouteBundle] = useState<RouteGeometryBundle | null>(null);
  const [routeLoading, setRouteLoading] = useState(false);
  const [shiftOnly, setShiftOnly] = useState(false);
  const [shiftOnlyPath, setShiftOnlyPath] = useState<Array<{ lat: number; lng: number }> | null>(
    null,
  );
  const [layers, setLayers] = useState<Record<RouteLayerKey, boolean>>({
    planned: false,
    fact_visits: false,
    fact_gps: true,
    fact_visits_gps: false,
  });
  const [mapsApiKey, setMapsApiKey] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);
  const [pendingFuel, setPendingFuel] = useState<
    Array<{
      report: { date: string; compensationKm: number | null };
      owner: { id: string; fullName: string };
      refuelTotals?: { count: number; liters: number; amount: number };
    }>
  >([]);

  function reportDateKey(date: string): string {
    return date.slice(0, 10);
  }

  const today = todayYmdInKyiv();

  useEffect(() => {
    apiHttp
      .get<{ user?: MeUser }>("/auth/me")
      .then((r) => setRole(r.data?.user?.role ?? null))
      .catch(() => setRole(null));
  }, []);

  useEffect(() => {
    apiHttp
      .get<{ mapsApiKey: string | null }>("/settings/google-maps/public")
      .then((r) => setMapsApiKey(r.data?.mapsApiKey ?? null))
      .catch(() => setMapsApiKey(null));
  }, []);

  useEffect(() => {
    const owner = searchParams.get("owner");
    if (owner) {
      setSelectedOwnerId(owner);
      return;
    }
    if (items.length > 0) {
      setSelectedOwnerId((prev) => prev ?? items[0]!.owner.id);
    }
  }, [searchParams, items]);

  const loadTeam = useCallback(async () => {
    if (role !== "ADMIN" && role !== "LEAD") return;
    setErr(null);
    try {
      const [team, pending] = await Promise.all([
        fieldShiftsApi.getActiveTeam(),
        fieldFuelApi.getPending(today, today).catch(() => ({ items: [] })),
      ]);
      setItems(team.items);
      setPendingFuel(pending.items ?? []);
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Не вдалося завантажити команду");
      setItems([]);
    } finally {
      setLoading(false);
    }
  }, [role, today]);

  useEffect(() => {
    void loadTeam();
    if (role !== "ADMIN" && role !== "LEAD") return;
    const id = setInterval(() => {
      void loadTeam();
    }, POLL_MS);
    return () => clearInterval(id);
  }, [loadTeam, role]);

  const selectedItem = useMemo(
    () => items.find((i) => i.owner.id === selectedOwnerId) ?? null,
    [items, selectedOwnerId],
  );

  const loadRouteBundle = useCallback(async () => {
    if (!selectedItem) {
      setRouteBundle(null);
      return;
    }
    setRouteLoading(true);
    try {
      const bundle = await routePlansApi.geometryBundle(today, {
        ownerId: selectedItem.owner.id,
        traffic: true,
      });
      setRouteBundle(bundle);
    } catch {
      setRouteBundle(null);
    } finally {
      setRouteLoading(false);
    }
  }, [selectedItem, today]);

  useEffect(() => {
    void loadRouteBundle();
    if (!selectedItem) return;
    const id = setInterval(() => {
      void loadRouteBundle();
    }, POLL_MS);
    return () => clearInterval(id);
  }, [loadRouteBundle, selectedItem]);

  const loadShiftOnlyTrack = useCallback(async () => {
    if (!shiftOnly || !selectedItem) {
      setShiftOnlyPath(null);
      return;
    }
    try {
      const res = await fieldShiftsApi.getTrackGeometry(selectedItem.shift.id);
      // Backend sanitizes (UA geo + reanchor). Show osrm/fallback; hide empty/none.
      setShiftOnlyPath(res.path.length >= 2 ? res.path : null);
    } catch {
      setShiftOnlyPath(null);
    }
  }, [shiftOnly, selectedItem]);

  useEffect(() => {
    void loadShiftOnlyTrack();
    if (!shiftOnly || !selectedItem) return;
    const id = setInterval(() => {
      void loadShiftOnlyTrack();
    }, POLL_MS);
    return () => clearInterval(id);
  }, [loadShiftOnlyTrack, shiftOnly, selectedItem]);

  async function reviewFuel(ownerId: string, date: string, status: "APPROVED" | "REJECTED") {
    await fieldFuelApi.review(date, ownerId, status);
    await loadTeam();
  }

  if (role != null && role !== "ADMIN" && role !== "LEAD") {
    return (
      <div>
        <VisitsSubNav />
        <p className="text-sm text-zinc-600">Доступ лише для керівників.</p>
      </div>
    );
  }

  return (
    <div>
      <VisitsSubNav />
      <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
        <div>
          <h1 className="text-xl font-semibold text-zinc-900">{strings.nav.visitsTeam}</h1>
          <p className="text-sm text-zinc-500">Оновлення кожні {POLL_MS / 1000} с · {today}</p>
        </div>
        <button
          type="button"
          onClick={() => void loadTeam()}
          className="rounded-md border border-zinc-200 px-3 py-1.5 text-sm font-medium text-zinc-700 hover:bg-zinc-50">
          Оновити
        </button>
      </div>

      {err ? <p className="mb-3 text-sm text-red-600">{err}</p> : null}

      {pendingFuel.length > 0 ? (
        <section className="mb-4 rounded-lg border border-amber-200 bg-amber-50 p-4">
          <h2 className="text-sm font-semibold text-amber-900">Очікують затвердження (паливо)</h2>
          <ul className="mt-2 space-y-2">
            {pendingFuel.map((row) => (
              <li
                key={`${row.owner.id}-${row.report.date}`}
                className="flex flex-wrap items-center justify-between gap-2 text-sm">
                <span>
                  {row.owner.fullName} · {reportDateKey(row.report.date)} · {row.report.compensationKm ?? "—"} км
                  {row.refuelTotals && row.refuelTotals.count > 0
                    ? ` · ⛽ ${row.refuelTotals.count} (${row.refuelTotals.amount.toLocaleString("uk-UA")} грн)`
                    : ""}
                </span>
                <span className="flex gap-2">
                  <button
                    type="button"
                    onClick={() => void reviewFuel(row.owner.id, row.report.date, "APPROVED")}
                    className="rounded bg-emerald-600 px-2 py-1 text-xs font-medium text-white hover:bg-emerald-700">
                    Затвердити
                  </button>
                  <button
                    type="button"
                    onClick={() => void reviewFuel(row.owner.id, row.report.date, "REJECTED")}
                    className="rounded bg-zinc-600 px-2 py-1 text-xs font-medium text-white hover:bg-zinc-700">
                    Відхилити
                  </button>
                  <Link
                    href={`/visits/fuel?owner=${row.owner.id}&date=${reportDateKey(row.report.date)}`}
                    className="rounded border border-zinc-300 px-2 py-1 text-xs font-medium text-zinc-700 hover:bg-white">
                    Деталі
                  </Link>
                </span>
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      <div className="grid gap-4 lg:grid-cols-[320px_1fr]">
        <div>
          {loading ? (
            <p className="text-sm text-zinc-500">{strings.common.loading}</p>
          ) : (
            <TeamFieldList
              items={items}
              selectedOwnerId={selectedOwnerId}
              onSelect={setSelectedOwnerId}
            />
          )}
          {selectedItem ? (
            <div className="mt-3 space-y-2">
              <Link
                href={`/visits/history?owner=${selectedItem.owner.id}&from=${today}&to=${today}`}
                className="block text-xs font-medium text-blue-700 hover:underline">
                Історія за сьогодні
              </Link>
              <label className="flex cursor-pointer items-center gap-2 text-xs text-zinc-600">
                <input
                  type="checkbox"
                  checked={shiftOnly}
                  onChange={(e) => setShiftOnly(e.target.checked)}
                  className="rounded border-zinc-300"
                />
                {strings.visitsTeam.shiftOnlyTrack}
              </label>
            </div>
          ) : null}
        </div>

        <div className="h-[min(70vh,520px)] overflow-hidden rounded-lg border border-zinc-200 bg-zinc-50">
          {mapsApiKey ? (
            <TeamFieldMap
              mapsApiKey={mapsApiKey}
              items={items}
              selectedOwnerId={selectedOwnerId}
              layers={layers}
              geometries={{
                planned: routeBundle?.planned ?? null,
                fact_visits: routeBundle?.factVisits ?? null,
                fact_gps: routeBundle?.factGps ?? null,
              }}
              shiftOnlyPath={shiftOnly ? shiftOnlyPath : null}
              routeLoading={routeLoading}
              distanceKm={routeBundle?.factGps.distanceKm ?? null}
              onToggleLayer={(key) => setLayers((prev) => ({ ...prev, [key]: !prev[key] }))}
            />
          ) : (
            <div className="flex h-full items-center justify-center text-sm text-zinc-500">
              Google Maps API key не налаштовано
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

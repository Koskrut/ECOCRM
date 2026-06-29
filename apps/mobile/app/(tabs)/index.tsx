import { useFocusEffect } from "@react-navigation/native";
import { useRouter } from "expo-router";
import React, { useCallback, useMemo, useState } from "react";
import { RefreshControl, ScrollView, StyleSheet, View } from "react-native";

import { EmptyState } from "@/components/EmptyState";
import { VisitCard } from "@/components/VisitCard";
import { Text } from "@/components/Themed";
import { Chip } from "@/components/ui/Chip";
import { Screen } from "@/components/ui/Screen";
import { SkeletonCard } from "@/components/ui/Skeleton";
import { CallQueueRow } from "@/components/today/CallQueueRow";
import { NearestVisitHero } from "@/components/today/NearestVisitHero";
import { ReadyOrderRow } from "@/components/today/ReadyOrderRow";
import { SectionHeader } from "@/components/today/SectionHeader";
import { ShiftStatusCard } from "@/components/today/ShiftStatusCard";
import { StatTiles, type StatTile } from "@/components/today/StatTiles";
import { TodayHeader } from "@/components/today/TodayHeader";
import { TeamVisitFilter } from "@/components/visit/TeamVisitFilter";
import { VisitDayNavigator } from "@/components/visit/VisitDayNavigator";
import { useAuth } from "@/context/auth-context";
import { useModules } from "@/context/modules-context";
import { useShiftTracking } from "@/context/shift-tracking-context";
import { useTeamVisitFilter } from "@/hooks/use-team-visit-filter";
import { apiFetch } from "@/lib/api";
import { manualCallingApi, type QueueItemResponse } from "@/lib/api/manual-calling";
import { ordersApi, type OrderListItem } from "@/lib/api/orders";
import { visitsApi } from "@/lib/api/visits";
import { formatLocalDateKey, parseDateKey } from "@/lib/date";
import { useTheme } from "@/lib/design/theme-context";
import { t } from "@/lib/i18n";
import type { RouteGeometryBundle } from "@/lib/route-map";
import { visitOwnerId } from "@/lib/team-visits";
import {
  findNearestVisit,
  visitProgress,
} from "@/lib/visit-utils";
import type { VisitSummary } from "@/types/crm";

const TOP_N = 3;

export default function TodayScreen() {
  const router = useRouter();
  const theme = useTheme();
  const { token, user } = useAuth();
  const { visitsEnabled, manualCallingEnabled } = useModules();
  const {
    activeShift,
    isTracking,
    trackingMode,
    trackingHealthy,
    startShift,
    endShift,
    loading: shiftLoading,
    pendingSamples,
  } = useShiftTracking();

  const [items, setItems] = useState<VisitSummary[]>([]);
  const [callQueue, setCallQueue] = useState<QueueItemResponse[]>([]);
  const [readyOrders, setReadyOrders] = useState<OrderListItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [routeKm, setRouteKm] = useState<number | null>(null);
  const [fuelLabel, setFuelLabel] = useState<string | null>(null);

  const [dateKey, setDateKey] = useState(() => formatLocalDateKey());

  const {
    isTeamLead,
    viewOwnerId,
    setViewOwnerId,
    teamMembers,
    showTeamSections,
    teamGroups,
  } = useTeamVisitFilter(token, user, items);

  const ownVisits = useMemo(() => {
    if (!isTeamLead || !user?.id) return items;
    return items.filter((v) => visitOwnerId(v) === user.id);
  }, [items, isTeamLead, user?.id]);

  const nearest = useMemo(
    () => findNearestVisit(isTeamLead ? ownVisits : items),
    [items, isTeamLead, ownVisits],
  );
  const progress = useMemo(() => visitProgress(items), [items]);
  const listItems = useMemo(
    () => (nearest ? items.filter((v) => v.id !== nearest.id) : items),
    [items, nearest],
  );

  const reload = useCallback(async () => {
    if (!token || !visitsEnabled) {
      setItems([]);
      setCallQueue([]);
      setReadyOrders([]);
      setLoading(false);
      return;
    }
    setLoading(true);
    try {
      const callsPromise = manualCallingEnabled
        ? manualCallingApi.getQueue(token).catch(() => ({ items: [] as QueueItemResponse[] }))
        : Promise.resolve({ items: [] as QueueItemResponse[] });

      const ordersPromise = ordersApi
        .list(token, { orderStage: "AWAITING_STOCK", pageSize: 100 })
        .catch(() => ({ items: [] as OrderListItem[] }));

      const [day, fuel, route, calls, orders] = await Promise.all([
        visitsApi.day(token, dateKey, viewOwnerId || undefined),
        apiFetch<{
          report: {
            compensationKm: number | null;
            amountEstimated: string | number | null;
          };
        }>(`/field/fuel/day?date=${encodeURIComponent(dateKey)}`, { token }).catch(() => null),
        apiFetch<RouteGeometryBundle>(
          `/route-plans/geometry/bundle?date=${encodeURIComponent(dateKey)}`,
          { token },
        ).catch(() => null),
        callsPromise,
        ordersPromise,
      ]);

      setItems(day);
      setCallQueue(calls.items ?? []);
      setReadyOrders(
        (orders.items ?? []).filter((o) => o.stockReadiness === "FULL"),
      );

      const km = fuel?.report?.compensationKm;
      const amt = fuel?.report?.amountEstimated;
      if (km != null) {
        const sum =
          amt != null && Number.isFinite(Number(amt))
            ? ` ${Number(amt)} ${t("common.currency")}`
            : "";
        setFuelLabel(`${km} ${t("common.km")}${sum}`);
      } else {
        setFuelLabel(null);
      }

      setRouteKm(route?.planned?.distanceKm ?? null);
    } finally {
      setLoading(false);
    }
  }, [token, dateKey, viewOwnerId, visitsEnabled, manualCallingEnabled]);

  useFocusEffect(
    useCallback(() => {
      void reload();
    }, [reload]),
  );

  const statTiles = useMemo((): StatTile[] => {
    const tiles: StatTile[] = [
      {
        key: "visits",
        label: t("today.statVisits"),
        value: `${progress.done}/${progress.total}`,
        icon: "calendar-outline",
        color: theme.colors.visit,
        bg: theme.colors.visitMuted,
        onPress: () => router.push(`/visits/schedule?date=${dateKey}`),
      },
    ];
    if (manualCallingEnabled) {
      tiles.push({
        key: "calls",
        label: t("today.statCalls"),
        value: String(callQueue.length),
        icon: "call-outline",
        color: theme.colors.call,
        bg: theme.colors.callMuted,
        onPress: () => router.push("/calls/queue"),
      });
    }
    tiles.push({
      key: "ready",
      label: t("today.statReady"),
      value: String(readyOrders.length),
      icon: "cube-outline",
      color: theme.colors.order,
      bg: theme.colors.orderMuted,
      onPress: () => router.push("/(tabs)/work"),
    });
    if (routeKm != null) {
      tiles.push({
        key: "route",
        label: t("today.statRoute"),
        value: `${routeKm} ${t("common.km")}`,
        icon: "map-outline",
        color: theme.colors.success,
        bg: theme.colors.successMuted,
        onPress: () => router.push("/map"),
      });
    }
    if (fuelLabel) {
      tiles.push({
        key: "fuel",
        label: t("today.statFuel"),
        value: fuelLabel,
        icon: "speedometer-outline",
        color: theme.colors.primary,
        bg: theme.colors.primaryMuted,
        onPress: () => router.push(`/fuel/${dateKey}`),
      });
    }
    return tiles;
  }, [
    progress,
    callQueue.length,
    readyOrders.length,
    routeKm,
    fuelLabel,
    manualCallingEnabled,
    theme,
    router,
    dateKey,
  ]);

  if (!visitsEnabled) {
    return (
      <Screen>
        <TodayHeader userName={user?.fullName} done={0} total={0} />
        <View
          style={{
            backgroundColor: theme.colors.warningMuted,
            borderRadius: theme.radius.md,
            padding: theme.spacing.lg,
          }}>
          <Text style={[theme.typography.bodyMedium, { color: theme.colors.warningText }]}>
            {t("modules.unavailableTitle")}
          </Text>
          <Text style={[theme.typography.body, { color: theme.colors.textMuted, marginTop: theme.spacing.sm }]}>
            {t("modules.unavailableBody")}
          </Text>
        </View>
      </Screen>
    );
  }

  return (
    <Screen contentStyle={styles.screenContent} padded={false}>
      <ScrollView
        contentContainerStyle={{ paddingHorizontal: theme.spacing.lg, paddingBottom: theme.spacing.md }}
        refreshControl={
          <RefreshControl refreshing={loading} onRefresh={reload} tintColor={theme.colors.primary} />
        }>
        <TodayHeader
          userName={user?.fullName}
          done={progress.done}
          total={progress.total}
          dateLabel={formatLocalDateKey() !== dateKey ? parseDateKey(dateKey) : undefined}
          onAddVisit={() => router.push(`/visits/new?schedule=today&date=${dateKey}`)}
        />

        <VisitDayNavigator
          dateKey={dateKey}
          onDateKeyChange={setDateKey}
          onOpenCalendar={() => router.push(`/visits/schedule?date=${dateKey}`)}
        />

        <StatTiles tiles={statTiles} />

        <View style={[styles.quickRow, { marginBottom: theme.spacing.md }]}>
          <Chip label={t("tabs.work")} onPress={() => router.push("/(tabs)/work")} />
          <Chip label={t("visits.calendar")} onPress={() => router.push(`/visits/schedule?date=${dateKey}`)} />
          <Chip label={t("today.backlog")} onPress={() => router.push("/visits/backlog")} />
          <Chip label={t("today.history")} onPress={() => router.push("/visits/history")} />
        </View>

        {isTeamLead ? (
          <TeamVisitFilter
            userId={user?.id}
            viewOwnerId={viewOwnerId}
            teamMembers={teamMembers}
            showTeamSections={showTeamSections}
            onViewOwnerIdChange={setViewOwnerId}
          />
        ) : null}

        <ShiftStatusCard
          activeShift={!!activeShift}
          isTracking={isTracking}
          trackingMode={trackingMode}
          trackingHealthy={trackingHealthy}
          pendingSamples={pendingSamples}
          loading={shiftLoading}
          onStart={() => void startShift()}
          onEnd={() => void endShift()}
        />

        {loading && items.length === 0 ? (
          <>
            <SkeletonCard />
            <SkeletonCard />
          </>
        ) : null}

        {!loading && nearest && token && (!isTeamLead || viewOwnerId === user?.id) && !showTeamSections ? (
          <NearestVisitHero visit={nearest} token={token} dateKey={dateKey} />
        ) : null}

        {manualCallingEnabled ? (
          <>
            <SectionHeader
              title={t("today.sectionCalls")}
              onSeeAll={callQueue.length > TOP_N ? () => router.push("/calls/queue") : undefined}
            />
            {callQueue.length === 0 && !loading ? (
              <Text style={[theme.typography.caption, { color: theme.colors.textMuted, marginBottom: theme.spacing.sm }]}>
                {t("today.noCalls")}
              </Text>
            ) : null}
            {callQueue.slice(0, TOP_N).map((item, index) => (
              <CallQueueRow key={item.id} item={item} index={index} />
            ))}
          </>
        ) : null}

        <SectionHeader
          title={t("today.sectionReadyOrders")}
          onSeeAll={readyOrders.length > TOP_N ? () => router.push("/(tabs)/work") : undefined}
        />
        {readyOrders.length === 0 && !loading ? (
          <Text style={[theme.typography.caption, { color: theme.colors.textMuted, marginBottom: theme.spacing.sm }]}>
            {t("today.noReadyOrders")}
          </Text>
        ) : null}
        {readyOrders.slice(0, TOP_N).map((order, index) => (
          <ReadyOrderRow key={order.id} order={order} index={index} />
        ))}

        {showTeamSections && teamGroups ? (
          <>
            {teamGroups.length === 0 && !loading ? (
              <EmptyState message={t("today.empty")} icon="calendar-outline" />
            ) : null}
            {teamGroups.map((group) => {
              const groupNearest =
                group.ownerId === user?.id ? findNearestVisit(group.visits) : null;
              const groupList = groupNearest
                ? group.visits.filter((v) => v.id !== groupNearest.id)
                : group.visits;
              const sectionTitle =
                group.ownerId === user?.id
                  ? t("today.myVisitsSection")
                  : t("today.teamVisitsSection", { name: group.ownerName });

              return (
                <View key={group.ownerId}>
                  <SectionHeader title={sectionTitle} />
                  {!loading && groupNearest && token && group.ownerId === user?.id ? (
                    <NearestVisitHero visit={groupNearest} token={token} dateKey={dateKey} />
                  ) : null}
                  {groupList.map((item, index) => (
                    <VisitCard
                      key={item.id}
                      visit={item}
                      index={index}
                      onPress={() => router.push(`/visit/${item.id}`)}
                    />
                  ))}
                </View>
              );
            })}
          </>
        ) : (
          <>
            <SectionHeader
              title={
                isTeamLead && viewOwnerId === user?.id
                  ? t("today.myVisitsSection")
                  : t("today.sectionOtherVisits")
              }
            />
            {listItems.length === 0 && !nearest && !loading ? (
              <EmptyState message={t("today.empty")} icon="calendar-outline" />
            ) : null}
            {listItems.map((item, index) => (
              <VisitCard
                key={item.id}
                visit={item}
                index={index}
                ownerLabel={
                  isTeamLead && viewOwnerId && viewOwnerId !== user?.id
                    ? visitOwnerId(item) === user?.id
                      ? t("today.teamMine")
                      : (item.owner?.fullName ?? null)
                    : null
                }
                onPress={() => router.push(`/visit/${item.id}`)}
              />
            ))}
          </>
        )}

        <Text style={[theme.typography.caption, styles.footerHint, { color: theme.colors.textMuted }]}>
          {t("today.footerHint")}
        </Text>
      </ScrollView>
    </Screen>
  );
}

const styles = StyleSheet.create({
  screenContent: { flex: 1 },
  quickRow: { flexDirection: "row", gap: 8, flexWrap: "wrap" },
  footerHint: {
    textAlign: "center",
    marginTop: 16,
    marginBottom: 8,
  },
});

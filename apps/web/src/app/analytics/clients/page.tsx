"use client";

import {
  AnalyticsFiltersBar,
  AnalyticsState,
  KpiCard,
  SimpleTable,
  formatMoneyUsd,
  formatNumber,
  useAnalyticsFetch,
  useAnalyticsFilters,
} from "../analytics-ui";

type ClientsResponse = {
  newClientsCount: number;
  repeatClientsCount: number;
  sleepingClientsCount: number;
  topByBookedRevenue: {
    clientId: string;
    clientName: string | null;
    bookedRevenue: number;
    ordersCount: number;
  }[];
  topByCollectedPayments: {
    clientId: string;
    clientName: string | null;
    collectedPayments: number;
  }[];
};

export default function AnalyticsClientsPage() {
  const filters = useAnalyticsFilters();
  const { data, loading, error } = useAnalyticsFetch<ClientsResponse>(
    "clients",
    filters.querySuffix,
  );

  return (
    <div className="space-y-4">
      <AnalyticsFiltersBar
        dateFrom={filters.dateFrom}
        dateTo={filters.dateTo}
        managerId={filters.managerId}
        managers={filters.managers}
        rangePreset={filters.rangePreset}
        comparePrev={filters.comparePrev}
        onDateFromChange={filters.setDateFrom}
        onDateToChange={filters.setDateTo}
        onManagerIdChange={filters.setManagerId}
        onRangePresetChange={filters.setRangePreset}
        onComparePrevChange={filters.setComparePrev}
      />
      <AnalyticsState loading={loading} error={error}>
        <div className="grid gap-3 sm:grid-cols-3">
          <KpiCard title="New Clients" value={formatNumber(data?.newClientsCount)} />
          <KpiCard title="Repeat Clients" value={formatNumber(data?.repeatClientsCount)} />
          <KpiCard title="Sleeping Clients" value={formatNumber(data?.sleepingClientsCount)} />
        </div>
        <SimpleTable
          rows={data?.topByBookedRevenue ?? []}
          columns={[
            { key: "clientName", title: "Client", render: (row) => row.clientName ?? row.clientId },
            {
              key: "bookedRevenue",
              title: "Booked Revenue",
              render: (row) => formatMoneyUsd(row.bookedRevenue),
            },
            { key: "ordersCount", title: "Orders", render: (row) => formatNumber(row.ordersCount) },
          ]}
        />
        <SimpleTable
          rows={data?.topByCollectedPayments ?? []}
          columns={[
            { key: "clientName", title: "Client", render: (row) => row.clientName ?? row.clientId },
            {
              key: "collectedPayments",
              title: "Collected Payments",
              render: (row) => formatMoneyUsd(row.collectedPayments),
            },
          ]}
        />
      </AnalyticsState>
    </div>
  );
}

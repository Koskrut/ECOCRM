"use client";

import {
  AnalyticsFiltersBar,
  AnalyticsState,
  SimpleTable,
  formatMoneyUsd,
  formatNumber,
  useAnalyticsFetch,
  useAnalyticsFilters,
} from "../analytics-ui";

type ProductsResponse = {
  products: {
    productId: string;
    productName: string;
    quantity: number;
    revenue: number;
    ordersCount: number;
  }[];
};

export default function AnalyticsProductsPage() {
  const filters = useAnalyticsFilters();
  const { data, loading, error } = useAnalyticsFetch<ProductsResponse>(
    "products",
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
        <SimpleTable
          rows={data?.products ?? []}
          columns={[
            { key: "productName", title: "Product", render: (row) => row.productName },
            { key: "quantity", title: "Qty", render: (row) => formatNumber(row.quantity) },
            { key: "ordersCount", title: "Orders", render: (row) => formatNumber(row.ordersCount) },
            { key: "revenue", title: "Revenue", render: (row) => formatMoneyUsd(row.revenue) },
          ]}
        />
      </AnalyticsState>
    </div>
  );
}

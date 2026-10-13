export const WORK_CLIENTS_SORT_KEYS = [
  "debt",
  "overdue",
  "overdueDays",
  "lastPayment",
  "lastComment",
] as const;
export type WorkClientsSortKey = (typeof WORK_CLIENTS_SORT_KEYS)[number];
export type SortDir = "asc" | "desc";

export function parseWorkClientsSort(
  sort?: string,
  dir?: string,
): { key: WorkClientsSortKey; dir: SortDir } {
  const key = (WORK_CLIENTS_SORT_KEYS as readonly string[]).includes(sort ?? "")
    ? (sort as WorkClientsSortKey)
    : "debt";
  return { key, dir: dir === "asc" ? "asc" : "desc" };
}

type SortableRow = {
  debtAmount: number;
  overdueAmount: number;
  overdueDays: number;
  lastPaymentAt: string | null;
  lastCommentAt: string | null;
};

function sortValue(row: SortableRow, key: WorkClientsSortKey): number | null {
  switch (key) {
    case "debt":
      return row.debtAmount;
    case "overdue":
      return row.overdueAmount;
    case "overdueDays":
      return row.overdueDays;
    case "lastPayment":
      return row.lastPaymentAt ? Date.parse(row.lastPaymentAt) : null;
    case "lastComment":
      return row.lastCommentAt ? Date.parse(row.lastCommentAt) : null;
  }
}

/** Nulls always go last; ties broken by debt desc. */
export function compareWorkClients(
  a: SortableRow,
  b: SortableRow,
  sort: { key: WorkClientsSortKey; dir: SortDir },
): number {
  const va = sortValue(a, sort.key);
  const vb = sortValue(b, sort.key);
  if (va == null && vb != null) return 1;
  if (vb == null && va != null) return -1;
  if (va != null && vb != null && va !== vb) {
    return sort.dir === "asc" ? va - vb : vb - va;
  }
  return b.debtAmount - a.debtAmount;
}

export function matchesWorkClientQuery(
  row: { clientName: string; externalCode: string | null; phone: string | null },
  rawQuery: string,
): boolean {
  const q = rawQuery.trim().toLowerCase();
  if (!q) return true;
  if (row.clientName.toLowerCase().includes(q)) return true;
  if (row.externalCode?.toLowerCase().includes(q)) return true;
  const qDigits = q.replace(/\D/g, "");
  if (qDigits.length >= 3 && row.phone) {
    return row.phone.replace(/\D/g, "").includes(qDigits);
  }
  return false;
}

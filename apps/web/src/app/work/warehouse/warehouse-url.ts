type SearchParamsLike = {
  get: (key: string) => string | null;
};

/** `null` = param absent (use localStorage / all warehouses). */
export function parseWarehouseIdsParam(sp: SearchParamsLike): string[] | null {
  const raw = sp.get("warehouses");
  if (raw === null) return null;
  return raw
    .split(",")
    .map((id) => id.trim())
    .filter(Boolean);
}

/** `null` = omit param (all warehouses selected). Empty string = none selected. */
export function buildWarehousesParam(selectedIds: string[], allIds: string[]): string | null {
  if (allIds.length > 0 && selectedIds.length === allIds.length) return null;
  return selectedIds.join(",");
}

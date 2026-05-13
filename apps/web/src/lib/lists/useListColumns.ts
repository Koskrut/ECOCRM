"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { apiHttp } from "@/lib/api/client";
import { batchCustomFieldValues } from "@/lib/api/resources/metadataHub";
import {
  findNativeColumn,
  type ListEntityType,
  type NativeColumn,
} from "./columnCatalog";

export type ResolvedColumn =
  | {
      source: "native";
      key: string;
      label: string;
      native: NativeColumn;
      hidden: boolean;
      sortOrder: number;
      fieldId: string;
    }
  | {
      source: "custom";
      key: string;
      label: string;
      definitionKey: string;
      definitionType: string;
      hidden: boolean;
      sortOrder: number;
      fieldId: string;
    };

type RuntimeLayoutField = {
  id: string;
  key: string;
  fieldKey: string | null;
  customFieldDefinitionId: string | null;
  customFieldDefinition: {
    id: string;
    key: string;
    label: string;
    type: string;
  } | null;
  label: string | null;
  sortOrder: number;
  hidden: boolean;
};

type RuntimeLayout = {
  id: string;
  entityType: string;
  type: string;
  sections: Array<{
    id: string;
    fields: RuntimeLayoutField[];
  }>;
};

type RuntimeListResponse = { items?: RuntimeLayout[] };

type CustomValuesMap = Record<string, Record<string, unknown>>;

export type UseListColumnsResult = {
  extraColumns: ResolvedColumn[];
  customValues: CustomValuesMap;
  loadingLayout: boolean;
  loadValuesFor: (rowIds: string[]) => Promise<void>;
  error: string | null;
  refresh: () => Promise<void>;
};

/**
 * Loads the default TABLE layout for the given entity type and resolves each
 * layout field into a `ResolvedColumn` (either a native column from the
 * catalog or a custom-field reference). Also provides a callback the list
 * page can invoke after fetching rows to batch-load custom field values.
 */
export function useListColumns(entityType: ListEntityType): UseListColumnsResult {
  const [columns, setColumns] = useState<ResolvedColumn[]>([]);
  const [customValues, setCustomValues] = useState<CustomValuesMap>({});
  const [loadingLayout, setLoadingLayout] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const customKeysRef = useRef<string[]>([]);

  const fetchLayout = useCallback(async () => {
    setLoadingLayout(true);
    setError(null);
    try {
      const r = await apiHttp.get<RuntimeListResponse>(
        `/layouts/runtime/list?entityType=${encodeURIComponent(entityType)}&type=TABLE`,
      );
      const layouts = r.data?.items ?? [];
      const layout = layouts.find((l) => l.type === "TABLE") ?? layouts[0] ?? null;
      const fields: RuntimeLayoutField[] =
        layout?.sections.flatMap((s) => s.fields ?? []) ?? [];

      const resolved: ResolvedColumn[] = [];
      const customKeys: string[] = [];

      for (const f of fields) {
        if (f.hidden) continue;
        if (f.fieldKey) {
          const native = findNativeColumn(entityType, f.fieldKey);
          if (!native) continue;
          resolved.push({
            source: "native",
            key: f.fieldKey,
            label: f.label?.trim() || native.label,
            native,
            hidden: f.hidden,
            sortOrder: f.sortOrder,
            fieldId: f.id,
          });
        } else if (f.customFieldDefinition) {
          const def = f.customFieldDefinition;
          customKeys.push(def.key);
          resolved.push({
            source: "custom",
            key: `custom.${def.key}`,
            label: f.label?.trim() || def.label,
            definitionKey: def.key,
            definitionType: def.type,
            hidden: f.hidden,
            sortOrder: f.sortOrder,
            fieldId: f.id,
          });
        }
      }

      resolved.sort((a, b) => a.sortOrder - b.sortOrder);
      customKeysRef.current = customKeys;
      setColumns(resolved);
    } catch (e: unknown) {
      const message =
        typeof e === "object" && e && "message" in e
          ? String((e as { message: unknown }).message)
          : "Не вдалося завантажити налаштування колонок";
      setError(message);
      setColumns([]);
      customKeysRef.current = [];
    } finally {
      setLoadingLayout(false);
    }
  }, [entityType]);

  useEffect(() => {
    void fetchLayout();
  }, [fetchLayout]);

  const loadValuesFor = useCallback(
    async (rowIds: string[]) => {
      const keys = customKeysRef.current;
      if (keys.length === 0 || rowIds.length === 0) {
        setCustomValues({});
        return;
      }
      try {
        const r = await batchCustomFieldValues(entityType, rowIds, keys);
        setCustomValues(r.byEntityId ?? {});
      } catch {
        setCustomValues({});
      }
    },
    [entityType],
  );

  return useMemo(
    () => ({
      extraColumns: columns,
      customValues,
      loadingLayout,
      loadValuesFor,
      error,
      refresh: fetchLayout,
    }),
    [columns, customValues, loadingLayout, loadValuesFor, error, fetchLayout],
  );
}

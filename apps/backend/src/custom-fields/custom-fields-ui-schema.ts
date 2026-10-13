import type { CustomFieldDefinition, CustomFieldOption, Dictionary } from "@prisma/client";

export type CustomFieldOptionSchema = {
  id: string;
  key: string;
  label: string;
  value: string | null;
  sortOrder: number;
};

export type CustomFieldDefinitionSchema = {
  id: string;
  key: string;
  label: string;
  description: string | null;
  type: string;
  required: boolean;
  options: CustomFieldOptionSchema[];
  dictionary: { id: string; key: string; name: string } | null;
  dictionaryItems: Array<{ id: string; label: string }>;
};

type DictionarySummary = Pick<Dictionary, "id" | "key" | "name"> & {
  items?: Array<{ id: string; label: string; sortOrder?: number }>;
};

type DefinitionWithRelations = CustomFieldDefinition & {
  dictionary: DictionarySummary | null;
  options: CustomFieldOption[];
};

export function mapDefinitionToFieldSchema(row: DefinitionWithRelations): CustomFieldDefinitionSchema {
  const options = (row.options ?? [])
    .filter((o) => o.deletedAt == null && o.isActive !== false)
    .slice()
    .sort((a, b) => {
      if (a.sortOrder !== b.sortOrder) return a.sortOrder - b.sortOrder;
      return a.label.localeCompare(b.label);
    })
    .map((o) => ({
      id: o.id,
      key: o.key,
      label: o.label,
      value: o.value,
      sortOrder: o.sortOrder,
    }));

  return {
    id: row.id,
    key: row.key,
    label: row.label,
    description: row.description,
    type: row.type,
    required: row.required,
    options,
    dictionary: row.dictionary
      ? { id: row.dictionary.id, key: row.dictionary.key, name: row.dictionary.name }
      : null,
    dictionaryItems: (row.dictionary?.items ?? [])
      .slice()
      .sort((a, b) => (a.sortOrder ?? 0) - (b.sortOrder ?? 0) || a.label.localeCompare(b.label))
      .map((item) => ({ id: item.id, label: item.label })),
  };
}

import test from "node:test";
import assert from "node:assert/strict";
import { CustomFieldType } from "@prisma/client";
import { customFieldValueWhere, parseCustomFilterQuery } from "../custom-field-filters";
import { slugCustomFieldKey, uniqueCustomFieldKey } from "../custom-field-key";

test("slugCustomFieldKey transliterates a Ukrainian label", () => {
  assert.equal(slugCustomFieldKey("Сегмент клієнта"), "segment_kliienta");
  assert.equal(slugCustomFieldKey("VIP"), "vip");
  assert.equal(slugCustomFieldKey("123"), "field_123");
});

test("uniqueCustomFieldKey avoids collisions", () => {
  const used = new Set(["segment"]);
  assert.equal(uniqueCustomFieldKey("Сегмент", used), "segment_2");
  assert.equal(used.has("segment_2"), true);
});

test("parseCustomFilterQuery keeps only filled values", () => {
  assert.equal(parseCustomFilterQuery(""), null);
  assert.deepEqual(parseCustomFilterQuery('{"segment":"vip","empty":"","tags":["a",""]}'), {
    segment: "vip",
    tags: ["a"],
  });
  assert.equal(parseCustomFilterQuery("{"), null);
});

test("customFieldValueWhere maps product types onto stored columns", () => {
  assert.deepEqual(customFieldValueWhere(CustomFieldType.TEXT, "Київ"), {
    valueString: { contains: "Київ", mode: "insensitive" },
  });
  assert.deepEqual(customFieldValueWhere(CustomFieldType.BOOLEAN, "yes"), { valueBoolean: true });
  assert.deepEqual(customFieldValueWhere(CustomFieldType.NUMBER, "12,5"), { valueNumber: 12.5 });
  assert.deepEqual(customFieldValueWhere(CustomFieldType.SELECT, ["a", "b"]), {
    valueString: { in: ["a", "b"] },
  });
  assert.equal(customFieldValueWhere(CustomFieldType.JSON, "x"), null);
});

import test from "node:test";
import assert from "node:assert/strict";
import { BadRequestException } from "@nestjs/common";
import { CustomFieldEntityType, CustomFieldType } from "@prisma/client";
import {
  normalizeCustomFieldKey,
  normalizeCustomFieldValue,
  parseCustomFieldEntityType,
  parseCustomFieldType,
} from "../dto/custom-fields.dto";

test("custom field parsers normalize entity and field types", () => {
  assert.equal(parseCustomFieldEntityType("contact"), CustomFieldEntityType.CONTACT);
  assert.equal(parseCustomFieldType("dictionary_item"), CustomFieldType.DICTIONARY_ITEM);
});

test("normalizeCustomFieldKey accepts stable lowercase dotted keys", () => {
  assert.equal(normalizeCustomFieldKey(" Client.Stage "), "client.stage");
  assert.equal(normalizeCustomFieldKey("vip_level"), "vip_level");
});

test("normalizeCustomFieldKey rejects unsafe keys", () => {
  assert.throws(() => normalizeCustomFieldKey("client stage"), BadRequestException);
  assert.throws(() => normalizeCustomFieldKey("1client"), BadRequestException);
});

test("normalizeCustomFieldValue stores typed values in queryable columns", () => {
  assert.deepEqual(normalizeCustomFieldValue(CustomFieldType.TEXT, "hello").valueString, "hello");
  assert.equal(normalizeCustomFieldValue(CustomFieldType.NUMBER, "12.5").valueNumber, 12.5);
  assert.equal(normalizeCustomFieldValue(CustomFieldType.BOOLEAN, true).valueBoolean, true);
  assert(normalizeCustomFieldValue(CustomFieldType.DATE, "2026-04-27").valueDate instanceof Date);
  assert.deepEqual(normalizeCustomFieldValue(CustomFieldType.MULTISELECT, ["a", "b"]).valueJson, ["a", "b"]);
  assert.equal(normalizeCustomFieldValue(CustomFieldType.DICTIONARY_ITEM, "dict-item-id").dictionaryItemId, "dict-item-id");
});

test("normalizeCustomFieldValue rejects invalid values", () => {
  assert.throws(() => normalizeCustomFieldValue(CustomFieldType.NUMBER, "abc"), BadRequestException);
  assert.throws(() => normalizeCustomFieldValue(CustomFieldType.BOOLEAN, "true"), BadRequestException);
  assert.throws(() => normalizeCustomFieldValue(CustomFieldType.MULTISELECT, "a"), BadRequestException);
});

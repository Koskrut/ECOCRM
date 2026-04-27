import test from "node:test";
import assert from "node:assert/strict";
import { BadRequestException } from "@nestjs/common";
import { CustomFieldEntityType, LayoutType } from "@prisma/client";
import {
  normalizeColumns,
  normalizeLayoutKey,
  normalizeWidth,
  parseLayoutEntityType,
  parseLayoutType,
} from "../dto/layouts.dto";

test("layout parsers normalize entity and layout types", () => {
  assert.equal(parseLayoutEntityType("contact"), CustomFieldEntityType.CONTACT);
  assert.equal(parseLayoutType("card"), LayoutType.CARD);
});

test("normalizeLayoutKey accepts stable lowercase dotted keys", () => {
  assert.equal(normalizeLayoutKey(" Contact.Main "), "contact.main");
  assert.equal(normalizeLayoutKey("default_form"), "default_form");
});

test("normalizeLayoutKey rejects unsafe keys", () => {
  assert.throws(() => normalizeLayoutKey("contact main"), BadRequestException);
  assert.throws(() => normalizeLayoutKey("1contact"), BadRequestException);
});

test("layout size helpers enforce bounded grid values", () => {
  assert.equal(normalizeColumns("2"), 2);
  assert.equal(normalizeWidth("6"), 6);
  assert.equal(normalizeWidth(null), null);
  assert.throws(() => normalizeColumns(0), BadRequestException);
  assert.throws(() => normalizeWidth(13), BadRequestException);
});

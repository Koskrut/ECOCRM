import test from "node:test";
import assert from "node:assert/strict";
import {
  isSuprexSpecificationSheet,
  looksLikeComponentSku,
  normalizeProductName,
  parseSuprexSheet,
} from "../bom-suprex.util";

const SUPREX_HEADER_BLOCK: unknown[][] = [
  ["", "", "", "", "", "", "", ""],
  ["", "", "", "", "", "", "", ""],
  ["MegaGen", "", "", "", "", "", "", ""],
  ["", "", "", "", "", "", "", ""],
  ["№ п/п", "Наименование комплекта продукции", "Артикул", "Комплектующие", "", "", "", "Вміст"],
  ["", "", "", "Артикул", "Ревизия", "Кол-во", "Цвет", "Примечание"],
];

test("looksLikeComponentSku distinguishes article codes from packaging names", () => {
  assert.equal(looksLikeComponentSku("ST-RC-AN"), true);
  assert.equal(looksLikeComponentSku("01.010"), true);
  assert.equal(looksLikeComponentSku("MG-PF-CAD_CAM-MU"), true);
  assert.equal(looksLikeComponentSku("MG-HA 4030"), true);
  assert.equal(looksLikeComponentSku("OS-ATS-MU-1 mm"), true);
  assert.equal(looksLikeComponentSku("Блистер Suprex  (Костя)"), false);
  assert.equal(looksLikeComponentSku("Этикетка 25*40"), false);
});

test("parseSuprexSheet parses metal platform as article not packaging name", () => {
  const rows = [
    ...SUPREX_HEADER_BLOCK,
    ["1", "Kit PF", "04.042", "MG-PF-CAD_CAM-MU", "", "1", "", ""],
    ["", "", "", "MG-SF-M2.0", "", "2", "", ""],
    ["", "", "", "Блистер Suprex  (Костя)", "", "1", "", ""],
  ];
  const { rows: parsed, rowErrors } = parseSuprexSheet(rows, "MG PF");
  assert.equal(rowErrors.length, 0);
  assert.equal(parsed[0]?.componentSku, "MG-PF-CAD_CAM-MU");
  assert.equal(parsed[0]?.componentName, null);
  assert.equal(parsed[2]?.componentName, "Блистер Suprex  (Костя)");
});

test("normalizeProductName collapses non-breaking spaces", () => {
  assert.equal(
    normalizeProductName("Блистер Suprex\u00a0 (Костя)", true),
    "блистер suprex",
  );
});

test("isSuprexSpecificationSheet detects Suprex header layout", () => {
  assert.equal(isSuprexSpecificationSheet(SUPREX_HEADER_BLOCK), true);
});

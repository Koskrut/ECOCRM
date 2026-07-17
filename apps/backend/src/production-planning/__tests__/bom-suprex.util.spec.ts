import test from "node:test";
import assert from "node:assert/strict";
import * as XLSX from "xlsx";
import {
  isSuprexSpecificationSheet,
  isSuprexWorkbook,
  looksLikeComponentSku,
  normalizeProductName,
  parseSuprexSheet,
  parseSuprexWorkbook,
} from "../bom-suprex.util";

const SUPREX_HEADER_BLOCK: unknown[][] = [
  ["", "", "", "", "", "", "", ""],
  ["", "", "", "", "", "", "", ""],
  ["Straumann RC", "", "", "", "", "", "", ""],
  ["", "", "", "", "", "", "", ""],
  ["№ п/п", "Наименование комплекта продукции", "Артикул", "Комплектующие", "", "", "", "Вміст"],
  ["", "", "", "Артикул", "Ревизия", "Кол-во", "Цвет", "Примечание"],
];

test("looksLikeComponentSku distinguishes article codes from packaging names", () => {
  assert.equal(looksLikeComponentSku("ST-RC-AN"), true);
  assert.equal(looksLikeComponentSku("01.010"), true);
  assert.equal(looksLikeComponentSku("Блистер Suprex  (Костя)"), false);
  assert.equal(looksLikeComponentSku("Этикетка 25*40"), false);
});

test("parseSuprexSheet defaults blank qty to 1", () => {
  const rows = [
    ...SUPREX_HEADER_BLOCK,
    ["1", "Kit", "01.010", "ST-RC-AN", "", "", "", ""],
    ["", "", "", "Блистер Suprex", "", "", "", ""],
  ];
  const { rows: parsed, rowErrors } = parseSuprexSheet(rows, "ST RC");
  assert.equal(rowErrors.length, 0);
  assert.equal(parsed.length, 2);
  assert.equal(parsed[0]?.qtyPerKit, 1);
  assert.equal(parsed[1]?.qtyPerKit, 1);
});

test("normalizeProductName collapses non-breaking spaces", () => {
  assert.equal(
    normalizeProductName("Блистер Suprex\u00a0 (Костя)", true),
    "блистер suprex",
  );
});

test("isSuprexSpecificationSheet detects Suprex header layout", () => {
  assert.equal(isSuprexSpecificationSheet(SUPREX_HEADER_BLOCK), true);
  assert.equal(
    isSuprexSpecificationSheet([["kitSku", "componentSku", "qtyPerKit"]]),
    false,
  );
});

test("parseSuprexSheet carries kit SKU across continuation rows", () => {
  const rows = [
    ...SUPREX_HEADER_BLOCK,
    ["1", "Аналог лабораторний ST RC", "01.010", "ST-RC-AN", "", "1", "", "Аналог"],
    ["", "", "", "Блистер Suprex  (Костя)", "", "1", "", ""],
    ["", "", "", "Подложка Тайвек для Suprex (Костя)", "", "2", "", ""],
  ];

  const { rows: parsed, rowErrors } = parseSuprexSheet(rows, "ST RC");
  assert.equal(rowErrors.length, 0);
  assert.equal(parsed.length, 3);
  assert.equal(parsed[0]?.kitSku, "01.010");
  assert.equal(parsed[1]?.kitSku, "01.010");
  assert.equal(parsed[0]?.componentSku, "ST-RC-AN");
  assert.equal(parsed[0]?.componentName, null);
  assert.equal(parsed[1]?.componentName, "Блистер Suprex  (Костя)");
  assert.equal(parsed[2]?.qtyPerKit, 2);
});

test("parseSuprexWorkbook reads all product sheets and skips utility tabs", () => {
  const wb = XLSX.utils.book_new();
  const stRows = [
    ...SUPREX_HEADER_BLOCK,
    ["1", "Kit A", "01.010", "ST-RC-AN", "", "1", "", ""],
  ];
  const mgRows = [
    ...SUPREX_HEADER_BLOCK.map((row, idx) =>
      idx === 2 ? ["MegaGen AR", "", "", "", "", "", "", ""] : row,
    ),
    ["1", "Kit B", "02.020", "MG-AR-LA", "", "1", "", ""],
  ];
  XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(stRows), "ST RC");
  XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(mgRows), "MG AR");
  XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet([["tools"]]), "Инструмент");

  assert.equal(isSuprexWorkbook(wb), true);

  const result = parseSuprexWorkbook(wb);
  assert.deepEqual(result.sheetsProcessed, ["ST RC", "MG AR"]);
  assert.deepEqual(result.skippedSheets, ["Инструмент"]);
  assert.equal(result.rows.length, 2);
  assert.deepEqual(
    result.rows.map((row) => row.kitSku),
    ["01.010", "02.020"],
  );
});

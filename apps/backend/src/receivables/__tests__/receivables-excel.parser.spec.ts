import assert from "node:assert/strict";
import * as XLSX from "xlsx";
import {
  aggregateReceivablesRows,
  normalizeCounterpartyCode1C,
  parseReceivablesExcel,
} from "../receivables-excel.parser";

function buildBuffer(rows: unknown[][]) {
  const ws = XLSX.utils.aoa_to_sheet(rows);
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, "Sheet1");
  return XLSX.write(wb, { type: "buffer", bookType: "xlsx" }) as Buffer;
}

assert.equal(normalizeCounterpartyCode1C("000006495"), "6495");
assert.equal(normalizeCounterpartyCode1C("  000000123  "), "123");
assert.equal(normalizeCounterpartyCode1C("000"), "0");

{
  const buf = buildBuffer([
    ["Код 1С", "Сумма"],
    ["000000123", 1500.5],
    ["000000123", 500],
    ["000000456", "2 000,50"],
  ]);
  const parsed = parseReceivablesExcel(buf);
  assert.equal(parsed.length, 3);
  const agg = aggregateReceivablesRows(parsed);
  assert.equal(agg.get("123"), 2000.5);
  assert.equal(agg.get("456"), 2000.5);
}

{
  const buf = buildBuffer([
    ["Звіт дебіторської заборгованості"],
    ["Код 1С", "Долг USD"],
    ["6495", 6590.5],
    ["000006495", 100],
  ]);
  const parsed = parseReceivablesExcel(buf);
  assert.equal(parsed.length, 2);
  const agg = aggregateReceivablesRows(parsed);
  assert.equal(agg.get("6495"), 6690.5);
}

console.log("receivables-excel.parser.spec: ok");

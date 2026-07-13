import assert from "node:assert/strict";
import * as XLSX from "xlsx";
import {
  aggregateReceivablesRows,
  parseReceivablesExcel,
} from "../receivables-excel.parser";

function buildBuffer(rows: unknown[][]) {
  const ws = XLSX.utils.aoa_to_sheet(rows);
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, "Sheet1");
  return XLSX.write(wb, { type: "buffer", bookType: "xlsx" }) as Buffer;
}

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
  assert.equal(agg.get("000000123"), 2000.5);
  assert.equal(agg.get("000000456"), 2000.5);
  console.log("receivables-excel.parser.spec: ok");
}

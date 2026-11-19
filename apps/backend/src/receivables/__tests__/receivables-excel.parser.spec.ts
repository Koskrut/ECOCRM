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

{
  const buf = buildBuffer([
    ["Код 1С", "Долг", "Переплата"],
    ["1478", 0, 32.88],
    ["2000", -15.5, ""],
    ["2001", "10,00", "2,50"],
    ["2002", 0, 0],
  ]);
  const parsed = parseReceivablesExcel(buf);
  const byCode = new Map(parsed.map((row) => [row.counterpartyCode1C, row.amount]));
  assert.equal(parsed.length, 3);
  assert.equal(byCode.get("1478"), -32.88);
  assert.equal(byCode.get("2000"), -15.5);
  assert.equal(byCode.get("2001"), 7.5);
  assert.equal(byCode.has("2002"), false);
}

{
  const buf = buildBuffer([
    ["Код 1С", "Долг"],
    ["3001", "(32.88)"],
    ["3002", "32.88-"],
    ["3003", "15,50-"],
  ]);
  const parsed = parseReceivablesExcel(buf);
  const byCode = new Map(parsed.map((row) => [row.counterpartyCode1C, row.amount]));
  assert.equal(byCode.get("3001"), -32.88);
  assert.equal(byCode.get("3002"), -32.88);
  assert.equal(byCode.get("3003"), -15.5);
}

{
  const buf = buildBuffer([
    ["Код 1С", "Долг", "Переплата"],
    ["4001", -15.5, 10],
  ]);
  const parsed = parseReceivablesExcel(buf);
  assert.equal(parsed.length, 1);
  assert.equal(parsed[0]!.amount, -15.5);
}

{
  const buf = buildBuffer([
    ["Код 1С", "Сумма переплаты", "Долг"],
    ["1478", 32.88, 0],
  ]);
  const parsed = parseReceivablesExcel(buf);
  assert.equal(parsed.length, 1);
  assert.equal(parsed[0]!.counterpartyCode1C, "1478");
  assert.equal(parsed[0]!.amount, -32.88);
}

{
  const buf = buildBuffer([
    ["code", "amount", "overpayment"],
    ["5001", 20, 5],
  ]);
  const parsed = parseReceivablesExcel(buf);
  assert.equal(parsed.length, 1);
  assert.equal(parsed[0]!.amount, 15);
}

{
  const buf = buildBuffer([
    ["Код 1С", "Долг", "Переплата"],
    ["2002", 0, 0],
  ]);
  assert.throws(
    () => parseReceivablesExcel(buf),
    (err: unknown) => {
      assert.ok(err instanceof Error);
      assert.match(err.message, /No valid rows with code 1C and a non-zero amount/);
      return true;
    },
  );
}

console.log("receivables-excel.parser.spec: ok");

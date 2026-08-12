import assert from "node:assert/strict";
import * as XLSX from "xlsx";
import {
  buildOneCImportKey,
  excelSerialToDate,
  mapCurrencyCode,
  normalizeOneCCode,
  parseOneCPaymentsExcel,
} from "../one-c-payments-excel.parser";

function buildBuffer(rows: unknown[][]) {
  const ws = XLSX.utils.aoa_to_sheet(rows);
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, "Лист1");
  return XLSX.write(wb, { type: "buffer", bookType: "xlsx" }) as Buffer;
}

assert.equal(normalizeOneCCode("000006495"), "6495");
assert.equal(normalizeOneCCode(455.0), "455");
assert.equal(normalizeOneCCode("268.0"), "268");
assert.equal(mapCurrencyCode(980), "UAH");
assert.equal(mapCurrencyCode("840"), "USD");

{
  const d = excelSerialToDate(46235);
  assert.ok(d);
  assert.equal(d!.toISOString().slice(0, 10), "2026-08-01");
}

{
  const paidAt = new Date("2026-08-01T12:00:00.000Z");
  const key1 = buildOneCImportKey({
    paidAt,
    documentNumber: "5884",
    enterpriseCode: "455",
    amountLv: 2587.5,
  });
  const key2 = buildOneCImportKey({
    paidAt,
    documentNumber: "5884",
    enterpriseCode: "455",
    amountLv: 2587.5,
  });
  const key3 = buildOneCImportKey({
    paidAt,
    documentNumber: "5884",
    enterpriseCode: "455",
    amountLv: 2587.51,
  });
  assert.equal(key1, key2);
  assert.notEqual(key1, key3);
  assert.equal(key1.length, 40);
}

{
  const buf = buildBuffer([
    [
      "Дата",
      "Номер",
      "Предприятие",
      "Имя предприятия",
      "Валюта",
      "Сумма ЛВ",
      "Курс ОВ",
      "Сумма ОВ",
      "Формулировка",
      "Признак 1",
      "Имя признака 1",
      "Признак 2",
      "Имя признака 2",
      "Признак 3",
      "Имя признака 3",
      "Менеджер",
      "Имя менеджера",
    ],
    [
      46235,
      5884,
      455,
      "ФОП Шабельник Валерий Николаевич",
      980,
      2587.5,
      51.75,
      50,
      "Шабельник В. М. ФОП  оплата за товар згiдно рах.5884 вiд 28.07.2026",
      60,
      "Покупатель ",
      0,
      "Нет признака 2",
      4,
      'БІО3 ІМПЛАНТС "Південний" ',
      45,
      "Сармісокова Зорина Баходирівна",
    ],
    [
      46238,
      5916,
      268,
      "Подрядчиков Вадим",
      980,
      1759.5,
      51.75,
      34,
      'ТОВАРИСТВО З ОБМЕЖЕНОЮ ВІДПОВІДАЛЬНІСТЮ "НоваПей"  Переказ коштiв',
      60,
      "Покупатель ",
      12,
      "оплата Новапей",
      4,
      'БІО3 ІМПЛАНТС "Південний" ',
      43,
      "Тесла Анжела Васильевна",
    ],
    [
      46239,
      5926,
      778,
      'ТОВ "ЛОТ"',
      980,
      14748.75,
      51.75,
      285,
      'ТОВ "ЛОТ"  За імпланти. Підстава: рахунок №6174 від 31.07.2026р.',
      60,
      "Покупатель ",
      0,
      "Нет признака 2",
      4,
      'БІО3 ІМПЛАНТС "Південний" ',
      43,
      "Тесла Анжела Васильевна",
    ],
    // empty / invalid — skipped
    [null, null, null, null, null, null, null, null, null],
  ]);

  const parsed = parseOneCPaymentsExcel(buf);
  assert.equal(parsed.length, 3);

  assert.equal(parsed[0]!.documentNumber, "5884");
  assert.equal(parsed[0]!.enterpriseCode, "455");
  assert.equal(parsed[0]!.amountLv, 2587.5);
  assert.equal(parsed[0]!.amountOv, 50);
  assert.equal(parsed[0]!.currency, "UAH");
  assert.equal(parsed[0]!.isNovaPay, false);
  assert.equal(parsed[0]!.paidAt.toISOString().slice(0, 10), "2026-08-01");
  assert.ok(parsed[0]!.purpose.includes("рах.5884"));

  assert.equal(parsed[1]!.isNovaPay, true);
  assert.equal(parsed[1]!.documentNumber, "5916");

  assert.equal(parsed[2]!.documentNumber, "5926");
  assert.ok(parsed[2]!.purpose.includes("6174"));
}

{
  // Missing required headers
  let threw = false;
  try {
    parseOneCPaymentsExcel(buildBuffer([["Foo", "Bar"], [1, 2]]));
  } catch {
    threw = true;
  }
  assert.equal(threw, true);
}

console.log("one-c-payments-excel.parser.spec: ok");

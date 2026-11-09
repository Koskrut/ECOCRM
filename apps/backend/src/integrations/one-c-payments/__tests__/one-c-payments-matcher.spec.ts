import assert from "node:assert/strict";
import { extractOneCDocumentRefs } from "../one-c-document-refs";
import { OneCPaymentsMatcherService } from "../one-c-payments-matcher.service";
import type { OneCPaymentExcelRow } from "../one-c-payments-excel.parser";

/**
 * Cases mirror real rows from «ОПЛАТЫ В СРМ.xlsb».
 */
{
  const refs = extractOneCDocumentRefs(
    "Шабельник В. М. ФОП  оплата за товар згiдно рах.5884 вiд 28.07.2026 У сумi 2418.22 грн.",
  );
  assert.ok(refs.invoices.includes("5884"), JSON.stringify(refs));
}

{
  const refs = extractOneCDocumentRefs(
    'ТОВ "ЛОТ"  За імпланти. Підстава: рахунок №6174 від 31.07.2026р., у т.ч. ПДВ 7% = 964,87 грн.',
  );
  assert.ok(refs.invoices.includes("6174"), JSON.stringify(refs));
}

{
  const refs = extractOneCDocumentRefs("ФОП Малевич Олексій Олегович  зг.рах 6209 від 04.08.26");
  assert.ok(refs.invoices.includes("6209"), JSON.stringify(refs));
}

{
  const refs = extractOneCDocumentRefs(
    "ФОП Щербатий Олексій Олексійович  Видаткова накладна#5947 від 03.08.26",
  );
  assert.ok(refs.waybills.includes("5947"), JSON.stringify(refs));
}

{
  const refs = extractOneCDocumentRefs(
    "КРИВ'ЯК А.Б. ФОП  ОПЛАТА ЗГ. НАКЛАДНА  №5952  ВIД 04.08.2026Р",
  );
  assert.ok(refs.waybills.includes("5952"), JSON.stringify(refs));
}

{
  // NovaPay — no document number in purpose
  const refs = extractOneCDocumentRefs(
    'ТОВАРИСТВО З ОБМЕЖЕНОЮ ВІДПОВІДАЛЬНІСТЮ "НоваПей"  Переказ коштiв по платежам. прийнятим вiд населення за товари/послуги згiдно реестру N 14148878',
  );
  assert.equal(refs.invoices.length, 0);
  assert.equal(refs.waybills.length, 0);
}

function paymentRow(enterpriseCode: string): OneCPaymentExcelRow {
  return {
    rowIndex: 0,
    paidAt: new Date("2026-08-01T12:00:00.000Z"),
    documentNumber: "",
    enterpriseCode,
    enterpriseName: "ФОП Шабельник",
    currency: "UAH",
    amountLv: 100,
    rateOv: null,
    amountOv: null,
    purpose: "",
    attribute1Code: null,
    attribute1Name: null,
    attribute2Code: null,
    attribute2Name: null,
    attribute3Code: null,
    attribute3Name: null,
    managerCode: null,
    managerName: null,
    isNovaPay: false,
    importKey: `key-${enterpriseCode}`,
  };
}

{
  const contacts = [
    {
      id: "c-old",
      firstName: "Валерий",
      lastName: "Шабельник",
      documentDisplayName: null,
      externalCode: "000000455",
    },
    {
      id: "c-new",
      firstName: "Другой",
      lastName: "Контакт",
      documentDisplayName: null,
      externalCode: "455",
    },
  ];
  const prisma = {
    payment: { findMany: async () => [] },
    order: { findMany: async () => [] },
    $queryRaw: async () => contacts,
  };
  const svc = new OneCPaymentsMatcherService(prisma as never);
  const [row] = await svc.matchRows([paymentRow("455")]);
  assert.equal(row!.contactByCode?.contactId, "c-old");
  assert.equal(row!.contactByCode?.externalCode, "455");
  assert.ok(row!.warnings.some((w) => w.includes("Кілька контактів")));
}

{
  const prisma = {
    payment: { findMany: async () => [] },
    order: { findMany: async () => [] },
    $queryRaw: async () => [
      {
        id: "c1",
        firstName: "Вадим",
        lastName: "Подрядчиков",
        documentDisplayName: null,
        externalCode: "000268",
      },
    ],
  };
  const svc = new OneCPaymentsMatcherService(prisma as never);
  const [row] = await svc.matchRows([paymentRow("268")]);
  assert.equal(row!.status, "UNMATCHED");
  assert.equal(row!.contactByCode?.contactId, "c1");
  assert.equal(row!.contactByCode?.externalCode, "268");
}

console.log("one-c-payments-matcher.spec: ok");

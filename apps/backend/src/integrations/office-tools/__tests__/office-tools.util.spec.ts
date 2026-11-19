import assert from "node:assert/strict";
import { describe, test } from "node:test";
import {
  assertProcessed,
} from "../office-tools-client";
import { OfficeToolsApiError } from "../office-tools.types";
import {
  buildAccDetails,
  buildCompCreateBody,
  debtFromSumAc,
  extractCompIdentity,
  normalizeOtSerial,
  otSerialKey,
  receiptImportKey,
} from "../office-tools.util";

describe("office-tools util", () => {
  test("debtFromSumAc uses absolute value", () => {
    assert.equal(debtFromSumAc("-30.00"), 30);
    assert.equal(debtFromSumAc(30), 30);
    assert.equal(debtFromSumAc("0"), 0);
  });

  test("serial normalize and key", () => {
    assert.equal(normalizeOtSerial("  ab-1\n"), "ab-1");
    assert.equal(otSerialKey("ab-1"), "AB-1");
  });

  test("buildCompCreateBody prefers documentDisplayName", () => {
    const body = buildCompCreateBody({
      firstName: "Іван",
      lastName: "Петренко",
      phone: "+380501112233",
      documentDisplayName: "ФОП Петренко",
      city: "Київ",
    });
    assert.equal(body.CompName, "ФОП Петренко");
    assert.equal(body.Phone1, "+380501112233");
  });

  test("extractCompIdentity from create result", () => {
    assert.deepEqual(extractCompIdentity({ CompID: 909, Code: "909" }), {
      compId: 909,
      code: "909",
    });
    assert.deepEqual(extractCompIdentity([{ CompID: "11", Code: "11" }]), {
      compId: 11,
      code: "11",
    });
  });

  test("buildAccDetails expands serials to Qty 1 rows", () => {
    const details = buildAccDetails({
      lines: [
        { prodId: 1050, qty: 2, price: 10, serials: ["A1", "A2"] },
        { prodId: 1002, qty: 5, price: 20, serials: [] },
      ],
    });
    assert.equal(details.length, 3);
    assert.deepEqual(details[0], {
      ProdID: 1050,
      Qty: 1,
      Price: 10,
      SeriesNomenclatures: "A1",
    });
    assert.deepEqual(details[1], {
      ProdID: 1050,
      Qty: 1,
      Price: 10,
      SeriesNomenclatures: "A2",
    });
    assert.deepEqual(details[2], {
      ProdID: 1002,
      Qty: 5,
      Price: 20,
      SeriesNomenclatures: "",
    });
  });

  test("receiptImportKey is stable", () => {
    const row = {
      CompID: 134,
      Code: "134",
      DocDate: "2026-10-29",
      SumCC: 100,
      ManagerID: 6,
      OurID: 1,
    };
    assert.equal(receiptImportKey(row), receiptImportKey(row));
    assert.notEqual(receiptImportKey(row), receiptImportKey({ ...row, SumCC: 101 }));
  });

  test("assertProcessed throws on failed envelope", () => {
    assert.throws(
      () =>
        assertProcessed(
          422,
          { status: "failed", error: "duplicate" },
          "comps/create",
        ),
      (err: unknown) => err instanceof OfficeToolsApiError && err.statusCode === 422,
    );
  });

  test("assertProcessed returns result on processed", () => {
    const result = assertProcessed(
      200,
      { status: "processed", result: { chid: 1, docid: 2 } },
      "acc/create",
    );
    assert.deepEqual(result, { chid: 1, docid: 2 });
  });
});

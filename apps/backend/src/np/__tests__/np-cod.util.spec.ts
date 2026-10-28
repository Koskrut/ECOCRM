import assert from "node:assert/strict";
import test from "node:test";
import {
  capCodByDebt,
  codAmountMismatchesDebtUah,
  isNpCodMoneyTransferStatusCode,
} from "../np-cod.util";

test("codAmountMismatchesDebtUah allows zero and within 1 UAH", () => {
  assert.equal(codAmountMismatchesDebtUah(0, 100), false);
  assert.equal(codAmountMismatchesDebtUah(100, 100), false);
  assert.equal(codAmountMismatchesDebtUah(100.5, 100), false);
  assert.equal(codAmountMismatchesDebtUah(102, 100), true);
});

test("capCodByDebt never exceeds remaining debt", () => {
  assert.equal(capCodByDebt(120, 100), 100);
  assert.equal(capCodByDebt(80, 100), 80);
  assert.equal(capCodByDebt(50, 0), 0);
});

test("isNpCodMoneyTransferStatusCode recognizes 10 and 11", () => {
  assert.equal(isNpCodMoneyTransferStatusCode("10"), true);
  assert.equal(isNpCodMoneyTransferStatusCode("11"), true);
  assert.equal(isNpCodMoneyTransferStatusCode("9"), false);
});

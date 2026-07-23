import test from "node:test";
import assert from "node:assert/strict";
import {
  buildPaymentSearchWhere,
  buildBankTransactionSearchWhere,
  parseSearchAmount,
} from "../payment-search.util";

function orderOr(where: any): any[] {
  const orderBranch = where.OR.find((c: any) => c.order);
  assert.ok(orderBranch, "expected an order branch");
  return orderBranch.order.is.OR;
}

test("buildPaymentSearchWhere: numeric query prefers exact orderNumber then contains", () => {
  const where = buildPaymentSearchWhere("9329");
  const or = orderOr(where);
  assert.ok(
    or.some((c) => c.orderNumber?.equals === "9329"),
    "should include exact orderNumber match for digits",
  );
  assert.ok(
    or.some((c) => c.orderNumber?.contains === "9329"),
    "should also include contains match",
  );
});

test("buildPaymentSearchWhere: non-numeric query has no exact orderNumber match", () => {
  const where = buildPaymentSearchWhere("Сидоренко");
  const or = orderOr(where);
  assert.ok(!or.some((c) => c.orderNumber?.equals !== undefined));
  assert.ok(or.some((c) => c.orderNumber?.contains === "Сидоренко"));
});

test("buildPaymentSearchWhere: searches contact and client relations", () => {
  const where = buildPaymentSearchWhere("Сидоренко");
  const or = orderOr(where);
  assert.ok(or.some((c) => c.contact?.is?.OR), "should search contact relation");
  assert.ok(or.some((c) => c.client?.is?.OR), "should search client relation");
});

test("buildPaymentSearchWhere: searches bank transaction description and counterparty", () => {
  const where = buildPaymentSearchWhere("медматериалы");
  const bankBranch = where.OR!.find((c: any) => c.bankTransaction);
  assert.ok(bankBranch, "expected a bankTransaction branch");
  const bankOr = (bankBranch as any).bankTransaction.is.OR;
  assert.ok(bankOr.some((c: any) => c.description?.contains === "медматериалы"));
  assert.ok(bankOr.some((c: any) => c.counterpartyName?.contains === "медматериалы"));
});

test("buildPaymentSearchWhere: includes phoneNormalized for long digit queries", () => {
  const where = buildPaymentSearchWhere("380671234567");
  const or = orderOr(where);
  const contact = or.find((c) => c.contact?.is?.OR)?.contact.is.OR;
  assert.ok(
    contact.some((c: any) => c.phoneNormalized?.contains === "380671234567"),
    "contact OR should include phoneNormalized for long digit strings",
  );
});

test("parseSearchAmount: accepts plain, spaced, comma and currency forms", () => {
  assert.equal(parseSearchAmount("1500"), 1500);
  assert.equal(parseSearchAmount("1 500,50"), 1500.5);
  assert.equal(parseSearchAmount("₴2500.00"), 2500);
  assert.equal(parseSearchAmount("Сидоренко"), null);
  assert.equal(parseSearchAmount("1500abc"), null);
});

test("buildPaymentSearchWhere: numeric amount query also matches amount and amountUsd", () => {
  const where = buildPaymentSearchWhere("1500.50");
  assert.ok(
    where.OR!.some((c: any) => c.amount?.equals === 1500.5),
    "should match payment.amount",
  );
  assert.ok(
    where.OR!.some((c: any) => c.amountUsd?.equals === 1500.5),
    "should match payment.amountUsd",
  );
  const bankBranch = where.OR!.find((c: any) => c.bankTransaction) as any;
  assert.ok(
    bankBranch.bankTransaction.is.OR.some((c: any) => c.amount?.equals === 1500.5),
    "should match bankTransaction.amount",
  );
});

test("buildBankTransactionSearchWhere: searches description, counterparty and linked order", () => {
  const where = buildBankTransactionSearchWhere("9336");
  assert.ok(where.OR!.some((c: any) => c.description?.contains === "9336"));
  assert.ok(where.OR!.some((c: any) => c.counterpartyName?.contains === "9336"));
  assert.ok(
    where.OR!.some((c: any) => c.amount?.equals === 9336),
    "digit query should also match transaction amount",
  );
  const paymentsBranch = where.OR!.find((c: any) => c.payments);
  assert.ok(paymentsBranch, "expected a payments branch");
  const paymentsOr = (paymentsBranch as any).payments.some.OR;
  const orderOrList = paymentsOr.find((c: any) => c.order)?.order.is.OR;
  assert.ok(orderOrList?.some((c: any) => c.orderNumber?.equals === "9336"));
});

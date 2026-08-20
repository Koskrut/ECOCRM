import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { PaymentsFinancialStatusCron } from "../payments-financial-status.cron";

type AnyFn = (...args: unknown[]) => unknown;

function mockFn(impl?: AnyFn) {
  const fn = ((...args: unknown[]) => {
    fn.calls.push(args);
    return impl ? impl(...args) : undefined;
  }) as AnyFn & { calls: unknown[][] };
  fn.calls = [];
  return fn;
}

describe("PaymentsFinancialStatusCron", () => {
  it("updates financialStatus when due date is in the past", async () => {
    const yesterday = new Date();
    yesterday.setDate(yesterday.getDate() - 1);
    yesterday.setHours(12, 0, 0, 0);

    const orderUpdate = mockFn(async () => ({}));
    const prisma = {
      order: {
        findMany: mockFn(async () => [
          {
            id: "o1",
            paymentType: "DEFERRED",
            totalAmount: 100,
            paidAmount: 0,
            debtAmount: 100,
            paymentDueDate: yesterday,
            orderStage: "RECEIVED",
            financialStatus: "AWAITING_PAYMENT",
          },
        ]),
        update: orderUpdate,
      },
    };
    const modules = { isEffective: mockFn(async () => true) };
    const cron = new PaymentsFinancialStatusCron(prisma as never, modules as never);

    process.env.CRON_ENABLED = "true";
    process.env.FINANCE_CRON_DISABLED = "false";
    await cron.runDaily();

    assert.equal(orderUpdate.calls.length, 1);
    assert.equal((orderUpdate.calls[0] as [{ data: { financialStatus: string } }])[0].data.financialStatus, "OVERDUE");
  });
});

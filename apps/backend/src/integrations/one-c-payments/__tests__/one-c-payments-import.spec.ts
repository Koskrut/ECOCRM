import assert from "node:assert/strict";
import { PaymentSourceType, PaymentStatus, Prisma, UserRole } from "@prisma/client";
import { buildOneCImportKey } from "../one-c-payments-excel.parser";
import { OneCPaymentsImportService } from "../one-c-payments-import.service";

type FakePayment = {
  id: string;
  oneCImportKey: string | null;
  orderId: string;
  amount: Prisma.Decimal;
};

function makeImportService(opts?: {
  existingKeys?: string[];
  createFailKeys?: string[];
}) {
  const payments: FakePayment[] = (opts?.existingKeys ?? []).map((k, i) => ({
    id: `pay-existing-${i}`,
    oneCImportKey: k,
    orderId: "ord-1",
    amount: new Prisma.Decimal(1),
  }));
  const created: FakePayment[] = [];
  const recalced: string[] = [];

  const prisma = {
    dataImportJob: {
      findFirst: async ({ where }: { where: { id: string } }) => {
        if (where.id !== "job-1") return null;
        const paidAt = new Date("2026-08-01T12:00:00.000Z");
        const importKey = buildOneCImportKey({
          paidAt,
          documentNumber: "5884",
          enterpriseCode: "455",
          amountLv: 100,
        });
        return {
          id: "job-1",
          status: "validated",
          targetEntity: "PAYMENTS_1C",
          createdById: "user-1",
          summary: {
            phase: "validated",
            rows: [
              {
                rowIndex: 0,
                paidAt: paidAt.toISOString(),
                documentNumber: "5884",
                enterpriseCode: "455",
                enterpriseName: "Test",
                currency: "UAH",
                amountLv: 100,
                rateOv: 50,
                amountOv: 2,
                purpose: "рах.5884",
                attribute1Code: null,
                attribute1Name: null,
                attribute2Code: null,
                attribute2Name: null,
                attribute3Code: null,
                attribute3Name: null,
                managerCode: null,
                managerName: null,
                isNovaPay: false,
                importKey,
              },
            ],
            matches: [
              {
                rowIndex: 0,
                importKey,
                status: "MATCHED",
                matchSource: "purpose_invoice",
                matchedRef: "5884",
                order: {
                  orderId: "ord-1",
                  orderNumber: "1001",
                  invoiceNumber: "5884",
                  waybillNumber: null,
                  debtAmount: 100,
                  currency: "UAH",
                  contactId: "c1",
                  companyId: null,
                  contactExternalCode: "455",
                  contactLabel: "Test",
                },
                candidateOrders: [],
                contactByCode: null,
                warnings: [],
                amountDebtDelta: 0,
              },
            ],
            overrides: {},
          },
        };
      },
      update: async () => ({}),
    },
    payment: {
      findUnique: async ({ where }: { where: { oneCImportKey: string } }) =>
        payments.find((p) => p.oneCImportKey === where.oneCImportKey) ??
        created.find((p) => p.oneCImportKey === where.oneCImportKey) ??
        null,
      create: async ({ data }: { data: { oneCImportKey: string; orderId: string; amount: Prisma.Decimal } }) => {
        if (opts?.createFailKeys?.includes(data.oneCImportKey)) {
          const err = new Prisma.PrismaClientKnownRequestError("Unique", {
            code: "P2002",
            clientVersion: "test",
          });
          throw err;
        }
        const row = {
          id: `pay-${created.length + 1}`,
          oneCImportKey: data.oneCImportKey,
          orderId: data.orderId,
          amount: data.amount,
        };
        created.push(row);
        return row;
      },
    },
    order: {
      findUnique: async ({ where }: { where: { id: string } }) =>
        where.id === "ord-1"
          ? { id: "ord-1", contactId: "c1", clientId: null, companyId: null, currency: "UAH" }
          : null,
    },
  };

  const paymentsSvc = {
    recalcOrder: async (orderId: string) => {
      recalced.push(orderId);
    },
  };

  const matcher = {} as ConstructorParameters<typeof OneCPaymentsImportService>[1];
  const svc = new OneCPaymentsImportService(
    prisma as never,
    matcher,
    paymentsSvc as never,
  );

  return { svc, created, recalced, payments };
}

{
  const { svc, created, recalced } = makeImportService();
  const result = await svc.commit("job-1", {
    id: "user-1",
    role: UserRole.ADMIN,
    email: "a@test",
    fullName: "Admin",
  } as never);

  assert.equal(result.created, 1);
  assert.equal(result.skipped, 0);
  assert.equal(created.length, 1);
  assert.equal(created[0]!.orderId, "ord-1");
  assert.deepEqual(recalced, ["ord-1"]);
}

{
  const paidAt = new Date("2026-08-01T12:00:00.000Z");
  const importKey = buildOneCImportKey({
    paidAt,
    documentNumber: "5884",
    enterpriseCode: "455",
    amountLv: 100,
  });
  const { svc, created } = makeImportService({ existingKeys: [importKey] });
  const result = await svc.commit("job-1", {
    id: "user-1",
    role: UserRole.ADMIN,
    email: "a@test",
    fullName: "Admin",
  } as never);
  assert.equal(result.created, 0);
  assert.equal(result.skipped, 1);
  assert.equal(created.length, 0);
}

{
  // source type constant used by import
  assert.equal(PaymentSourceType.ONE_C, "ONE_C");
  assert.equal(PaymentStatus.COMPLETED, "COMPLETED");
}

console.log("one-c-payments-import.spec: ok");

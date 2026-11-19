import assert from "node:assert/strict";
import { describe, test } from "node:test";
import { officeToolsCreateAcc } from "../office-tools-client";

describe("office-tools client auth", () => {
  test("sends X-API-Key when configured", async () => {
    let seenHeaders: HeadersInit | undefined;
    const fetchImpl: typeof fetch = async (_url, init) => {
      seenHeaders = init?.headers;
      return new Response(
        JSON.stringify({ status: "processed", result: { chid: 1, docid: 2 } }),
        { status: 200, headers: { "Content-Type": "application/json" } },
      );
    };

    await officeToolsCreateAcc(
      {
        baseUrl: "https://example.test/webhooks/demo",
        apiKey: "EDuZyPuvAQiCAzO46",
        fetchImpl,
      },
      {
        HEADER: {
          DocDate: "2026-11-19",
          StockID: 1,
          CompID: 1,
          CodeID1: 60,
          CodeID2: 0,
          CodeID3: 0,
          CodeID4: 0,
          CodeID5: 0,
          EmpID: 1,
          CurrID: 980,
          Notes: "test",
          ManagerID: 1,
        },
        DETAILS: [{ ProdID: 1, Qty: 1, Price: 1, SeriesNomenclatures: "" }],
      },
    );

    const headers = seenHeaders as Record<string, string>;
    assert.equal(headers["X-API-Key"], "EDuZyPuvAQiCAzO46");
    assert.equal(headers["Content-Type"], "application/json");
  });

  test("omits X-API-Key when empty", async () => {
    let seenHeaders: HeadersInit | undefined;
    const fetchImpl: typeof fetch = async (_url, init) => {
      seenHeaders = init?.headers;
      return new Response(
        JSON.stringify({ status: "processed", result: { chid: 1, docid: 2 } }),
        { status: 200, headers: { "Content-Type": "application/json" } },
      );
    };

    await officeToolsCreateAcc(
      { baseUrl: "https://example.test/webhooks/demo", apiKey: "  ", fetchImpl },
      {
        HEADER: {
          DocDate: "2026-11-19",
          StockID: 1,
          CompID: 1,
          CodeID1: 60,
          CodeID2: 0,
          CodeID3: 0,
          CodeID4: 0,
          CodeID5: 0,
          EmpID: 1,
          CurrID: 980,
          Notes: "test",
          ManagerID: 1,
        },
        DETAILS: [{ ProdID: 1, Qty: 1, Price: 1, SeriesNomenclatures: "" }],
      },
    );

    const headers = seenHeaders as Record<string, string>;
    assert.equal(headers["X-API-Key"], undefined);
  });
});

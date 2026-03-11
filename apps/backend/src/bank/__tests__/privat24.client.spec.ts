const { describe, it, beforeEach, afterEach } = require("node:test");
const assert = require("node:assert");
const { Privat24Client } = require("../privat24.client");

describe("Privat24Client headers (Autoclient id handling)", () => {
  let originalFetch;

  beforeEach(() => {
    originalFetch = global.fetch;
  });

  afterEach(() => {
    global.fetch = originalFetch;
  });

  it("without header id API returns 400, with header id succeeds", async () => {
    const calls = [];

    global.fetch = async (url, init) => {
      calls.push({ url, init });
      const headers = (init && init.headers) || {};

      // Эмулируем поведение Autoclient:
      // - если нет заголовка id -> 400 с сообщением "id is not be null!"
      // - если заголовок id есть -> успешный ответ со статусом SUCCESS
      const hasIdHeader = "id" in headers || "ID" in headers;
      if (!hasIdHeader) {
        const body = JSON.stringify({
          status: "ERROR",
          code: "400",
          message: "id is not be null!",
        });
        return {
          ok: false,
          status: 400,
          text: async () => body,
        };
      }

      const body = JSON.stringify({
        status: "SUCCESS",
        transactions: [],
      });
      return {
        ok: true,
        status: 200,
        text: async () => body,
      };
    };

    const client = new Privat24Client();
    const from = new Date("2024-01-01T00:00:00.000Z");
    const to = new Date("2024-01-02T00:00:00.000Z");

    // 1) Без GroupClientID / App ID -> клиент не выставляет header id, получаем 400 с ошибкой.
    await assert.rejects(
      client.getStatement(
        { token: "TEST_TOKEN" },
        "UA123456789012345678901234567",
        from,
        to,
      ),
      (err) => {
        assert.ok(err instanceof Error);
        assert.ok(
          String(err.message).includes("Приват24 працює в режимі групи ПП"),
          "Error message should mention group mode ID requirement",
        );
        return true;
      },
    );

    // 2) С GroupClientID (App ID / UUID) -> клиент выставляет header id и запрос проходит успешно.
    const result = await client.getStatement(
      {
        token: "TEST_TOKEN",
        clientId: "67db69c5-a961-4e0d-85f4-8cc551dc885f",
      },
      "UA123456789012345678901234567",
      from,
      to,
    );

    assert.deepStrictEqual(result, { transactions: [], nextCursor: undefined });

    // Проверяем, что хотя бы один из вызовов содержал header id и URL без ?id=...
    const successCall = calls.find(
      (c) =>
        c.init &&
        c.init.headers &&
        ("id" in c.init.headers || "ID" in c.init.headers),
    );
    assert.ok(successCall, "Expected a call with header id");
    assert.ok(
      !String(successCall.url).includes("id="),
      "URL must not contain ?id=... query param",
    );
  });
}


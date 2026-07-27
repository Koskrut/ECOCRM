const { describe, it } = require("node:test");
const assert = require("node:assert");
const {
  classifyBankTransaction,
  isPrivatTransit,
  normalizeIban,
} = require("../bank-transaction-classifier");

describe("classifyBankTransaction", () => {
  it("never ignores Privat transit (client payments)", () => {
    assert.strictEqual(
      isPrivatTransit({
        counterpartyName: "Транз.рахунок платежi_ DN",
        description: "Сплата за товар, Шевченко Іван Петрович",
      }),
      true,
    );
    assert.strictEqual(
      classifyBankTransaction({
        counterpartyName: "Транз.рахунок платежi_ DG",
        description: "Сплата за замовлення, Коваленко Олена",
      }),
      null,
    );
  });

  it("classifies bank fees", () => {
    const r = classifyBankTransaction({
      description: "ЗА ДЕБЕТУВАННЯ РАХУНКУ",
      counterpartyName: "ПриватБанк",
    });
    assert.deepStrictEqual(r, { category: "BANK_FEE" });

    const r2 = classifyBankTransaction({
      description: "Комiсiя за виконання платежiв",
    });
    assert.deepStrictEqual(r2, { category: "BANK_FEE" });
  });

  it("classifies taxes", () => {
    assert.deepStrictEqual(
      classifyBankTransaction({ counterpartyName: "ДКСУ", description: "ЄП 5%" }),
      { category: "TAX" },
    );
    assert.deepStrictEqual(
      classifyBankTransaction({ description: "Сплата ЄСВ" }),
      { category: "TAX" },
    );
  });

  it("classifies cash withdrawal", () => {
    assert.deepStrictEqual(
      classifyBankTransaction({ description: "Каса Приватбанку, зняття готівки" }),
      { category: "CASH_WITHDRAWAL" },
    );
  });

  it("classifies own IBAN transfers", () => {
    const own = [{ iban: "UA123456789012345678901234567", name: "ФОП Толопіло" }];
    assert.deepStrictEqual(
      classifyBankTransaction(
        {
          counterpartyIban: "UA12 3456 7890 1234 5678 9012 3456 7",
          counterpartyName: "ФОП Толопіло К.В.",
        },
        own,
      ),
      { category: "OWN_TRANSFER" },
    );
  });

  it("classifies own FOP name transfers", () => {
    const own = [
      { iban: "UA111", name: "Толопіло", legalName: "ФОП Толопіло Костянтин" },
      { iban: "UA222", name: "Кириченко", legalName: null },
    ];
    assert.deepStrictEqual(
      classifyBankTransaction(
        { counterpartyName: "ФОП Кириченко Олена", description: "Переказ власних коштів" },
        own,
      ),
      { category: "OWN_TRANSFER" },
    );
  });

  it("classifies own company whitelist", () => {
    assert.deepStrictEqual(
      classifyBankTransaction({
        counterpartyName: 'ТОВ "ЕЙ БІ ЕМ ТЕХНОЛОДЖІ"',
        description: "Оплата",
      }),
      { category: "OWN_COMPANY" },
    );
  });

  it("leaves real client IN unmatched", () => {
    assert.strictEqual(
      classifyBankTransaction({
        counterpartyName: "ТОВ Ромашка",
        description: "Оплата замовлення 12345",
        counterpartyIban: "UA999999999999999999999999999",
      }),
      null,
    );
  });

  it("normalizes IBAN", () => {
    assert.strictEqual(
      normalizeIban("ua12 3456 7890 1234 5678 9012 345"),
      "UA1234567890123456789012345",
    );
  });
});

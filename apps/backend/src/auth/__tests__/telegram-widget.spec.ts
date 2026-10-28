const { describe, it } = require("node:test");
const assert = require("node:assert");
const { createHmac, createHash } = require("crypto");
const {
  verifyTelegramLoginHash,
  verifyTelegramWebAppInitData,
  parseTelegramWebAppInitData,
  isTelegramAuthDateValid,
} = require("../telegram-widget");

function sign(fields: Record<string, string | number>, botToken: string): string {
  const dataCheckString = Object.keys(fields)
    .sort()
    .map((key) => `${key}=${fields[key]}`)
    .join("\n");
  const secretKey = createHash("sha256").update(botToken).digest();
  return createHmac("sha256", secretKey).update(dataCheckString).digest("hex");
}

function signWebApp(fields: Record<string, string>, botToken: string): string {
  const dataCheckString = Object.keys(fields)
    .sort()
    .map((key) => `${key}=${fields[key]}`)
    .join("\n");
  const secretKey = createHmac("sha256", "WebAppData").update(botToken).digest();
  return createHmac("sha256", secretKey).update(dataCheckString).digest("hex");
}

describe("verifyTelegramLoginHash", () => {
  const botToken = "123456:ABC";

  it("accepts every field Telegram signed, including photo_url", () => {
    const fields = {
      id: 42,
      first_name: "Олена",
      auth_date: Math.floor(Date.now() / 1000),
      photo_url: "https://t.me/i/userpic/320/ole.jpg",
    };
    const hash = sign(fields, botToken);
    assert.equal(verifyTelegramLoginHash({ ...fields, hash }, botToken), true);
  });

  it("rejects a check string that dropped photo_url", () => {
    const authDate = Math.floor(Date.now() / 1000);
    const hash = sign(
      {
        id: 42,
        first_name: "Олена",
        auth_date: authDate,
        photo_url: "https://t.me/i/userpic/320/ole.jpg",
      },
      botToken,
    );
    assert.equal(
      verifyTelegramLoginHash(
        { id: 42, first_name: "Олена", auth_date: authDate, hash },
        botToken,
      ),
      false,
    );
  });
});

describe("isTelegramAuthDateValid", () => {
  it("accepts a payload from the last few minutes and rejects an old one", () => {
    const now = Math.floor(Date.now() / 1000);
    assert.equal(isTelegramAuthDateValid(now - 30), true);
    assert.equal(isTelegramAuthDateValid(now - 601), false);
  });
});

describe("verifyTelegramWebAppInitData", () => {
  const botToken = "123456:ABC";

  it("accepts a signed Mini App initData payload", () => {
    const authDate = String(Math.floor(Date.now() / 1000));
    const user = JSON.stringify({ id: 777, first_name: "Оля" });
    const fields = { auth_date: authDate, user, query_id: "AAE" };
    const hash = signWebApp(fields, botToken);
    const initData = new URLSearchParams({ ...fields, hash }).toString();
    assert.equal(verifyTelegramWebAppInitData(initData, botToken), true);
    const parsed = parseTelegramWebAppInitData(initData);
    assert.equal(parsed?.user?.id, 777);
  });

  it("accepts the documented Telegram sample initData", () => {
    // Example from https://docs.telegram-mini-apps.com/platform/init-data
    const bot = "5768337691:AAH5YkoiEuPk8-FZa32hStHTqXiLPtAEhx8";
    const initData =
      "query_id=AAHdF6IQAAAAAN0XohDhrOrc&user=%7B%22id%22%3A279058397%2C%22first_name%22%3A%22Vladislav%22%2C%22last_name%22%3A%22Kibenko%22%2C%22username%22%3A%22vdkfrost%22%2C%22language_code%22%3A%22ru%22%2C%22is_premium%22%3Atrue%7D&auth_date=1662771648&hash=c501b71e775f74ce10e377dea85a7ea24ecd640b223ea86dfe453e0eaed2e2b2";
    assert.equal(verifyTelegramWebAppInitData(initData, bot), true);
  });

  it("ignores the third-party signature field when checking the bot hash", () => {
    const authDate = String(Math.floor(Date.now() / 1000));
    const user = JSON.stringify({ id: 777, first_name: "Оля" });
    const fields = { auth_date: authDate, user };
    const hash = signWebApp(fields, botToken);
    const initData = new URLSearchParams({
      ...fields,
      signature: "not-part-of-bot-hash",
      hash,
    }).toString();
    assert.equal(verifyTelegramWebAppInitData(initData, botToken), true);
  });

  it("rejects a tampered user id", () => {
    const authDate = String(Math.floor(Date.now() / 1000));
    const user = JSON.stringify({ id: 777, first_name: "Оля" });
    const fields = { auth_date: authDate, user };
    const hash = signWebApp(fields, botToken);
    const initData = new URLSearchParams({
      auth_date: authDate,
      user: JSON.stringify({ id: 1, first_name: "Оля" }),
      hash,
    }).toString();
    assert.equal(verifyTelegramWebAppInitData(initData, botToken), false);
  });
});

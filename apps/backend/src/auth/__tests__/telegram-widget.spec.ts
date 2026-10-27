const { describe, it } = require("node:test");
const assert = require("node:assert");
const { createHmac, createHash } = require("crypto");
const { verifyTelegramLoginHash, isTelegramAuthDateValid } = require("../telegram-widget");

function sign(fields: Record<string, string | number>, botToken: string): string {
  const dataCheckString = Object.keys(fields)
    .sort()
    .map((key) => `${key}=${fields[key]}`)
    .join("\n");
  const secretKey = createHash("sha256").update(botToken).digest();
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

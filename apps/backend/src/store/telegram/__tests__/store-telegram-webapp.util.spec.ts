import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { signJwt } from "../../../auth/jwt";
import {
  isTelegramCartSessionId,
  readStoreTelegramWebAppJwt,
} from "../store-telegram-webapp.util";

describe("store telegram webapp util", () => {
  it("detects telegram cart session ids", () => {
    assert.equal(isTelegramCartSessionId("tg:777"), true);
    assert.equal(isTelegramCartSessionId("uuid-like"), false);
    assert.equal(isTelegramCartSessionId(null), false);
  });

  it("reads a signed store_tg JWT from Authorization", () => {
    process.env.JWT_SECRET = "test-secret-for-webapp";
    const token = signJwt(
      {
        aud: "store_tg",
        sub: "777",
        cartSessionId: "tg:777",
        chatId: "777",
        phone: "+380501112233",
      },
      process.env.JWT_SECRET,
      { expiresInSeconds: 60 },
    );
    const req = {
      headers: { authorization: `Bearer ${token}` },
    } as never;
    const payload = readStoreTelegramWebAppJwt(req);
    assert.equal(payload?.sub, "777");
    assert.equal(payload?.cartSessionId, "tg:777");
  });

  it("ignores a normal store JWT", () => {
    process.env.JWT_SECRET = "test-secret-for-webapp";
    const token = signJwt(
      { aud: "store", sub: "cust1", contactId: "c1" },
      process.env.JWT_SECRET,
      { expiresInSeconds: 60 },
    );
    const req = {
      headers: { authorization: `Bearer ${token}` },
    } as never;
    assert.equal(readStoreTelegramWebAppJwt(req), null);
  });
});

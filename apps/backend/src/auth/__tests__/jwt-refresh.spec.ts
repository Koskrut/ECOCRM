import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { signJwt, verifyJwt, verifyJwtAllowExpired } from "../jwt";

describe("jwt refresh window", () => {
  const secret = "test-secret-for-jwt";

  it("verifyJwt rejects expired tokens", () => {
    const token = signJwt({ sub: "u1" }, secret, { expiresInSeconds: -10 });
    assert.throws(() => verifyJwt(token, secret), /expired/i);
  });

  it("verifyJwtAllowExpired accepts a recently expired token", () => {
    const token = signJwt({ sub: "u1", email: "a@b.c" }, secret, { expiresInSeconds: -10 });
    const payload = verifyJwtAllowExpired<{ sub: string }>(token, secret, 60);
    assert.equal(payload.sub, "u1");
  });

  it("verifyJwtAllowExpired rejects tokens past the refresh window", () => {
    const token = signJwt({ sub: "u1" }, secret, { expiresInSeconds: -120 });
    assert.throws(() => verifyJwtAllowExpired(token, secret, 60), /refresh window/i);
  });
});

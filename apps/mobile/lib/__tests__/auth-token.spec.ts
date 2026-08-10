const assert = require("node:assert/strict");
const { describe, it } = require("node:test");

const {
  AUTH_TOKEN_RETRY_ATTEMPTS,
  AUTH_TOKEN_RETRY_DELAYS_MS,
  authTokenRetryDelayMs,
  getAuthTokenWithRetry,
} = require("../auth-token-retry");

describe("authTokenRetryDelayMs", () => {
  it("returns backoff delays between attempts", () => {
    assert.equal(authTokenRetryDelayMs(0), 200);
    assert.equal(authTokenRetryDelayMs(1), 400);
    assert.equal(authTokenRetryDelayMs(2), null);
  });

  it("respects custom delays and attempt count", () => {
    assert.equal(authTokenRetryDelayMs(0, [250, 500], 3), 250);
    assert.equal(authTokenRetryDelayMs(1, [250, 500], 3), 500);
    assert.equal(authTokenRetryDelayMs(0, [300], 2), 300);
    assert.equal(authTokenRetryDelayMs(1, [300], 2), null);
  });

  it("matches exported defaults (2–3 attempts, 200–500ms)", () => {
    assert.equal(AUTH_TOKEN_RETRY_ATTEMPTS, 3);
    assert.deepEqual([...AUTH_TOKEN_RETRY_DELAYS_MS], [200, 400]);
    for (const d of AUTH_TOKEN_RETRY_DELAYS_MS) {
      assert.ok(d >= 200 && d <= 500);
    }
  });
});

describe("getAuthTokenWithRetry", () => {
  it("returns token on first successful read", async () => {
    let calls = 0;
    const token = await getAuthTokenWithRetry({
      getToken: async () => {
        calls += 1;
        return "jwt-1";
      },
      sleep: async () => {
        assert.fail("should not sleep when token is ready");
      },
    });
    assert.equal(token, "jwt-1");
    assert.equal(calls, 1);
  });

  it("retries after null SecureStore reads then succeeds", async () => {
    let calls = 0;
    const slept: number[] = [];
    const token = await getAuthTokenWithRetry({
      getToken: async () => {
        calls += 1;
        return calls >= 3 ? "jwt-late" : null;
      },
      sleep: async (ms: number) => {
        slept.push(ms);
      },
    });
    assert.equal(token, "jwt-late");
    assert.equal(calls, 3);
    assert.deepEqual(slept, [200, 400]);
  });

  it("returns null after exhausting retries", async () => {
    let calls = 0;
    const slept: number[] = [];
    const token = await getAuthTokenWithRetry({
      getToken: async () => {
        calls += 1;
        return null;
      },
      sleep: async (ms: number) => {
        slept.push(ms);
      },
    });
    assert.equal(token, null);
    assert.equal(calls, AUTH_TOKEN_RETRY_ATTEMPTS);
    assert.deepEqual(slept, [200, 400]);
  });
});

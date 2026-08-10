const assert = require("node:assert/strict");
const { describe, it } = require("node:test");

const {
  shouldRetryNativeSync,
  runNativeSyncWithRetry,
} = require("../native-tracking-session-core");

describe("shouldRetryNativeSync", () => {
  it("retries transient credential / bridge failures", () => {
    assert.equal(shouldRetryNativeSync("no_auth_token"), true);
    assert.equal(shouldRetryNativeSync("no_api_url"), true);
    assert.equal(shouldRetryNativeSync("native_sync_rejected"), true);
  });

  it("does not retry permanent misses", () => {
    assert.equal(shouldRetryNativeSync("not_android"), false);
    assert.equal(shouldRetryNativeSync("flag_disabled"), false);
    assert.equal(shouldRetryNativeSync("module_missing"), false);
  });
});

describe("runNativeSyncWithRetry", () => {
  it("returns ok on first success", async () => {
    let calls = 0;
    const result = await runNativeSyncWithRetry(async () => {
      calls += 1;
      return { ok: true };
    });
    assert.deepEqual(result, { ok: true });
    assert.equal(calls, 1);
  });

  it("retries no_auth_token then succeeds", async () => {
    let calls = 0;
    const slept: number[] = [];
    const result = await runNativeSyncWithRetry(
      async () => {
        calls += 1;
        if (calls === 1) return { ok: false, reason: "no_auth_token" };
        return { ok: true };
      },
      {
        retries: 1,
        sleep: async (ms: number) => {
          slept.push(ms);
        },
      },
    );
    assert.deepEqual(result, { ok: true });
    assert.equal(calls, 2);
    assert.deepEqual(slept, [250]);
  });

  it("retries native_sync_rejected once then surfaces failure", async () => {
    let calls = 0;
    const result = await runNativeSyncWithRetry(
      async () => {
        calls += 1;
        return { ok: false, reason: "native_sync_rejected" };
      },
      { retries: 1, sleep: async () => undefined },
    );
    assert.deepEqual(result, { ok: false, reason: "native_sync_rejected" });
    assert.equal(calls, 2);
  });

  it("does not retry module_missing", async () => {
    let calls = 0;
    const result = await runNativeSyncWithRetry(
      async () => {
        calls += 1;
        return { ok: false, reason: "module_missing" };
      },
      { retries: 1, sleep: async () => assert.fail("should not sleep") },
    );
    assert.deepEqual(result, { ok: false, reason: "module_missing" });
    assert.equal(calls, 1);
  });
});

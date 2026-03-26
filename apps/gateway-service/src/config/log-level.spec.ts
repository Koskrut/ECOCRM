import { describe, it, afterEach } from "node:test";
import assert from "node:assert";
import { nestLogLevelsFromEnv } from "./log-level";

describe("nestLogLevelsFromEnv", () => {
  const prev = process.env.LOG_LEVEL;

  afterEach(() => {
    if (prev === undefined) delete process.env.LOG_LEVEL;
    else process.env.LOG_LEVEL = prev;
  });

  it("maps error to single level", () => {
    process.env.LOG_LEVEL = "error";
    assert.deepStrictEqual(nestLogLevelsFromEnv(), ["error"]);
  });

  it("maps info to log", () => {
    process.env.LOG_LEVEL = "info";
    assert.ok(nestLogLevelsFromEnv().includes("log"));
  });
});

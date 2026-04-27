import assert from "node:assert/strict";
import test from "node:test";
import { SystemVersionService } from "../system-version.service";

test("SystemVersionService returns version metadata", () => {
  const dto = new SystemVersionService().getVersion();

  assert.equal(typeof dto.version, "string");
  assert.equal(typeof dto.commitSha, "string");
  assert.equal(typeof dto.builtAt, "string");
  assert.equal(typeof dto.nodeEnv, "string");
  assert.notEqual(dto.version, "");
  assert.notEqual(dto.commitSha, "");
  assert.notEqual(dto.builtAt, "");
  assert.notEqual(dto.nodeEnv, "");
});

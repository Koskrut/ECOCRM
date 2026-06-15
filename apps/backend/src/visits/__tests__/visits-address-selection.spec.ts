import test from "node:test";
import assert from "node:assert/strict";
import { formatEntityAddressLine } from "../../common/entity-address.util";

test("visit address snapshot uses formatted entity address line", () => {
  const line = formatEntityAddressLine("Київ", "кlinika A, bud. 5");
  assert.equal(line, "Київ, кlinika A, bud. 5");
});

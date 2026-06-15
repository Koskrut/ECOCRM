import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { getAuditContext, runWithAuditContext, withAuditSource } from "../audit-context";

describe("audit-context", () => {
  it("withAuditSource sets actor and request source", () => {
    withAuditSource("cron", "cron:ringostat-polling", () => {
      const ctx = getAuditContext();
      assert.equal(ctx?.actor.id, "cron:ringostat-polling");
      assert.equal(ctx?.request?.source, "cron");
    });
  });

  it("runWithAuditContext supports skipAudit flag", () => {
    runWithAuditContext(
      {
        actor: { id: "import", role: null },
        request: { source: "import" },
        skipAudit: true,
      },
      () => {
        assert.equal(getAuditContext()?.skipAudit, true);
      },
    );
  });
});

import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { UserRole } from "@prisma/client";
import { defaultOrderOwnerFromClient } from "../order-owner-from-client";

describe("defaultOrderOwnerFromClient", () => {
  const admin = { id: "admin-1", role: UserRole.ADMIN };
  const manager = { id: "mgr-1", role: UserRole.MANAGER };

  it("uses the client's manager for an admin", () => {
    assert.equal(
      defaultOrderOwnerFromClient({
        actor: admin,
        clientOwnerId: "mgr-2",
        currentOwnerId: "admin-1",
      }),
      "mgr-2",
    );
  });

  it("keeps the current owner when the client has no manager", () => {
    assert.equal(
      defaultOrderOwnerFromClient({
        actor: admin,
        clientOwnerId: null,
        currentOwnerId: "admin-1",
      }),
      "admin-1",
    );
  });

  it("lets a manager keep an order for their own client", () => {
    assert.equal(
      defaultOrderOwnerFromClient({
        actor: manager,
        clientOwnerId: "mgr-1",
        currentOwnerId: "mgr-1",
      }),
      "mgr-1",
    );
  });

  it("does not reassign a manager's order to another manager", () => {
    assert.equal(
      defaultOrderOwnerFromClient({
        actor: manager,
        clientOwnerId: "mgr-2",
        currentOwnerId: "mgr-1",
      }),
      "mgr-1",
    );
  });
});

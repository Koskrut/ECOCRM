import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { BadRequestException } from "@nestjs/common";

import { RouteSessionsService } from "../route-sessions.service";
import { ROUTE_SESSION_START_REQUIRES_CONFIRM } from "../route-plan-confirm.util";
import type { AuthUser } from "../../auth/auth.types";

const OWNER = "owner-a";
const DATE = "2026-08-11";

function actor(): AuthUser {
  return { id: OWNER, role: "MANAGER", email: "owner@test.local" } as AuthUser;
}

function makePrisma(plan: { id: string; confirmedAt: Date | null } | null) {
  const sessionRow = {
    id: "sess-1",
    ownerId: OWNER,
    date: new Date(`${DATE}T00:00:00.000Z`),
    routePlanId: plan?.id ?? null,
    isActive: true,
    currentVisitId: null,
    startedAt: new Date(),
    endedAt: null,
    createdAt: new Date(),
    updatedAt: new Date(),
  };
  return {
    routePlan: {
      findUnique: async () =>
        plan
          ? {
              ...plan,
              ownerId: OWNER,
              date: sessionRow.date,
              stops: [],
            }
          : null,
    },
    routeSession: {
      upsert: async () => sessionRow,
      findUnique: async () => null,
    },
    visit: {
      findMany: async () => [],
      findUnique: async () => null,
    },
  };
}

describe("RouteSessionsService.start confirmation guard", () => {
  it("rejects when there is no confirmed route plan", async () => {
    const svc = new RouteSessionsService(makePrisma(null) as never);
    await assert.rejects(
      () => svc.start(DATE, actor()),
      (err: unknown) => {
        assert.ok(err instanceof BadRequestException);
        const body = (err as BadRequestException).getResponse() as { message?: string };
        assert.equal(String(body.message ?? err), ROUTE_SESSION_START_REQUIRES_CONFIRM);
        return true;
      },
    );
  });

  it("rejects when the plan is not confirmed", async () => {
    const svc = new RouteSessionsService(makePrisma({ id: "plan-1", confirmedAt: null }) as never);
    await assert.rejects(
      () => svc.start(DATE, actor()),
      (err: unknown) => {
        assert.ok(err instanceof BadRequestException);
        const body = (err as BadRequestException).getResponse() as { message?: string };
        assert.equal(String(body.message ?? err), ROUTE_SESSION_START_REQUIRES_CONFIRM);
        return true;
      },
    );
  });

  it("starts when the plan is confirmed", async () => {
    const svc = new RouteSessionsService(
      makePrisma({ id: "plan-1", confirmedAt: new Date("2026-08-11T08:00:00.000Z") }) as never,
    );
    const state = await svc.start(DATE, actor());
    assert.equal(state.session.isActive, true);
    assert.equal(state.routePlan?.id, "plan-1");
    assert.ok(state.routePlan?.confirmedAt);
  });
});

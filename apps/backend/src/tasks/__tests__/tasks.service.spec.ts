import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { TaskStatus, UserRole } from "@prisma/client";
import { TasksService } from "../tasks.service";
import type { PrismaService } from "../../prisma/prisma.service";
import type { ContactAccessService } from "../../contacts/contact-access.service";

describe("TasksService.list", () => {
  it("shows contact tasks to manager when they are assignee or creator", async () => {
    const seenWhere: unknown[] = [];
    const prisma = {
      task: {
        findMany: async (args: { where: unknown }) => {
          seenWhere.push(args.where);
          return [
            {
              id: "t-1",
              title: "Follow up",
              status: TaskStatus.OPEN,
              assignee: { id: "mgr-1", fullName: "Mgr" },
            },
          ];
        },
        count: async () => 1,
      },
    } as unknown as PrismaService;
    const contactAccess = {
      getTeamUserIds: async () => ["lead-1", "mgr-1"],
    } as ContactAccessService;
    const svc = new TasksService(prisma, contactAccess);

    const out = await svc.list(
      { contactId: "c-1", page: 1, pageSize: 20 },
      { id: "mgr-1", email: "m@test", fullName: "Mgr", role: UserRole.MANAGER },
    );

    assert.strictEqual(out.total, 1);
    assert.deepStrictEqual(seenWhere[0], {
      OR: [{ assigneeId: "mgr-1" }, { createdById: "mgr-1" }],
      contactId: "c-1",
    });
  });

  it("limits team contact tasks for lead to team assignees", async () => {
    const seenWhere: unknown[] = [];
    const prisma = {
      task: {
        findMany: async (args: { where: unknown }) => {
          seenWhere.push(args.where);
          return [];
        },
        count: async () => 0,
      },
    } as unknown as PrismaService;
    const contactAccess = {
      getTeamUserIds: async () => ["lead-1", "mgr-1", "mgr-2"],
    } as ContactAccessService;
    const svc = new TasksService(prisma, contactAccess);

    await svc.list(
      { contactId: "c-1", page: 1, pageSize: 20 },
      { id: "lead-1", email: "l@test", fullName: "Lead", role: UserRole.LEAD },
    );

    assert.deepStrictEqual(seenWhere[0], {
      assigneeId: { in: ["lead-1", "mgr-1", "mgr-2"] },
      contactId: "c-1",
    });
  });

  it("keeps non-contact manager list scoped to assignee only", async () => {
    const seenWhere: unknown[] = [];
    const prisma = {
      task: {
        findMany: async (args: { where: unknown }) => {
          seenWhere.push(args.where);
          return [];
        },
        count: async () => 0,
      },
    } as unknown as PrismaService;
    const contactAccess = {
      getTeamUserIds: async () => [],
    } as ContactAccessService;
    const svc = new TasksService(prisma, contactAccess);

    await svc.list(
      { page: 1, pageSize: 20 },
      { id: "mgr-1", email: "m@test", fullName: "Mgr", role: UserRole.MANAGER },
    );

    assert.deepStrictEqual(seenWhere[0], {
      assigneeId: "mgr-1",
    });
  });
});

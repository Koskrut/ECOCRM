import { ForbiddenException } from "@nestjs/common";
import { UserRole, type Prisma } from "@prisma/client";
import type { AuthUser } from "../auth/auth.types";
import type { PrismaService } from "../prisma/prisma.service";

/** IDs the actor may view (visits / plans). */
export async function getAllowedOwnerIds(
  prisma: PrismaService,
  actor: AuthUser,
): Promise<string[] | "all"> {
  if (actor.role === UserRole.ADMIN) return "all";
  if (actor.role === UserRole.LEAD) {
    const team = await prisma.user.findMany({
      where: { leadId: actor.id },
      select: { id: true },
    });
    return [actor.id, ...team.map((t) => t.id)];
  }
  return [actor.id];
}

export async function assertCanAccessOwner(
  prisma: PrismaService,
  actor: AuthUser,
  ownerId: string,
): Promise<void> {
  const allowed = await getAllowedOwnerIds(prisma, actor);
  if (allowed === "all") return;
  if (!allowed.includes(ownerId)) {
    throw new ForbiddenException("Cannot access this user's visits or route plan");
  }
}

/** Single owner for route plan / session / metrics (requires explicit or defaults to self). */
export async function resolveSingleOwnerId(
  prisma: PrismaService,
  actor: AuthUser,
  requestedOwnerId?: string,
): Promise<string> {
  const target = requestedOwnerId?.trim() || actor.id;
  await assertCanAccessOwner(prisma, actor, target);
  return target;
}

/** Prisma filter for listing visits (day / history-style lists). */
export async function buildVisitOwnerFilter(
  prisma: PrismaService,
  actor: AuthUser,
  requestedOwnerId?: string,
): Promise<Prisma.VisitWhereInput["ownerId"]> {
  const allowed = await getAllowedOwnerIds(prisma, actor);
  const requested = requestedOwnerId?.trim();

  if (actor.role === UserRole.MANAGER || actor.role === UserRole.USER) {
    return actor.id;
  }

  if (requested) {
    await assertCanAccessOwner(prisma, actor, requested);
    return requested;
  }

  if (allowed === "all") {
    return undefined;
  }

  return { in: allowed };
}

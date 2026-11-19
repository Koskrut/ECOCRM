import { UserRole } from "@prisma/client";

/**
 * Default order owner when a client is chosen: that client's responsible manager.
 * A manager-role actor keeps the current owner if the client belongs to someone else.
 * If the client has no manager, the current owner stays.
 */
export function defaultOrderOwnerFromClient(opts: {
  actor: { id: string; role: UserRole | string } | null;
  clientOwnerId: string | null;
  currentOwnerId: string | null;
}): string | null {
  if (!opts.clientOwnerId) return opts.currentOwnerId;
  if (opts.actor?.role === UserRole.MANAGER && opts.clientOwnerId !== opts.actor.id) {
    return opts.currentOwnerId;
  }
  return opts.clientOwnerId;
}

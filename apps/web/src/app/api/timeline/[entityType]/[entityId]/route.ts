import { proxyTimelineToBackend } from "@/lib/api/timeline-proxy";

export async function GET(
  req: Request,
  ctx: { params: Promise<{ entityType: string; entityId: string }> },
) {
  const { entityType, entityId } = await ctx.params;
  return proxyTimelineToBackend(req, entityType, entityId);
}

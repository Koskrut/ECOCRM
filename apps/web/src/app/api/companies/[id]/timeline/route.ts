import { proxyTimelineToBackend } from "@/lib/api/timeline-proxy";

export async function GET(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  return proxyTimelineToBackend(req, "company", id);
}

import { Injectable } from "@nestjs/common";
import { RINGOSTAT_PROVIDER } from "../integrations/ringostat/ringostat-ingest.service";
import { PrismaService } from "../prisma/prisma.service";

const OUTBOUND = "OUTBOUND";
/** Вузьке вікно зменшує false positives; пізній webhook може потребувати повторного лінку в Phase 2. */
const PRE_START_MS = 2 * 60 * 1000;
const POST_END_MS = 15 * 60 * 1000;

@Injectable()
export class ManualCallingRingostatLinkService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * Best-effort: один Call на сесію — найближчий за часом до anchorAt серед кандидатів.
   */
  async tryLinkSessionToCall(params: {
    userId: string;
    targetPhoneNormalized: string | null;
    anchorAt: Date;
  }): Promise<string | null> {
    const phone = params.targetPhoneNormalized?.replace(/\D/g, "") ?? "";
    if (!phone || !params.userId) return null;

    const from = new Date(params.anchorAt.getTime() - PRE_START_MS);
    const to = new Date(params.anchorAt.getTime() + POST_END_MS);

    const candidates = await this.prisma.call.findMany({
      where: {
        provider: RINGOSTAT_PROVIDER,
        managerUserId: params.userId,
        direction: OUTBOUND,
        startedAt: { gte: from, lte: to },
      },
      select: { id: true, startedAt: true, fromNormalized: true, toNormalized: true },
      take: 40,
      orderBy: { startedAt: "desc" },
    });

    const normalizedCandidates = candidates.filter((c) =>
      this.rowMatchesPhone(c, phone),
    );
    if (normalizedCandidates.length === 0) return null;

    let best = normalizedCandidates[0]!;
    let bestDelta = Math.abs(best.startedAt.getTime() - params.anchorAt.getTime());
    for (const c of normalizedCandidates.slice(1)) {
      const d = Math.abs(c.startedAt.getTime() - params.anchorAt.getTime());
      if (d < bestDelta) {
        best = c;
        bestDelta = d;
      }
    }
    return best.id;
  }

  private rowMatchesPhone(
    row: { fromNormalized: string | null; toNormalized: string | null },
    digits: string,
  ): boolean {
    const norm = (s: string | null) => (s ?? "").replace(/\D/g, "");
    const f = norm(row.fromNormalized);
    const t = norm(row.toNormalized);
    return f.includes(digits) || t.includes(digits) || f.endsWith(digits) || t.endsWith(digits);
  }
}

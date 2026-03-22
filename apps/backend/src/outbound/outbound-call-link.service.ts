import { Injectable, Logger } from "@nestjs/common";
import { PrismaService } from "../prisma/prisma.service";

@Injectable()
export class OutboundCallLinkService {
  private readonly logger = new Logger(OutboundCallLinkService.name);

  constructor(private readonly prisma: PrismaService) {}

  /**
   * Link OutboundCallAttempt.callId when webhook carries telephony external id (e.g. Ringostat row).
   * Does not modify Ringostat ingest.
   */
  async linkAttemptToCallIfPresent(
    attemptId: string,
    externalCallId: string | undefined,
    callProvider: string | undefined,
  ): Promise<void> {
    const ext = externalCallId?.trim();
    if (!ext) return;

    const provider = (callProvider?.trim() || "RINGOSTAT").toUpperCase();

    const attempt = await this.prisma.outboundCallAttempt.findUnique({
      where: { id: attemptId },
      select: { callId: true },
    });
    if (!attempt) return;
    if (attempt.callId) return;

    const call = await this.prisma.call.findUnique({
      where: {
        provider_externalId: {
          provider,
          externalId: ext,
        },
      },
      select: { id: true },
    });

    if (!call) {
      this.logger.warn(`Outbound link: no Call for provider=${provider} externalId=${ext}`);
      return;
    }

    await this.prisma.outboundCallAttempt.update({
      where: { id: attemptId },
      data: { callId: call.id },
    });
  }
}

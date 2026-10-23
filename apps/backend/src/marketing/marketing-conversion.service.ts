import { Injectable, Logger } from "@nestjs/common";
import { Prisma } from "@prisma/client";
import { PrismaService } from "../prisma/prisma.service";
import { sendGoogleOutcome } from "./adapters/google.adapter";
import { sendMetaOutcome } from "./adapters/meta.adapter";
import { sendTikTokOutcome } from "./adapters/tiktok.adapter";
import { CabinetAuthError, type OutcomeEvent } from "./adapters/types";
import { MarketingAccountService } from "./marketing-account.service";
import { MarketingAttributionService } from "./marketing-attribution.service";
import { hashEmailForAds, hashOptionalName, hashPhoneForAds } from "./marketing-hash";
import { decideNewLead, decidePurchase, decideQualitySignal } from "./marketing-signals";

const RETRY_MS = [15, 30, 60, 120, 240].map((minutes) => minutes * 60_000);

@Injectable()
export class MarketingConversionService {
  private readonly logger = new Logger(MarketingConversionService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly accounts: MarketingAccountService,
    private readonly attribution: MarketingAttributionService,
  ) {}

  async rememberDirect(
    leadId: string,
    referral: { adId?: string | null; campaignId?: string | null; adsetId?: string | null; adName?: string | null },
  ): Promise<void> {
    await this.attribution.rememberDirect(leadId, referral);
    await this.syncLead(leadId);
  }

  async onLeadChanged(leadId: string): Promise<void> {
    await this.attribution.attributeLead(leadId);
    await this.syncLead(leadId);
  }

  async syncLead(leadId: string): Promise<void> {
    const lead = await this.prisma.lead.findUnique({
      where: { id: leadId },
      include: { marketingTouch: true },
    });
    if (!lead?.marketingTouch) return;
    const touch = lead.marketingTouch;
    const flags = await this.accounts.flags();
    const qualityKey = `quality:${lead.id}`;
    const existing = await this.prisma.marketingConversion.findUnique({ where: { idempotencyKey: qualityKey } });
    const decision = decideQualitySignal({
      countsTowardAds: touch.countsTowardAds,
      status: lead.status,
      lostAsJunk: flags.lostAsJunk,
      existing: existing ? { status: existing.status, kind: existing.kind } : null,
    });

    if (decision.action === "cancel") {
      if (existing) {
        await this.prisma.marketingConversion.update({
          where: { id: existing.id },
          data: { status: "SKIPPED", skippedReason: decision.reason, retract: false },
        });
      }
    } else if (
      decision.action === "skip" &&
      decision.reason === "lost_not_junk" &&
      !existing &&
      touch.platform &&
      touch.platform !== "OTHER"
    ) {
      try {
        await this.prisma.marketingConversion.create({
          data: {
            platform: touch.platform,
            kind: "JUNK",
            status: "SKIPPED",
            idempotencyKey: qualityKey,
            leadId: lead.id,
            skippedReason: "lost_not_junk",
          },
        });
      } catch (error) {
        if (!(error instanceof Prisma.PrismaClientKnownRequestError) || error.code !== "P2002") throw error;
      }
    } else if (decision.action === "enqueue" && touch.platform && touch.platform !== "OTHER") {
      if (decision.retract) {
        await this.prisma.marketingConversion.update({
          where: { idempotencyKey: qualityKey },
          data: { status: "SKIPPED", skippedReason: "lost_not_junk", kind: "JUNK", retract: true },
        });
      } else {
        await this.prisma.marketingConversion.upsert({
          where: { idempotencyKey: qualityKey },
          create: {
            platform: touch.platform,
            kind: decision.kind,
            status: "PENDING",
            idempotencyKey: qualityKey,
            leadId: lead.id,
            retract: false,
          },
          update: {
            platform: touch.platform,
            kind: decision.kind,
            status: "PENDING",
            valueAmount: null,
            valueCurrency: null,
            sentAt: null,
            nextAttemptAt: null,
            skippedReason: null,
            lastError: null,
            retract: false,
          },
        });
      }
    }

    const leadKey = `lead:${lead.id}`;
    const leadRow = await this.prisma.marketingConversion.findUnique({ where: { idempotencyKey: leadKey } });
    const newLead = decideNewLead({
      countsTowardAds: touch.countsTowardAds,
      resolvedFrom: touch.resolvedFrom,
      hasClick: Boolean(touch.clickId),
      alreadyQueued: Boolean(leadRow),
    });
    if (newLead === "enqueue" && touch.platform && touch.platform !== "OTHER") {
      try {
        await this.prisma.marketingConversion.create({
          data: {
            platform: touch.platform,
            kind: "LEAD",
            status: "PENDING",
            idempotencyKey: leadKey,
            leadId: lead.id,
          },
        });
      } catch (error) {
        if (!(error instanceof Prisma.PrismaClientKnownRequestError) || error.code !== "P2002") throw error;
      }
    }
  }

  /** Queue outcomes for ad leads that never went through a status change after this module existed. */
  async syncBackfill(limit = 200): Promise<number> {
    const flags = await this.accounts.flags();
    const leads = await this.prisma.lead.findMany({
      where: {
        OR: [
          {
            AND: [
              { marketingTouch: { countsTowardAds: true } },
              { marketingConversions: { none: {} } },
              {
                OR: [
                  { status: { in: ["WON", "LOST", "SPAM", "NOT_TARGET"] } },
                  {
                    marketingTouch: {
                      clickId: { not: null },
                      resolvedFrom: { notIn: ["meta_form", "meta_direct"] },
                    },
                  },
                ],
              },
            ],
          },
          ...(flags.lostAsJunk
            ? [{ marketingConversions: { some: { status: "SKIPPED" as const, skippedReason: "lost_not_junk" } } }]
            : []),
        ],
      },
      select: { id: true },
      orderBy: { createdAt: "desc" },
      take: limit,
    });
    for (const lead of leads) {
      try {
        await this.syncLead(lead.id);
      } catch (error) {
        this.logger.warn(`sync ${lead.id}: ${error instanceof Error ? error.message : String(error)}`);
      }
    }
    return leads.length;
  }

  async scanPayments(): Promise<number> {
    const flags = await this.accounts.flags();
    const since = new Date(Date.now() - 120 * 86_400_000);
    const touches = await this.prisma.marketingLeadTouch.findMany({
      where: {
        countsTowardAds: true,
        platform: { in: ["META", "GOOGLE", "TIKTOK"] },
        lead: { convertedOrderId: { not: null }, createdAt: { gte: since } },
      },
      include: {
        lead: { select: { id: true, createdAt: true, convertedOrderId: true } },
      },
    });
    const orderToLead = new Map<string, { leadId: string; createdAt: Date; platform: "META" | "GOOGLE" | "TIKTOK" }>();
    for (const touch of touches) {
      if (!touch.lead.convertedOrderId || !touch.platform || touch.platform === "OTHER") continue;
      orderToLead.set(touch.lead.convertedOrderId, {
        leadId: touch.lead.id,
        createdAt: touch.lead.createdAt,
        platform: touch.platform,
      });
    }
    if (orderToLead.size === 0) return 0;
    const payments = await this.prisma.payment.findMany({
      where: {
        orderId: { in: [...orderToLead.keys()] },
        status: "COMPLETED",
        sourceType: { in: ["BANK", "CASH", "ONE_C"] },
      },
      select: { id: true, orderId: true, amount: true, currency: true, paidAt: true, sourceType: true, status: true },
    });
    let queued = 0;
    for (const payment of payments) {
      const lead = orderToLead.get(payment.orderId);
      if (!lead) continue;
      const existing = await this.prisma.marketingConversion.findUnique({
        where: { idempotencyKey: `purchase:${payment.id}` },
      });
      const decision = decidePurchase({
        sourceType: payment.sourceType,
        status: payment.status,
        paidAt: payment.paidAt,
        leadCreatedAt: lead.createdAt,
        windowDays: flags.paymentWindowDays,
        alreadySent: Boolean(existing),
      });
      if (decision !== "enqueue") continue;
      try {
        await this.prisma.marketingConversion.create({
          data: {
            platform: lead.platform,
            kind: "PURCHASE",
            status: "PENDING",
            idempotencyKey: `purchase:${payment.id}`,
            leadId: lead.leadId,
            paymentId: payment.id,
            valueAmount: new Prisma.Decimal(payment.amount.toString()),
            valueCurrency: payment.currency,
          },
        });
        queued += 1;
      } catch (error) {
        if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") continue;
        throw error;
      }
    }
    return queued;
  }

  async deliverDue(): Promise<void> {
    const due = await this.prisma.marketingConversion.findMany({
      where: {
        status: "PENDING",
        OR: [{ nextAttemptAt: null }, { nextAttemptAt: { lte: new Date() } }],
      },
      orderBy: { createdAt: "asc" },
      take: 40,
      include: {
        lead: { select: { id: true, phone: true, email: true, firstName: true, lastName: true, city: true } },
      },
    });
    for (const row of due) {
      try {
        if (row.retract) {
          await this.prisma.marketingConversion.update({
            where: { id: row.id },
            data: { status: "SKIPPED", skippedReason: "lost_not_junk" },
          });
          continue;
        }
        const touch = row.leadId
          ? await this.prisma.marketingLeadTouch.findUnique({ where: { leadId: row.leadId } })
          : null;
        const person = {
          phoneHash: hashPhoneForAds(row.lead?.phone),
          emailHash: hashEmailForAds(row.lead?.email),
          firstNameHash: hashOptionalName(row.lead?.firstName),
          lastNameHash: hashOptionalName(row.lead?.lastName),
          cityHash: hashOptionalName(row.lead?.city),
        };
        const clickId = touch?.clickId ?? null;
        if (!person.phoneHash && !person.emailHash && !clickId) {
          await this.prisma.marketingConversion.update({
            where: { id: row.id },
            data: { status: "SKIPPED", skippedReason: "no_contact" },
          });
          continue;
        }
        if (row.platform === "GOOGLE" && !clickId) {
          await this.prisma.marketingConversion.update({
            where: { id: row.id },
            data: { status: "SKIPPED", skippedReason: "no_click" },
          });
          continue;
        }
        const cabinet = (await this.accounts.connected()).find(
          (item) => item.platform === row.platform && item.status === "CONNECTED" && item.hasKey,
        );
        if (!cabinet) throw new CabinetAuthError();
        const event: OutcomeEvent = {
          kind: row.kind,
          eventId: row.idempotencyKey,
          eventTime: row.createdAt,
          clickId,
          valueAmount: row.kind === "PURCHASE" && row.valueAmount != null ? Number(row.valueAmount) : null,
          valueCurrency: row.kind === "PURCHASE" ? row.valueCurrency : null,
          person,
        };
        const externalEventId =
          row.platform === "META"
            ? await sendMetaOutcome(cabinet.secrets, event)
            : row.platform === "GOOGLE"
              ? await sendGoogleOutcome(cabinet.secrets, event)
              : await sendTikTokOutcome(cabinet.secrets, event);
        await this.prisma.marketingConversion.update({
          where: { id: row.id },
          data: { status: "SENT", externalEventId, sentAt: new Date(), lastError: null },
        });
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        if (error instanceof CabinetAuthError && row.platform) {
          const cabinet = (await this.accounts.connected()).find((item) => item.platform === row.platform);
          if (cabinet) await this.accounts.markReconnect(cabinet.platform, cabinet.externalAccountId);
        }
        const attemptCount = row.attemptCount + 1;
        const failed = attemptCount >= RETRY_MS.length;
        await this.prisma.marketingConversion.update({
          where: { id: row.id },
          data: {
            attemptCount,
            lastError: message,
            status: failed ? "FAILED" : "PENDING",
            nextAttemptAt: failed ? null : new Date(Date.now() + (RETRY_MS[attemptCount - 1] ?? RETRY_MS.at(-1)!)),
          },
        });
        this.logger.warn(`outbox ${row.idempotencyKey}: ${message}`);
      }
    }
  }
}

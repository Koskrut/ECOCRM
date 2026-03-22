import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import { OutboundAttemptStatus, OutboundTargetType, type Prisma } from "@prisma/client";
import type { ReviewAttemptDto } from "./dto/review-attempt.dto";
import { PrismaService } from "../prisma/prisma.service";
import { getPhoneNormalizedDigits } from "../common/phone.utils";
import type { CreateOutboundCampaignDto } from "./dto/create-outbound-campaign.dto";
import type { EnqueueDormantDto } from "./dto/enqueue-dormant.dto";
import { ScenarioRegistryService } from "./scenarios/scenario-registry.service";
import type { ScenarioCode } from "./scenarios/scenario.types";
import { OutboundComplianceService } from "./outbound-compliance.service";
import { leadQualificationScenario } from "./scenarios/lead-qualification.scenario";
import { dormantReactivationScenario } from "./scenarios/dormant-reactivation.scenario";

@Injectable()
export class OutboundCampaignService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly scenarios: ScenarioRegistryService,
    private readonly compliance: OutboundComplianceService,
  ) {}

  async createCampaign(dto: CreateOutboundCampaignDto) {
    const version =
      dto.scenarioVersion?.trim() ||
      this.scenarios.getLatest(dto.scenarioCode as ScenarioCode).version;
    this.scenarios.resolve(dto.scenarioCode, version);

    if (dto.targetType === OutboundTargetType.LEAD && dto.scenarioCode !== leadQualificationScenario.code) {
      throw new BadRequestException(
        `LEAD campaigns must use scenario ${leadQualificationScenario.code}`,
      );
    }
    if (
      dto.targetType === OutboundTargetType.CONTACT_DORMANT &&
      dto.scenarioCode !== dormantReactivationScenario.code
    ) {
      throw new BadRequestException(
        `CONTACT_DORMANT campaigns must use scenario ${dormantReactivationScenario.code}`,
      );
    }

    return this.prisma.outboundCampaign.create({
      data: {
        name: dto.name.trim(),
        targetType: dto.targetType,
        scenarioCode: dto.scenarioCode.trim(),
        scenarioVersion: version,
        isActive: dto.isActive ?? true,
        config: (dto.config ?? undefined) as Prisma.InputJsonValue | undefined,
      },
    });
  }

  listCampaigns() {
    return this.prisma.outboundCampaign.findMany({
      orderBy: { createdAt: "desc" },
      include: { _count: { select: { attempts: true } } },
    });
  }

  async listCampaignsWithStats() {
    const [campaigns, stats] = await Promise.all([
      this.prisma.outboundCampaign.findMany({
        orderBy: { createdAt: "desc" },
        include: { _count: { select: { attempts: true } } },
      }),
      this.prisma.outboundCallAttempt.groupBy({
        by: ["campaignId", "status"],
        _count: { id: true },
      }),
    ]);
    const statsMap = new Map<string, Record<string, number>>();
    for (const s of stats) {
      if (!statsMap.has(s.campaignId)) statsMap.set(s.campaignId, {});
      statsMap.get(s.campaignId)![s.status] = s._count.id;
    }
    return campaigns.map((c) => ({ ...c, statsByStatus: statsMap.get(c.id) ?? {} }));
  }

  async listAttempts(query: {
    page?: number;
    pageSize?: number;
    campaignId?: string;
    status?: string;
    scenarioCode?: string;
    needsReview?: boolean;
    callLinked?: boolean;
  }) {
    const page = Math.max(1, query.page ?? 1);
    const pageSize = Math.min(100, Math.max(1, query.pageSize ?? 30));
    const skip = (page - 1) * pageSize;
    const statuses = query.status
      ? (query.status.split(",").filter(Boolean) as OutboundAttemptStatus[])
      : undefined;

    const where: Prisma.OutboundCallAttemptWhereInput = {
      ...(query.campaignId && { campaignId: query.campaignId }),
      ...(statuses?.length && { status: { in: statuses } }),
      ...(query.scenarioCode && { scenarioCode: query.scenarioCode }),
      ...(query.callLinked === true && { callId: { not: null } }),
      ...(query.callLinked === false && { callId: null }),
      ...(query.needsReview === true && {
        outcome: { path: ["analysis", "needsReview"], equals: true } as object,
      }),
    };

    const [items, total] = await Promise.all([
      this.prisma.outboundCallAttempt.findMany({
        where,
        skip,
        take: pageSize,
        orderBy: { updatedAt: "desc" },
        include: {
          campaign: { select: { id: true, name: true, targetType: true } },
          lead: {
            select: {
              id: true,
              firstName: true,
              lastName: true,
              fullName: true,
              phone: true,
              status: true,
              source: true,
            },
          },
          contact: {
            select: { id: true, firstName: true, lastName: true, phone: true },
          },
        },
      }),
      this.prisma.outboundCallAttempt.count({ where }),
    ]);
    return { items, total, page, pageSize };
  }

  async getAttemptById(id: string) {
    return this.prisma.outboundCallAttempt.findUnique({
      where: { id },
      include: {
        campaign: true,
        lead: {
          select: {
            id: true,
            firstName: true,
            lastName: true,
            fullName: true,
            phone: true,
            status: true,
            source: true,
            message: true,
            ownerId: true,
            owner: { select: { id: true, fullName: true } },
          },
        },
        contact: {
          select: {
            id: true,
            firstName: true,
            lastName: true,
            phone: true,
            email: true,
            status: true,
            ownerId: true,
            owner: { select: { id: true, fullName: true } },
          },
        },
        call: {
          select: {
            id: true,
            provider: true,
            externalId: true,
            direction: true,
            startedAt: true,
            endedAt: true,
            durationSec: true,
            status: true,
            recordingUrl: true,
          },
        },
      },
    });
  }

  async setCampaignActive(id: string, isActive: boolean) {
    await this.prisma.outboundCampaign.findUniqueOrThrow({ where: { id } });
    return this.prisma.outboundCampaign.update({
      where: { id },
      data: { isActive },
    });
  }

  async enqueueLeads(campaignId: string, leadIds: string[]) {
    const campaign = await this.prisma.outboundCampaign.findUniqueOrThrow({
      where: { id: campaignId },
    });
    if (campaign.targetType !== OutboundTargetType.LEAD) {
      throw new BadRequestException("Campaign is not a LEAD campaign");
    }
    if (!campaign.isActive) {
      throw new BadRequestException("Campaign is not active");
    }

    const scheduledAt = new Date();
    let created = 0;
    for (const leadId of leadIds) {
      const lead = await this.prisma.lead.findUnique({
        where: { id: leadId },
        select: {
          id: true,
          phone: true,
          phoneNormalized: true,
          companyId: true,
        },
      });
      if (!lead) continue;
      const digits = getPhoneNormalizedDigits(lead.phone ?? lead.phoneNormalized ?? "");
      if (!digits) continue;

      await this.prisma.outboundCallAttempt.create({
        data: {
          campaignId: campaign.id,
          targetType: OutboundTargetType.LEAD,
          leadId: lead.id,
          companyId: lead.companyId,
          phoneNormalized: digits,
          scenarioCode: campaign.scenarioCode,
          scenarioVersion: campaign.scenarioVersion,
          status: OutboundAttemptStatus.PENDING,
          scheduledAt,
        },
      });
      created += 1;
    }
    return { created, requested: leadIds.length };
  }

  async enqueueDormant(campaignId: string, dto: EnqueueDormantDto) {
    const campaign = await this.prisma.outboundCampaign.findUniqueOrThrow({
      where: { id: campaignId },
    });
    if (campaign.targetType !== OutboundTargetType.CONTACT_DORMANT) {
      throw new BadRequestException("Campaign is not CONTACT_DORMANT");
    }
    if (!campaign.isActive) {
      throw new BadRequestException("Campaign is not active");
    }

    const cfg = this.compliance.parseCampaignConfig(campaign);
    const dormantDays = dto.dormantDaysMin ?? cfg.dormantDaysMin ?? 90;
    const limit = dto.limit ?? 100;
    const scheduledAt = new Date();

    let contactIds: string[];
    if (dto.contactIds?.length) {
      contactIds = dto.contactIds;
    } else {
      const cutoff = new Date(Date.now() - dormantDays * 86_400_000);
      const rows = await this.prisma.$queryRaw<{ clientId: string }[]>`
        SELECT o."clientId" AS "clientId"
        FROM "Order" o
        INNER JOIN "Contact" c ON c.id = o."clientId"
        WHERE o."clientId" IS NOT NULL
          AND c."marketingCallOptOut" = false
        GROUP BY o."clientId"
        HAVING MAX(o."createdAt") < ${cutoff}
        LIMIT ${limit}
      `;
      contactIds = rows.map((r) => r.clientId);
    }

    let created = 0;
    for (const contactId of contactIds) {
      const contact = await this.prisma.contact.findUnique({
        where: { id: contactId },
        select: {
          id: true,
          phone: true,
          phoneNormalized: true,
          companyId: true,
          marketingCallOptOut: true,
        },
      });
      if (!contact || !this.compliance.canCallContact(contact)) continue;
      const digits = getPhoneNormalizedDigits(contact.phone ?? contact.phoneNormalized ?? "");
      if (!digits) continue;

      await this.prisma.outboundCallAttempt.create({
        data: {
          campaignId: campaign.id,
          targetType: OutboundTargetType.CONTACT_DORMANT,
          contactId: contact.id,
          companyId: contact.companyId,
          phoneNormalized: digits,
          scenarioCode: campaign.scenarioCode,
          scenarioVersion: campaign.scenarioVersion,
          status: OutboundAttemptStatus.PENDING,
          scheduledAt,
        },
      });
      created += 1;
    }
    return { created, discovered: contactIds.length };
  }

  async getCampaignOrThrow(id: string) {
    const c = await this.prisma.outboundCampaign.findUnique({ where: { id } });
    if (!c) throw new NotFoundException("Campaign not found");
    return c;
  }

  async reviewAttempt(id: string, dto: ReviewAttemptDto) {
    const attempt = await this.prisma.outboundCallAttempt.findUnique({ where: { id } });
    if (!attempt) throw new NotFoundException("Attempt not found");

    const currentOutcome = (attempt.outcome ?? {}) as Record<string, unknown>;
    const currentAnalysis = (currentOutcome.analysis ?? {}) as Record<string, unknown>;

    const newAnalysis: Record<string, unknown> = { ...currentAnalysis };
    if (dto.markReviewed) {
      newAnalysis.needsReview = false;
      newAnalysis.reviewedAt = new Date().toISOString();
    }

    const newOutcome: Record<string, unknown> = {
      ...currentOutcome,
      analysis: newAnalysis,
    };

    if (dto.managerNote !== undefined) {
      newOutcome.managerNote = dto.managerNote.trim() || null;
    }

    if (dto.overrideOutcomeKey) {
      const scenario = this.scenarios.resolve(attempt.scenarioCode, attempt.scenarioVersion);
      const mapping = this.scenarios.findOutcomeMapping(scenario, dto.overrideOutcomeKey);
      if (!mapping) {
        throw new BadRequestException(
          `Unknown outcomeKey "${dto.overrideOutcomeKey}" for scenario ${attempt.scenarioCode}`,
        );
      }
      newOutcome.outcomeKey = dto.overrideOutcomeKey;
      newOutcome.bucket = mapping.crm.bucket;
      newAnalysis.needsReview = false;
      newAnalysis.reviewedAt = new Date().toISOString();
      newOutcome.analysis = newAnalysis;
    }

    return this.prisma.outboundCallAttempt.update({
      where: { id },
      data: { outcome: newOutcome as Prisma.InputJsonValue },
    });
  }
}

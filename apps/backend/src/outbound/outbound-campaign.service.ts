import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import { OutboundAttemptStatus, OutboundTargetType, type Prisma } from "@prisma/client";
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
}

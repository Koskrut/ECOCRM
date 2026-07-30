import { BadRequestException, Injectable } from "@nestjs/common";
import { LeadEventType, LeadSource, type Prisma } from "@prisma/client";
import { getPhoneNormalizedDigits, normalizePhoneToE164 } from "../../common/phone.utils";
import { PrismaService } from "../../prisma/prisma.service";
import type { CreateStoreLeadDto } from "./dto/create-store-lead.dto";

@Injectable()
export class StoreLeadsService {
  constructor(private readonly prisma: PrismaService) {}

  async createLead(dto: CreateStoreLeadDto) {
    const companyId =
      (process.env.STORE_LEAD_COMPANY_ID as string) ||
      (process.env.META_LEAD_COMPANY_ID as string) ||
      (await this.prisma.company.findFirst({ select: { id: true } }))?.id;
    if (!companyId) {
      throw new BadRequestException(
        "No company for store leads: set STORE_LEAD_COMPANY_ID or create a company",
      );
    }

    const phone = dto.phone?.trim();
    const email = dto.email?.trim();
    const phoneCanonical = phone ? normalizePhoneToE164(phone) : null;
    if (!phone || !phoneCanonical) {
      throw new BadRequestException("Вкажіть телефон");
    }
    if (!dto.consent) {
      throw new BadRequestException("Потрібна згода на обробку персональних даних");
    }

    const phoneNormalized = getPhoneNormalizedDigits(phone);

    const sourceMeta: Prisma.InputJsonValue = {
      intake: "store_public_form",
      formType: dto.formType,
      roleSegment: dto.roleSegment ?? null,
      consent: dto.consent,
      attribution: (dto.attribution ?? null) as unknown as Prisma.InputJsonValue,
      capturedAt: new Date().toISOString(),
    };

    const lead = await this.prisma.lead.create({
      data: {
        companyId,
        status: "NEW",
        source: LeadSource.WEBSITE,
        name: dto.name.trim(),
        phone: phoneCanonical,
        phoneNormalized,
        email: email || null,
        companyName: dto.company?.trim() || null,
        message: dto.message?.trim() || null,
        sourceMeta,
      },
      select: { id: true, createdAt: true },
    });

    await this.prisma.leadEvent.create({
      data: {
        leadId: lead.id,
        type: LeadEventType.CREATED,
        message: "Lead created from SUPREX public website form",
        payload: sourceMeta,
      },
    });

    return {
      ok: true as const,
      leadId: lead.id,
      createdAt: lead.createdAt,
      sourceMetaStored: true,
    };
  }
}

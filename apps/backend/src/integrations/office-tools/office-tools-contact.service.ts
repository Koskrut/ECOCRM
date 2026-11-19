import { Injectable, Logger } from "@nestjs/common";
import { PrismaService } from "../../prisma/prisma.service";
import {
  officeToolsCreateComp,
  officeToolsListComps,
} from "./office-tools-client";
import { OfficeToolsConfigService } from "./office-tools-config.service";
import { OFFICE_TOOLS_ENTITY } from "./office-tools.constants";
import { OfficeToolsApiError } from "./office-tools.types";
import {
  buildCompCreateBody,
  extractCompIdentity,
  toInt,
} from "./office-tools.util";

@Injectable()
export class OfficeToolsContactService {
  private readonly logger = new Logger(OfficeToolsContactService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly config: OfficeToolsConfigService,
  ) {}

  /** After CRM contact create: push to OT and store CompID + Code on contact.externalCode. */
  async pushContactAfterCreate(contactId: string): Promise<void> {
    if (!(await this.config.isActive())) return;
    try {
      await this.ensureContactLinked(contactId);
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      this.logger.warn(`Office Tools contact push failed for ${contactId}: ${message}`);
      await this.prisma.officeToolsLink.upsert({
        where: {
          entityType_entityId: {
            entityType: OFFICE_TOOLS_ENTITY.CONTACT,
            entityId: contactId,
          },
        },
        create: {
          entityType: OFFICE_TOOLS_ENTITY.CONTACT,
          entityId: contactId,
          externalId: `pending:${contactId}`,
          lastError: message.slice(0, 2000),
        },
        update: {
          lastError: message.slice(0, 2000),
        },
      });
    }
  }

  async ensureContactLinked(contactId: string): Promise<{
    compId: number;
    code: string | null;
  }> {
    const cfg = await this.config.requireActiveConfig();
    const contact = await this.prisma.contact.findUnique({
      where: { id: contactId },
      select: {
        id: true,
        firstName: true,
        lastName: true,
        middleName: true,
        phone: true,
        documentDisplayName: true,
        city: true,
        address: true,
        externalCode: true,
      },
    });
    if (!contact) throw new Error(`Contact ${contactId} not found`);

    const existing = await this.prisma.officeToolsLink.findUnique({
      where: {
        entityType_entityId: {
          entityType: OFFICE_TOOLS_ENTITY.CONTACT,
          entityId: contactId,
        },
      },
    });
    if (existing) {
      const existingCompId = toInt(existing.externalId);
      if (existingCompId != null && existingCompId > 0 && !existing.lastError) {
        return { compId: existingCompId, code: existing.externalCode ?? contact.externalCode };
      }
    }

    const body = buildCompCreateBody(contact);
    let compId: number | null = null;
    let code: string | null = null;

    try {
      const { httpStatus, envelope } = await officeToolsCreateComp(cfg.baseUrl, body);
      if (httpStatus === 422 || envelope.status === "failed") {
        const found = await this.findCompByPhoneOrName(cfg.baseUrl, contact.phone, String(body.CompName));
        compId = found.compId;
        code = found.code;
        if (compId == null) {
          throw new OfficeToolsApiError(
            envelope.error || "Duplicate counterparty and lookup failed",
            422,
            envelope,
          );
        }
      } else if (httpStatus < 200 || httpStatus >= 300) {
        throw new OfficeToolsApiError(
          envelope.error || `comps/create HTTP ${httpStatus}`,
          httpStatus,
          envelope,
        );
      } else {
        const identity = extractCompIdentity(
          envelope.result as Parameters<typeof extractCompIdentity>[0],
        );
        compId = identity.compId;
        code = identity.code;
        if (compId == null) {
          const found = await this.findCompByPhoneOrName(
            cfg.baseUrl,
            contact.phone,
            String(body.CompName),
          );
          compId = found.compId;
          code = found.code ?? code;
        }
      }
    } catch (err) {
      if (err instanceof OfficeToolsApiError && err.statusCode === 422) {
        const found = await this.findCompByPhoneOrName(cfg.baseUrl, contact.phone, String(body.CompName));
        if (found.compId == null) throw err;
        compId = found.compId;
        code = found.code;
      } else {
        throw err;
      }
    }

    if (compId == null) {
      throw new Error("Office Tools did not return CompID for counterparty");
    }

    const codeToStore = code?.trim() || null;
    if (codeToStore && !contact.externalCode?.trim()) {
      await this.prisma.contact.update({
        where: { id: contactId },
        data: { externalCode: codeToStore },
      });
    }

    await this.prisma.officeToolsLink.upsert({
      where: {
        entityType_entityId: {
          entityType: OFFICE_TOOLS_ENTITY.CONTACT,
          entityId: contactId,
        },
      },
      create: {
        entityType: OFFICE_TOOLS_ENTITY.CONTACT,
        entityId: contactId,
        externalId: String(compId),
        externalCode: codeToStore,
        lastError: null,
        lastSyncedAt: new Date(),
      },
      update: {
        externalId: String(compId),
        externalCode: codeToStore ?? undefined,
        lastError: null,
        lastSyncedAt: new Date(),
      },
    });

    return { compId, code: codeToStore };
  }

  private async findCompByPhoneOrName(
    baseUrl: string,
    phone: string,
    name: string,
  ): Promise<{ compId: number | null; code: string | null }> {
    const phoneDigits = phone.replace(/\D/g, "");
    if (phoneDigits) {
      const byPhone = await officeToolsListComps(baseUrl, {
        SELECT: [],
        FILTER: { Phone1: { LIKE: `%${phoneDigits.slice(-10)}%` } },
        LIMIT: 5,
        OFFSET: 0,
      });
      if (byPhone[0]) {
        return extractCompIdentity(byPhone[0]);
      }
    }
    if (name.trim()) {
      const byName = await officeToolsListComps(baseUrl, {
        SELECT: [],
        FILTER: { CompName: { LIKE: `%${name.trim().slice(0, 40)}%` } },
        LIMIT: 5,
        OFFSET: 0,
      });
      if (byName[0]) {
        return extractCompIdentity(byName[0]);
      }
    }
    return { compId: null, code: null };
  }
}

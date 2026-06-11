import {
  BadRequestException,
  Injectable,
  Logger,
  ServiceUnavailableException,
} from "@nestjs/common";
import { PrismaService } from "../../prisma/prisma.service";
import { postKyivstarCallControl, postKyivstarOriginate } from "./kyivstar-fmc-api";
import {
  loadKyivstarFmcApiConfig,
  resolveOriginatorPhoneForUser,
} from "./kyivstar-fmc-config.util";
import { KYIVSTAR_FMC_PROVIDER } from "./kyivstar-fmc-ingest.service";

export type KyivstarFmcLiveCallDto = {
  id: string;
  externalId: string;
  status: string;
  direction: string;
  customerPhone: string;
  customerPhoneNormalized: string | null;
  callControlId: string | null;
  liveState: string | null;
  startedAt: string;
  contact: { id: string; name: string } | null;
  lead: { id: string; name: string } | null;
  company: { id: string; name: string } | null;
};

export type KyivstarFmcWorkspaceDto = {
  dial: { enabled: boolean; originatorPhone: string | null };
  liveCalls: KyivstarFmcLiveCallDto[];
};

@Injectable()
export class KyivstarFmcWorkspaceService {
  private readonly logger = new Logger(KyivstarFmcWorkspaceService.name);

  constructor(private readonly prisma: PrismaService) {}

  async getWorkspace(userId: string): Promise<KyivstarFmcWorkspaceDto> {
    const loaded = await loadKyivstarFmcApiConfig(this.prisma);
    if (!loaded) {
      return { dial: { enabled: false, originatorPhone: null }, liveCalls: [] };
    }

    const originatorPhone = resolveOriginatorPhoneForUser(
      loaded.stored.phonesToUserId ?? {},
      userId,
    );

    const since = new Date(Date.now() - 15 * 60_000);
    const rows = await this.prisma.call.findMany({
      where: {
        provider: KYIVSTAR_FMC_PROVIDER,
        managerUserId: userId,
        status: { in: ["RINGING", "IN_PROGRESS"] },
        startedAt: { gte: since },
      },
      orderBy: { startedAt: "desc" },
      take: 5,
    });

    const contactIds = [...new Set(rows.map((r) => r.contactId).filter(Boolean))] as string[];
    const leadIds = [...new Set(rows.map((r) => r.leadId).filter(Boolean))] as string[];
    const companyIds = [...new Set(rows.map((r) => r.companyId).filter(Boolean))] as string[];

    const [contacts, leads, companies] = await Promise.all([
      contactIds.length
        ? this.prisma.contact.findMany({
            where: { id: { in: contactIds } },
            select: { id: true, firstName: true, lastName: true },
          })
        : [],
      leadIds.length
        ? this.prisma.lead.findMany({
            where: { id: { in: leadIds } },
            select: { id: true, fullName: true, firstName: true, lastName: true },
          })
        : [],
      companyIds.length
        ? this.prisma.company.findMany({
            where: { id: { in: companyIds } },
            select: { id: true, name: true },
          })
        : [],
    ]);

    const contactById = new Map(contacts.map((c) => [c.id, c]));
    const leadById = new Map(leads.map((l) => [l.id, l]));
    const companyById = new Map(companies.map((c) => [c.id, c]));

    const liveCalls: KyivstarFmcLiveCallDto[] = rows.map((c) => {
      const meta = (c.meta ?? null) as {
        liveState?: unknown;
        callControlId?: unknown;
      } | null;
      const raw = (c.rawPayload ?? null) as { call_control_id?: unknown } | null;
      const callControlId =
        (typeof meta?.callControlId === "string" && meta.callControlId) ||
        (typeof raw?.call_control_id === "string" && raw.call_control_id) ||
        null;

      const contact = c.contactId ? contactById.get(c.contactId) : undefined;
      const lead = c.leadId ? leadById.get(c.leadId) : undefined;
      const company = c.companyId ? companyById.get(c.companyId) : undefined;

      const contactName = contact
        ? [contact.firstName, contact.lastName].filter(Boolean).join(" ").trim()
        : "";
      const leadName =
        lead?.fullName?.trim() ||
        [lead?.firstName, lead?.lastName].filter(Boolean).join(" ").trim() ||
        "";

      return {
        id: c.id,
        externalId: c.externalId,
        status: c.status,
        direction: c.direction,
        customerPhone: c.from,
        customerPhoneNormalized: c.fromNormalized,
        callControlId,
        liveState: typeof meta?.liveState === "string" ? meta.liveState : null,
        startedAt: c.startedAt.toISOString(),
        contact: contact ? { id: contact.id, name: contactName || c.from } : null,
        lead: lead ? { id: lead.id, name: leadName || c.from } : null,
        company: company ? { id: company.id, name: company.name } : null,
      };
    });

    return {
      dial: { enabled: !!originatorPhone, originatorPhone },
      liveCalls,
    };
  }

  async originate(userId: string, destination: string): Promise<{ callControlId: string | null }> {
    const loaded = await loadKyivstarFmcApiConfig(this.prisma);
    if (!loaded) {
      throw new BadRequestException("Kyivstar FMC integration is not enabled");
    }

    const originator = resolveOriginatorPhoneForUser(loaded.stored.phonesToUserId ?? {}, userId);
    if (!originator) {
      throw new BadRequestException(
        "Your Kyivstar line is not mapped. Ask admin to add your phone in Settings → Kyivstar FMC.",
      );
    }

    const dest = destination.trim();
    if (!dest) throw new BadRequestException("destination is required");

    const result = await postKyivstarOriginate(loaded.cfg, originator, dest);
    if (!result.ok) {
      this.logger.warn(`Kyivstar originate HTTP ${result.status}: ${result.bodySnippet}`);
      throw new ServiceUnavailableException(
        `Kyivstar originate failed (${result.status}): ${result.bodySnippet.slice(0, 200)}`,
      );
    }

    return { callControlId: result.callControlId };
  }

  async callControl(userId: string, callControlId: string, action: "clear"): Promise<void> {
    const loaded = await loadKyivstarFmcApiConfig(this.prisma);
    if (!loaded) {
      throw new BadRequestException("Kyivstar FMC integration is not enabled");
    }

    const id = callControlId.trim();
    if (!id) throw new BadRequestException("callControlId is required");

    const owned = await this.prisma.call.findFirst({
      where: {
        provider: KYIVSTAR_FMC_PROVIDER,
        managerUserId: userId,
        startedAt: { gte: new Date(Date.now() - 30 * 60_000) },
      },
      select: { id: true, meta: true, rawPayload: true },
    });

    const extractControlId = (row: { meta: unknown; rawPayload: unknown } | null): string | null => {
      if (!row) return null;
      const meta = row.meta as { callControlId?: unknown } | null;
      if (typeof meta?.callControlId === "string" && meta.callControlId === id) return id;
      const raw = row.rawPayload as { call_control_id?: unknown } | null;
      if (typeof raw?.call_control_id === "string" && raw.call_control_id === id) return id;
      return null;
    };

    const rows = await this.prisma.call.findMany({
      where: {
        provider: KYIVSTAR_FMC_PROVIDER,
        managerUserId: userId,
        startedAt: { gte: new Date(Date.now() - 30 * 60_000) },
      },
      select: { id: true, meta: true, rawPayload: true },
      take: 20,
    });
    const allowed = rows.some((r) => extractControlId(r) === id) || extractControlId(owned) === id;
    if (!allowed) {
      throw new BadRequestException("Call not found or not assigned to you");
    }

    const result = await postKyivstarCallControl(loaded.cfg, id, action);
    if (!result.ok) {
      throw new ServiceUnavailableException(
        `Kyivstar call control failed (${result.status}): ${result.bodySnippet.slice(0, 200)}`,
      );
    }
  }
}

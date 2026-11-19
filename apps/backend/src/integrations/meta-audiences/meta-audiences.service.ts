import { BadRequestException, ConflictException, Injectable, Logger } from "@nestjs/common";
import type { Prisma } from "@prisma/client";
import { PrismaService } from "../../prisma/prisma.service";
import { SettingsService } from "../../settings/settings.service";
import type { ExchangeRates } from "../../settings/settings.service";
import { applyMetaAudiencesPatch, parseStoredMetaAudiences, toPublicMetaAudiences } from "./meta-audience.config";
import type { MetaAudiencesPatch } from "./meta-audience.config";
import { createMetaAudienceGraph, type MetaAudienceGraph } from "./meta-audience.graph";
import { metaGraphApiVersion, sanitizeMetaError } from "./meta-audience.normalize";
import type { AudienceContactInput, AudienceLeadInput, AudienceOrderInput } from "./meta-audience.segments";
import { executeMetaAudienceSync } from "./meta-audience.sync";
import { META_AUDIENCES_SETTING_ID, type PublicMetaAudiences, type StoredMetaAudiences } from "./meta-audience.types";

const CONTACT_SELECT = {
  id: true,
  phone: true,
  phoneNormalized: true,
  email: true,
  firstName: true,
  lastName: true,
  marketingCallOptOut: true,
} as const;

function chunks<T>(items: T[], size: number): T[][] {
  const out: T[][] = [];
  for (let index = 0; index < items.length; index += size) out.push(items.slice(index, index + size));
  return out;
}

@Injectable()
export class MetaAudiencesService {
  private readonly logger = new Logger(MetaAudiencesService.name);
  private running = false;
  graph: MetaAudienceGraph = createMetaAudienceGraph();

  constructor(
    private readonly prisma: PrismaService,
    private readonly settings: SettingsService,
  ) {}

  async getPublic(): Promise<PublicMetaAudiences> {
    return toPublicMetaAudiences(await this.read());
  }

  async update(patch: MetaAudiencesPatch): Promise<PublicMetaAudiences> {
    const next = applyMetaAudiencesPatch(await this.read(), patch);
    await this.write(next);
    return toPublicMetaAudiences(next);
  }

  async sync(manual: boolean): Promise<PublicMetaAudiences> {
    if (this.running) {
      if (manual) throw new ConflictException("Синхронізація вже виконується");
      return this.getPublic();
    }
    this.running = true;
    try {
      const stored = await this.read();
      if (!stored.enabled) {
        if (manual) throw new BadRequestException("Синхронізація вимкнена");
        return toPublicMetaAudiences(stored);
      }
      if (!stored.adAccountId || !stored.accessToken) {
        if (manual) {
          throw new BadRequestException("Вкажіть рекламний акаунт і токен системного користувача");
        }
        return toPublicMetaAudiences(stored);
      }
      const now = new Date();
      const source = await this.loadSource();
      let rates: ExchangeRates | null = null;
      try {
        rates = await this.settings.getExchangeRates();
      } catch (error) {
        this.logger.warn(`exchange rates unavailable: ${sanitizeMetaError(error instanceof Error ? error.message : String(error))}`);
      }
      const updated = await executeMetaAudienceSync({
        stored,
        source: { ...source, now, rates },
        version: metaGraphApiVersion(),
        graph: this.graph,
        persist: (next) => this.write(next),
      });
      for (const key of Object.keys(updated.audiences) as Array<keyof StoredMetaAudiences["audiences"]>) {
        const row = updated.audiences[key];
        if (row.status === "error") {
          this.logger.warn(`meta audience ${key} error: ${row.error ?? ""}`);
        } else {
          this.logger.log(`meta audience ${key} ${row.status} crm=${row.crmCount ?? 0} meta=${row.metaReceived ?? "-"}`);
        }
      }
      return toPublicMetaAudiences(updated);
    } finally {
      this.running = false;
    }
  }

  private async read(): Promise<StoredMetaAudiences> {
    const row = await this.prisma.systemSetting.findUnique({ where: { id: META_AUDIENCES_SETTING_ID } });
    return parseStoredMetaAudiences(row?.value);
  }

  private async write(stored: StoredMetaAudiences): Promise<void> {
    const value = stored as unknown as Prisma.InputJsonValue;
    await this.prisma.systemSetting.upsert({
      where: { id: META_AUDIENCES_SETTING_ID },
      create: { id: META_AUDIENCES_SETTING_ID, value },
      update: { value },
    });
  }

  private async loadSource(): Promise<{
    orders: AudienceOrderInput[];
    contacts: AudienceContactInput[];
    leads: AudienceLeadInput[];
  }> {
    const orders = await this.prisma.order.findMany({
      where: { orderStage: "COMPLETED" },
      select: {
        id: true,
        clientId: true,
        contactId: true,
        orderStage: true,
        totalAmount: true,
        currency: true,
        debtAmount: true,
        updatedAt: true,
        statusHistory: {
          where: { toOrderStage: "COMPLETED" },
          orderBy: { createdAt: "desc" },
          take: 1,
          select: { createdAt: true },
        },
      },
    });

    const leads = await this.prisma.lead.findMany({
      where: {
        status: { notIn: ["SPAM", "NOT_TARGET"] },
        OR: [{ phone: { not: "" } }, { phoneNormalized: { not: "" } }],
      },
      select: {
        id: true,
        contactId: true,
        status: true,
        phone: true,
        phoneNormalized: true,
        email: true,
        firstName: true,
        lastName: true,
        name: true,
        fullName: true,
        updatedAt: true,
      },
    });

    const contactIds = new Set<string>();
    for (const order of orders) {
      if (order.clientId) contactIds.add(order.clientId);
      if (order.contactId) contactIds.add(order.contactId);
    }
    for (const lead of leads) {
      if (lead.contactId) contactIds.add(lead.contactId);
    }

    const optedOut = await this.prisma.contact.findMany({
      where: { marketingCallOptOut: true },
      select: CONTACT_SELECT,
    });
    const byId = new Map<string, AudienceContactInput>(optedOut.map((contact) => [contact.id, contact]));
    const missing = [...contactIds].filter((id) => !byId.has(id));
    for (const part of chunks(missing, 5000)) {
      const rows = await this.prisma.contact.findMany({
        where: { id: { in: part } },
        select: CONTACT_SELECT,
      });
      for (const contact of rows) byId.set(contact.id, contact);
    }

    return {
      orders: orders.map((order) => ({
        id: order.id,
        clientId: order.clientId,
        contactId: order.contactId,
        orderStage: order.orderStage,
        totalAmount: order.totalAmount,
        currency: order.currency,
        debtAmount: order.debtAmount,
        updatedAt: order.updatedAt,
        completedHistory: order.statusHistory.map((row) => row.createdAt),
      })),
      contacts: [...byId.values()],
      leads,
    };
  }
}

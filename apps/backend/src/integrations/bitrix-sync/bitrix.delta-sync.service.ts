import { Injectable, Logger } from "@nestjs/common";
import { Cron } from "@nestjs/schedule";
import { BitrixClient } from "./bitrix.client";
import { BITRIX_INTEGRATION, BitrixSyncStateService } from "./bitrix.sync-state.service";
import { PrismaService } from "../../prisma/prisma.service";
import {
  mapBitrixCompanyToPrisma,
  mapBitrixContactToPrisma,
  mapBitrixLeadToPrisma,
  mapBitrixDealToPrisma,
  firstPhoneFromRest,
  firstEmailFromRest,
} from "./bitrix.mapper";

const LEGACY_SOURCE = "bitrix";
const MAX_PAGES_PER_RUN = 10;

@Injectable()
export class BitrixDeltaSyncService {
  private readonly logger = new Logger(BitrixDeltaSyncService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly syncState: BitrixSyncStateService,
    private readonly client: BitrixClient,
  ) {}

  @Cron("*/5 * * * *") // every 5 minutes
  async run(): Promise<void> {
    if (process.env.BITRIX_SYNC_ENABLED !== "true") {
      return;
    }
    try {
      await this.syncContacts();
      await this.syncCompanies();
      await this.syncLeads();
      await this.syncDeals();
    } catch (e) {
      this.logger.error("Bitrix delta sync failed", e);
    }
  }

  private async syncContacts(): Promise<void> {
    const entity = "contact";
    try {
      const state = await this.syncState.getState(BITRIX_INTEGRATION, entity);
      const lastSyncAt = state?.lastSyncAt ?? new Date(0);
      const items = await this.client.getContactsModifiedAfter(lastSyncAt, MAX_PAGES_PER_RUN);
      let created = 0;
      let updated = 0;
      for (const item of items) {
        const id = Number(item["ID"]);
        if (!id) continue;
        const primaryPhone = firstPhoneFromRest(item);
        const primaryEmail = firstEmailFromRest(item);
        const data = mapBitrixContactToPrisma(item as Record<string, unknown>, primaryPhone, primaryEmail);
        const companyId = item["COMPANY_ID"] ? await this.resolveCompanyId(Number(item["COMPANY_ID"])) : null;
        const ownerId = item["ASSIGNED_BY_ID"] ? await this.resolveUserId(Number(item["ASSIGNED_BY_ID"])) : null;
        const existing = await this.prisma.contact.findUnique({
          where: { legacySource_legacyId: { legacySource: LEGACY_SOURCE, legacyId: id } },
        });
        const payload = {
          firstName: data.firstName,
          lastName: data.lastName,
          middleName: data.middleName,
          phone: data.phone,
          phoneNormalized: data.phoneNormalized,
          email: data.email,
          position: data.position,
          address: data.address,
          externalCode: data.externalCode ?? undefined,
          region: data.region ?? undefined,
          addressInfo: data.addressInfo ?? undefined,
          city: data.city ?? undefined,
          clientType: data.clientType ?? undefined,
          companyId,
          ownerId,
          legacySource: data.legacySource,
          legacyId: data.legacyId,
          legacyRaw: data.legacyRaw as object,
          syncedAt: data.syncedAt,
        };
        if (existing) {
          await this.prisma.contact.update({ where: { id: existing.id }, data: payload });
          updated++;
        } else {
          await this.prisma.contact.create({ data: payload });
          created++;
        }
      }
      if (items.length > 0) {
        await this.syncState.setLastSync(BITRIX_INTEGRATION, entity, new Date());
      }
      this.logger.log(`Bitrix delta sync contact: ${items.length} fetched, ${created} created, ${updated} updated`);
    } catch (e) {
      this.logger.error("Bitrix delta sync contact failed", e);
      await this.syncState.setError(BITRIX_INTEGRATION, entity, String(e));
    }
  }

  private async syncCompanies(): Promise<void> {
    const entity = "company";
    try {
      const state = await this.syncState.getState(BITRIX_INTEGRATION, entity);
      const lastSyncAt = state?.lastSyncAt ?? new Date(0);
      const items = await this.client.getCompaniesModifiedAfter(lastSyncAt, MAX_PAGES_PER_RUN);
      let created = 0;
      let updated = 0;
      for (const item of items) {
        const id = Number(item["ID"]);
        if (!id) continue;
        const data = mapBitrixCompanyToPrisma(item as Record<string, unknown>);
        const existing = await this.prisma.company.findUnique({
          where: { legacySource_legacyId: { legacySource: LEGACY_SOURCE, legacyId: id } },
        });
        const payload = {
          name: data.name,
          edrpou: data.edrpou,
          taxId: data.taxId,
          legacySource: data.legacySource,
          legacyId: data.legacyId,
          legacyRaw: data.legacyRaw as object,
          syncedAt: data.syncedAt,
        };
        if (existing) {
          await this.prisma.company.update({ where: { id: existing.id }, data: payload });
          updated++;
        } else {
          await this.prisma.company.create({ data: payload });
          created++;
        }
      }
      if (items.length > 0) {
        await this.syncState.setLastSync(BITRIX_INTEGRATION, entity, new Date());
      }
      this.logger.log(`Bitrix delta sync company: ${items.length} fetched, ${created} created, ${updated} updated`);
    } catch (e) {
      this.logger.error("Bitrix delta sync company failed", e);
      await this.syncState.setError(BITRIX_INTEGRATION, entity, String(e));
    }
  }

  private async syncLeads(): Promise<void> {
    const entity = "lead";
    try {
      const state = await this.syncState.getState(BITRIX_INTEGRATION, entity);
      const lastSyncAt = state?.lastSyncAt ?? new Date(0);
      const items = await this.client.getLeadsModifiedAfter(lastSyncAt, MAX_PAGES_PER_RUN);
      let created = 0;
      let updated = 0;
      for (const item of items) {
        const id = Number(item["ID"]);
        if (!id) continue;
        const companyId = Number(item["COMPANY_ID"]);
        const ourCompanyId = companyId ? await this.resolveCompanyId(companyId) : null;
        if (!ourCompanyId) continue;
        const contactId = item["CONTACT_ID"] ? await this.resolveContactId(Number(item["CONTACT_ID"])) : null;
        const ownerId = item["ASSIGNED_BY_ID"] ? await this.resolveUserId(Number(item["ASSIGNED_BY_ID"])) : null;
        const data = mapBitrixLeadToPrisma(item as Record<string, unknown>, ourCompanyId, contactId, ownerId);
        const existing = await this.prisma.lead.findUnique({
          where: { legacySource_legacyId: { legacySource: LEGACY_SOURCE, legacyId: id } },
        });
        const payload = {
          companyId: data.companyId,
          contactId: data.contactId,
          ownerId: data.ownerId,
          status: data.status,
          name: data.name,
          firstName: data.firstName,
          lastName: data.lastName,
          fullName: data.fullName,
          phone: data.phone,
          phoneNormalized: data.phoneNormalized,
          email: data.email,
          comment: data.comment,
          legacySource: data.legacySource,
          legacyId: data.legacyId,
          legacyRaw: data.legacyRaw as object,
          syncedAt: data.syncedAt,
        };
        if (existing) {
          await this.prisma.lead.update({ where: { id: existing.id }, data: payload });
          updated++;
        } else {
          await this.prisma.lead.create({ data: { ...payload, source: data.source } });
          created++;
        }
      }
      if (items.length > 0) {
        await this.syncState.setLastSync(BITRIX_INTEGRATION, entity, new Date());
      }
      this.logger.log(`Bitrix delta sync lead: ${items.length} fetched, ${created} created, ${updated} updated`);
    } catch (e) {
      this.logger.error("Bitrix delta sync lead failed", e);
      await this.syncState.setError(BITRIX_INTEGRATION, entity, String(e));
    }
  }

  private async syncDeals(): Promise<void> {
    const entity = "deal";
    try {
      const state = await this.syncState.getState(BITRIX_INTEGRATION, entity);
      const lastSyncAt = state?.lastSyncAt ?? new Date(0);
      const items = await this.client.getDealsModifiedAfter(lastSyncAt, MAX_PAGES_PER_RUN);
      this.logger.log(
        `Bitrix delta sync deal: lastSyncAt=${lastSyncAt.toISOString()}, fetched=${items.length}`,
      );
      let created = 0;
      let updated = 0;
      for (const item of items) {
        const id = Number(item["ID"]);
        if (!id) continue;
        const assignedById = Number(item["ASSIGNED_BY_ID"] ?? 0);
        const ownerId = await this.resolveUserId(assignedById);
        if (!ownerId) continue;
        const companyId = item["COMPANY_ID"] ? await this.resolveCompanyId(Number(item["COMPANY_ID"])) : null;
        const contactId = item["CONTACT_ID"] ? await this.resolveContactId(Number(item["CONTACT_ID"])) : null;
        const clientId = contactId;
        const orderNumber = `BITRIX-${id}`;
        const data = mapBitrixDealToPrisma(
          item as Record<string, unknown>,
          companyId,
          clientId,
          contactId,
          ownerId,
          orderNumber,
        );
        const existing = await this.prisma.order.findUnique({
          where: { legacySource_legacyId: { legacySource: LEGACY_SOURCE, legacyId: id } },
        });
        const payload = {
          orderNumber: data.orderNumber,
          companyId: data.companyId,
          clientId: data.clientId,
          contactId: data.contactId,
          ownerId: data.ownerId,
          status: data.status,
          paymentMethod: data.paymentMethod ?? undefined,
          currency: data.currency,
          subtotalAmount: data.subtotalAmount,
          discountAmount: data.discountAmount,
          totalAmount: data.totalAmount,
          paidAmount: data.paidAmount,
          debtAmount: data.debtAmount,
          comment: data.comment,
          legacySource: data.legacySource,
          legacyId: data.legacyId,
          legacyRaw: data.legacyRaw as object,
          syncedAt: data.syncedAt,
          createdAt: data.createdAt,
          updatedAt: data.updatedAt,
        };
        if (existing) {
          await this.prisma.order.update({ where: { id: existing.id }, data: payload });
          updated++;
        } else {
          await this.prisma.order.create({ data: { ...payload, orderSource: "CRM" } });
          created++;
        }
      }
      if (items.length > 0) {
        await this.syncState.setLastSync(BITRIX_INTEGRATION, entity, new Date());
      }
      this.logger.log(`Bitrix delta sync deal: ${items.length} fetched, ${created} created, ${updated} updated`);
    } catch (e) {
      this.logger.error("Bitrix delta sync deal failed", e);
      await this.syncState.setError(BITRIX_INTEGRATION, entity, String(e));
    }
  }

  private async resolveCompanyId(bitrixCompanyId: number): Promise<string | null> {
    const c = await this.prisma.company.findUnique({
      where: { legacySource_legacyId: { legacySource: LEGACY_SOURCE, legacyId: bitrixCompanyId } },
    });
    return c?.id ?? null;
  }

  private async resolveUserId(bitrixUserId: number): Promise<string | null> {
    const u = await this.prisma.user.findUnique({
      where: { legacySource_legacyId: { legacySource: LEGACY_SOURCE, legacyId: bitrixUserId } },
    });
    return u?.id ?? null;
  }

  private async resolveContactId(bitrixContactId: number): Promise<string | null> {
    const c = await this.prisma.contact.findUnique({
      where: { legacySource_legacyId: { legacySource: LEGACY_SOURCE, legacyId: bitrixContactId } },
    });
    return c?.id ?? null;
  }

  /**
   * Sync a single entity by Bitrix ID (used by webhook processor).
   * Fetches current state from Bitrix REST then upserts into ECOCRM. Idempotent.
   */
  async syncContactByBitrixId(bitrixId: number): Promise<boolean> {
    const item = await this.client.getById("crm.contact.get", bitrixId);
    if (!item) return false;
    const id = Number(item["ID"]);
    if (!id) return false;
    const primaryPhone = firstPhoneFromRest(item);
    const primaryEmail = firstEmailFromRest(item);
    const data = mapBitrixContactToPrisma(item as Record<string, unknown>, primaryPhone, primaryEmail);
    const companyId = item["COMPANY_ID"] ? await this.resolveCompanyId(Number(item["COMPANY_ID"])) : null;
    const ownerId = item["ASSIGNED_BY_ID"] ? await this.resolveUserId(Number(item["ASSIGNED_BY_ID"])) : null;
    const existing = await this.prisma.contact.findUnique({
      where: { legacySource_legacyId: { legacySource: LEGACY_SOURCE, legacyId: id } },
    });
    const payload = {
      firstName: data.firstName,
      lastName: data.lastName,
      middleName: data.middleName,
      phone: data.phone,
      phoneNormalized: data.phoneNormalized,
      email: data.email,
      position: data.position,
      address: data.address,
      externalCode: data.externalCode ?? undefined,
      region: data.region ?? undefined,
      addressInfo: data.addressInfo ?? undefined,
      city: data.city ?? undefined,
      clientType: data.clientType ?? undefined,
      companyId,
      ownerId,
      legacySource: data.legacySource,
      legacyId: data.legacyId,
      legacyRaw: data.legacyRaw as object,
      syncedAt: data.syncedAt,
    };
    if (existing) {
      await this.prisma.contact.update({ where: { id: existing.id }, data: payload });
    } else {
      await this.prisma.contact.create({ data: payload });
    }
    return true;
  }

  async syncCompanyByBitrixId(bitrixId: number): Promise<boolean> {
    const item = await this.client.getById("crm.company.get", bitrixId);
    if (!item) return false;
    const id = Number(item["ID"]);
    if (!id) return false;
    const data = mapBitrixCompanyToPrisma(item as Record<string, unknown>);
    const existing = await this.prisma.company.findUnique({
      where: { legacySource_legacyId: { legacySource: LEGACY_SOURCE, legacyId: id } },
    });
    const payload = {
      name: data.name,
      edrpou: data.edrpou,
      taxId: data.taxId,
      legacySource: data.legacySource,
      legacyId: data.legacyId,
      legacyRaw: data.legacyRaw as object,
      syncedAt: data.syncedAt,
    };
    if (existing) {
      await this.prisma.company.update({ where: { id: existing.id }, data: payload });
    } else {
      await this.prisma.company.create({ data: payload });
    }
    return true;
  }

  async syncLeadByBitrixId(bitrixId: number): Promise<boolean> {
    const item = await this.client.getById("crm.lead.get", bitrixId);
    if (!item) return false;
    const id = Number(item["ID"]);
    if (!id) return false;
    const companyId = Number(item["COMPANY_ID"]);
    const ourCompanyId = companyId ? await this.resolveCompanyId(companyId) : null;
    if (!ourCompanyId) return false;
    const contactId = item["CONTACT_ID"] ? await this.resolveContactId(Number(item["CONTACT_ID"])) : null;
    const ownerId = item["ASSIGNED_BY_ID"] ? await this.resolveUserId(Number(item["ASSIGNED_BY_ID"])) : null;
    const data = mapBitrixLeadToPrisma(item as Record<string, unknown>, ourCompanyId, contactId, ownerId);
    const existing = await this.prisma.lead.findUnique({
      where: { legacySource_legacyId: { legacySource: LEGACY_SOURCE, legacyId: id } },
    });
    const payload = {
      companyId: data.companyId,
      contactId: data.contactId,
      ownerId: data.ownerId,
      status: data.status,
      name: data.name,
      firstName: data.firstName,
      lastName: data.lastName,
      fullName: data.fullName,
      phone: data.phone,
      phoneNormalized: data.phoneNormalized,
      email: data.email,
      comment: data.comment,
      legacySource: data.legacySource,
      legacyId: data.legacyId,
      legacyRaw: data.legacyRaw as object,
      syncedAt: data.syncedAt,
    };
    if (existing) {
      await this.prisma.lead.update({ where: { id: existing.id }, data: payload });
    } else {
      await this.prisma.lead.create({ data: { ...payload, source: data.source } });
    }
    return true;
  }

  async syncDealByBitrixId(bitrixId: number): Promise<boolean> {
    const item = await this.client.getById("crm.deal.get", bitrixId);
    if (!item) return false;
    const id = Number(item["ID"]);
    if (!id) return false;
    const assignedById = Number(item["ASSIGNED_BY_ID"] ?? 0);
    const ownerId = await this.resolveUserId(assignedById);
    if (!ownerId) return false;
    const companyId = item["COMPANY_ID"] ? await this.resolveCompanyId(Number(item["COMPANY_ID"])) : null;
    const contactId = item["CONTACT_ID"] ? await this.resolveContactId(Number(item["CONTACT_ID"])) : null;
    const clientId = contactId;
    const orderNumber = `BITRIX-${id}`;
    const data = mapBitrixDealToPrisma(
      item as Record<string, unknown>,
      companyId,
      clientId,
      contactId,
      ownerId,
      orderNumber,
    );
    const existing = await this.prisma.order.findUnique({
      where: { legacySource_legacyId: { legacySource: LEGACY_SOURCE, legacyId: id } },
    });
    const payload = {
      orderNumber: data.orderNumber,
      companyId: data.companyId,
      clientId: data.clientId,
      contactId: data.contactId,
      ownerId: data.ownerId,
      status: data.status,
      paymentMethod: data.paymentMethod ?? undefined,
      currency: data.currency,
      subtotalAmount: data.subtotalAmount,
      discountAmount: data.discountAmount,
      totalAmount: data.totalAmount,
      paidAmount: data.paidAmount,
      debtAmount: data.debtAmount,
      comment: data.comment,
      legacySource: data.legacySource,
      legacyId: data.legacyId,
      legacyRaw: data.legacyRaw as object,
      syncedAt: data.syncedAt,
      createdAt: data.createdAt,
      updatedAt: data.updatedAt,
    };
    if (existing) {
      await this.prisma.order.update({ where: { id: existing.id }, data: payload });
    } else {
      await this.prisma.order.create({ data: { ...payload, orderSource: "CRM" } });
    }
    return true;
  }
}

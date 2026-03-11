import { Injectable, Logger } from "@nestjs/common";
import { Prisma } from "@prisma/client";
import { Pool } from "mysql2/promise";
import { createPool } from "mysql2/promise";
import { PrismaService } from "../../prisma/prisma.service";
import {
  mapBitrixUserToPrisma,
  mapBitrixCompanyToPrisma,
  mapBitrixContactToPrisma,
  mapBitrixLeadToPrisma,
  mapBitrixDealToPrisma,
  mapBitrixDealStageToOrderStatus,
  mapBitrixProductRowToPrisma,
  normalizePhoneDigits,
  parseBitrixProductNameForSku,
} from "./bitrix.mapper";
import {
  extractNpDataFromBitrixLegacyRaw,
  bitrixNpDataToProfilePayload,
} from "../../contacts/bitrix-np-mapper";

const LEGACY_SOURCE = "bitrix";
const UPDATE_BATCH_SIZE = 200;
const FIELD_MULTI_IN_LIMIT = 1000;

type ImportStats = { created: number; updated: number; skipped: number; errors: number };

function getBatchSize(): number {
  const v = process.env.BITRIX_IMPORT_BATCH_SIZE ?? "1000";
  const n = parseInt(v, 10);
  return Number.isFinite(n) && n > 0 ? n : 1000;
}

function getConcurrency(): number {
  const v = process.env.BITRIX_IMPORT_CONCURRENCY ?? "4";
  const n = parseInt(v, 10);
  return Number.isFinite(n) && n > 0 ? n : 4;
}

/** If true, import only users that have UF_DEPARTMENT set (employees). Default true. */
function getEmployeesOnly(): boolean {
  const v = process.env.BITRIX_IMPORT_EMPLOYEES_ONLY ?? "true";
  return v === "true" || v === "1";
}

/** Run up to `limit` tasks concurrently. */
async function runWithConcurrency<T>(limit: number, tasks: (() => Promise<T>)[]): Promise<T[]> {
  const results: T[] = [];
  let index = 0;
  async function worker(): Promise<void> {
    while (index < tasks.length) {
      const i = index++;
      const task = tasks[i];
      if (!task) continue;
      try {
        const r = await task();
        results[i] = r;
      } catch (e) {
        throw e;
      }
    }
  }
  const workers = Array.from({ length: Math.min(limit, tasks.length) }, () => worker());
  await Promise.all(workers);
  return results;
}

@Injectable()
export class BitrixInitialImportService {
  private readonly logger = new Logger(BitrixInitialImportService.name);

  constructor(private readonly prisma: PrismaService) {}

  private getPool(): Pool {
    const host = process.env.BITRIX_MYSQL_HOST ?? "localhost";
    const user = process.env.BITRIX_MYSQL_USER ?? "";
    const password = process.env.BITRIX_MYSQL_PASSWORD ?? "";
    const database = process.env.BITRIX_MYSQL_DATABASE ?? "bitrix";
    const port = process.env.BITRIX_MYSQL_PORT ? parseInt(process.env.BITRIX_MYSQL_PORT, 10) : 3306;
    const connectTimeoutMs = process.env.BITRIX_MYSQL_CONNECT_TIMEOUT_MS
      ? parseInt(process.env.BITRIX_MYSQL_CONNECT_TIMEOUT_MS, 10)
      : 60000;
    if (!user || !database) {
      throw new Error("BITRIX_MYSQL_USER and BITRIX_MYSQL_DATABASE are required");
    }
    return createPool({
      host,
      port,
      user,
      password,
      database,
      connectionLimit: 5,
      connectTimeout: connectTimeoutMs,
    });
  }

  /** Load one batch from a Bitrix table. For b_user see loadUserBatch. */
  private async loadBatch(
    pool: Pool,
    tableName: string,
    offset: number,
    limit: number,
  ): Promise<Record<string, unknown>[]> {
    const whereClause = tableName === "b_user" ? " WHERE ID > 0" : "";
    const sql = `SELECT * FROM ${tableName}${whereClause} ORDER BY ID LIMIT ${Number(limit)} OFFSET ${Number(offset)}`;
    const [rows] = await pool.query(sql);
    const arr = Array.isArray(rows) ? rows : [];
    return arr as Record<string, unknown>[];
  }

  /** Load one batch of users. If BITRIX_IMPORT_EMPLOYEES_ONLY=true, only users with UF_DEPARTMENT in b_uts_user. */
  private async loadUserBatch(
    pool: Pool,
    offset: number,
    limit: number,
  ): Promise<Record<string, unknown>[]> {
    const employeesOnly = getEmployeesOnly();
    if (!employeesOnly) {
      return this.loadBatch(pool, "b_user", offset, limit);
    }
    const lim = Number(limit);
    const off = Number(offset);
    const sql = `SELECT u.* FROM b_user u
      INNER JOIN b_uts_user uts ON uts.VALUE_ID = u.ID
      WHERE u.ID > 0
        AND uts.UF_DEPARTMENT IS NOT NULL
        AND TRIM(IFNULL(uts.UF_DEPARTMENT, '')) != ''
      ORDER BY u.ID
      LIMIT ${lim} OFFSET ${off}`;
    const [rows] = await pool.query(sql);
    const arr = Array.isArray(rows) ? rows : [];
    return arr as Record<string, unknown>[];
  }

  /** Load field_multi rows for given element IDs (contacts). IN-list limited to FIELD_MULTI_IN_LIMIT. */
  private async loadFieldMultiForElements(
    pool: Pool,
    elementIds: number[],
  ): Promise<Record<string, unknown>[]> {
    if (elementIds.length === 0) return [];
    const ids = [...new Set(elementIds)].slice(0, FIELD_MULTI_IN_LIMIT);
    const placeholders = ids.map(() => "?").join(",");
    const sql = `SELECT * FROM b_crm_field_multi WHERE ENTITY_ID IN ('CRM_CONTACT', 'CONTACT') AND ELEMENT_ID IN (${placeholders})`;
    const [rows] = await pool.query(sql, ids);
    const arr = Array.isArray(rows) ? rows : [];
    return arr as Record<string, unknown>[];
  }

  /**
   * Load user fields (UF_*) for contacts from b_uts_crm_contact.
   * Merging these into the contact row gives legacyRaw the NP fields (recipient, city, warehouse, etc.).
   * If the table does not exist (e.g. some Bitrix versions), returns empty map.
   */
  private async loadContactUfBatch(
    pool: Pool,
    elementIds: number[],
  ): Promise<Map<number, Record<string, unknown>>> {
    if (elementIds.length === 0) return new Map();
    const ids = [...new Set(elementIds)].slice(0, FIELD_MULTI_IN_LIMIT);
    const placeholders = ids.map(() => "?").join(",");
    try {
      const [rows] = await pool.query(
        `SELECT * FROM b_uts_crm_contact WHERE VALUE_ID IN (${placeholders})`,
        ids,
      );
      const arr = (Array.isArray(rows) ? rows : []) as Record<string, unknown>[];
      const map = new Map<number, Record<string, unknown>>();
      for (const row of arr) {
        const valueId = Number(row["VALUE_ID"]);
        if (valueId > 0) map.set(valueId, { ...row } as Record<string, unknown>);
      }
      return map;
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      if (msg.includes("doesn't exist") || msg.includes("Unknown table")) {
        this.logger.warn(
          "b_uts_crm_contact not found; contact legacyRaw will not include UF_* (NP fields may be missing).",
        );
        return new Map();
      }
      throw e;
    }
  }

  /**
   * Load user fields (UF_*) for deals from b_uts_crm_deal (e.g. UF_CRM_1753787869056 = cash/FOP).
   * If the table does not exist, returns empty map.
   */
  private async loadDealUfBatch(
    pool: Pool,
    elementIds: number[],
  ): Promise<Map<number, Record<string, unknown>>> {
    if (elementIds.length === 0) return new Map();
    const ids = [...new Set(elementIds)].slice(0, FIELD_MULTI_IN_LIMIT);
    const placeholders = ids.map(() => "?").join(",");
    try {
      const [rows] = await pool.query(
        `SELECT * FROM b_uts_crm_deal WHERE VALUE_ID IN (${placeholders})`,
        ids,
      );
      const arr = (Array.isArray(rows) ? rows : []) as Record<string, unknown>[];
      const map = new Map<number, Record<string, unknown>>();
      for (const row of arr) {
        const valueId = Number(row["VALUE_ID"]);
        if (valueId > 0) map.set(valueId, { ...row } as Record<string, unknown>);
      }
      return map;
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      if (msg.includes("doesn't exist") || msg.includes("Unknown table")) {
        this.logger.warn(
          "b_uts_crm_deal not found; deal legacyRaw will not include UF_* (e.g. payment method).",
        );
        return new Map();
      }
      throw e;
    }
  }

  async runFullImport(): Promise<{
    users: ImportStats;
    companies: ImportStats;
    contacts: ImportStats;
    contactPhones: ImportStats;
    npProfiles: { created: number };
    leads: ImportStats;
    orders: ImportStats;
    orderItems: ImportStats;
  }> {
    const pool = this.getPool();
    const stats = {
      users: { created: 0, updated: 0, skipped: 0, errors: 0 },
      companies: { created: 0, updated: 0, skipped: 0, errors: 0 },
      contacts: { created: 0, updated: 0, skipped: 0, errors: 0 },
      contactPhones: { created: 0, updated: 0, skipped: 0, errors: 0 },
      npProfiles: { created: 0 },
      leads: { created: 0, updated: 0, skipped: 0, errors: 0 },
      orders: { created: 0, updated: 0, skipped: 0, errors: 0 },
      orderItems: { created: 0, updated: 0, skipped: 0, errors: 0 },
    };

    try {
      // 1. Users from b_user (bulk)
      await this.importUsersBulk(pool, stats);

      // 2. Companies from b_crm_company (bulk)
      await this.importCompaniesBulk(pool, stats);

      // 3. Contacts + ContactPhone (bulk)
      await this.importContactsBulk(pool, stats);

      // 3b. NP shipping profiles from Bitrix contact legacyRaw (where NP fields present)
      stats.npProfiles.created = await this.ensureNpProfilesFromBitrixContacts();

      // 4. Leads (bulk)
      await this.importLeadsBulk(pool, stats);

      // 5. Orders (deals) bulk
      await this.importOrdersBulk(pool, stats);

      // 6. OrderItems (product rows) bulk
      await this.importOrderItemsBulk(pool, stats);
    } finally {
      try {
        await pool.end();
      } catch (e) {
        this.logger.warn(
          `Bitrix import: pool.end() failed (connection may have timed out earlier). Check BITRIX_MYSQL_* and SSH tunnel. ${e instanceof Error ? e.message : String(e)}`,
        );
      }
    }

    return stats;
  }

  /**
   * For contacts with legacySource=bitrix and NP data in legacyRaw, create one
   * ContactShippingProfile per contact (label "Нова Пошта (Bitrix)") if not already present.
   * Returns number of profiles created.
   * Note: legacyRaw from MySQL b_crm_contact may not include UF_* NP fields; they are often
   * in b_utm_crm_contact. Profiles will be created when legacyRaw contains NP data (e.g. after REST sync).
   */
  private async ensureNpProfilesFromBitrixContacts(): Promise<number> {
    const batchSize = 500;
    const label = "Нова Пошта (Bitrix)";
    let created = 0;
    let offset = 0;
    let processedCount = 0;
    let withNpDataCount = 0;

    for (;;) {
      const contacts = await this.prisma.contact.findMany({
        where: { legacySource: LEGACY_SOURCE, legacyRaw: { not: Prisma.JsonNull } },
        select: { id: true, legacyRaw: true },
        take: batchSize,
        skip: offset,
        orderBy: { id: "asc" },
      });
      if (contacts.length === 0) break;

      for (const c of contacts) {
        processedCount += 1;
        const raw = c.legacyRaw as Record<string, unknown> | null | undefined;
        const npData = extractNpDataFromBitrixLegacyRaw(raw);
        if (npData) withNpDataCount += 1;
        if (!npData) continue;

        const existing = await this.prisma.contactShippingProfile.findFirst({
          where: { contactId: c.id, label },
          select: { id: true },
        });
        if (existing) continue;

        const body = bitrixNpDataToProfilePayload(npData, label);
        await this.prisma.contactShippingProfile.create({
          data: {
            contactId: c.id,
            label: String(body.label),
            isDefault: Boolean(body.isDefault ?? false),
            recipientType: (body.recipientType as "PERSON" | "COMPANY") ?? "PERSON",
            deliveryType: (body.deliveryType as "WAREHOUSE" | "POSTOMAT" | "ADDRESS") ?? "WAREHOUSE",
            firstName: body.firstName != null ? String(body.firstName) : null,
            lastName: body.lastName != null ? String(body.lastName) : null,
            middleName: body.middleName != null ? String(body.middleName) : null,
            phone: body.phone != null ? String(body.phone) : null,
            companyName: body.companyName != null ? String(body.companyName) : null,
            edrpou: body.edrpou != null ? String(body.edrpou) : null,
            contactPersonFirstName:
              body.contactPersonFirstName != null ? String(body.contactPersonFirstName) : null,
            contactPersonLastName:
              body.contactPersonLastName != null ? String(body.contactPersonLastName) : null,
            contactPersonMiddleName:
              body.contactPersonMiddleName != null ? String(body.contactPersonMiddleName) : null,
            contactPersonPhone:
              body.contactPersonPhone != null ? String(body.contactPersonPhone) : null,
            cityRef: body.cityRef != null ? String(body.cityRef) : null,
            cityName: body.cityName != null ? String(body.cityName) : null,
            warehouseRef: body.warehouseRef != null ? String(body.warehouseRef) : null,
            warehouseNumber: body.warehouseNumber != null ? String(body.warehouseNumber) : null,
            warehouseType: body.warehouseType != null ? String(body.warehouseType) : null,
            streetRef: body.streetRef != null ? String(body.streetRef) : null,
            streetName: body.streetName != null ? String(body.streetName) : null,
            building: body.building != null ? String(body.building) : null,
            flat: body.flat != null ? String(body.flat) : null,
            npCounterpartyRef:
              body.npCounterpartyRef != null ? String(body.npCounterpartyRef) : null,
            npContactPersonRef:
              body.npContactPersonRef != null ? String(body.npContactPersonRef) : null,
            npAddressRef: body.npAddressRef != null ? String(body.npAddressRef) : null,
          },
        });
        created += 1;
      }

      offset += contacts.length;
      if (contacts.length < batchSize) break;
    }

    this.logger.log(
      `[BitrixInitialImportService] NP shipping profiles from Bitrix legacyRaw: processed=${processedCount} withNpData=${withNpDataCount} created=${created}`,
    );
    return created;
  }

  private async importUsersBulk(
    pool: Pool,
    stats: { users: ImportStats },
  ): Promise<void> {
    const batchSize = getBatchSize();
    const concurrency = getConcurrency();
    this.logger.log(
      `Bitrix initial import: users (bulk)${getEmployeesOnly() ? ", employees only (UF_DEPARTMENT)" : ", all users"}…`,
    );
    let batchIndex = 0;
    const runSlot = async (slotIndex: number): Promise<void> => {
      for (let offset = slotIndex * batchSize; ; offset += concurrency * batchSize) {
        const batch = await this.loadUserBatch(pool, offset, batchSize);
        if (batch.length === 0) break;
        batchIndex++;
        const result = await this.processUserBatch(batch);
        stats.users.created += result.created;
        stats.users.updated += result.updated;
        stats.users.skipped += result.skipped;
        stats.users.errors += result.errors;
        this.logger.log(
          `users batch ${batchIndex} (offset ${offset}) created: ${result.created} updated: ${result.updated} skipped: ${result.skipped} errors: ${result.errors}`,
        );
        await new Promise<void>((resolve) => setImmediate(resolve));
      }
    };
    await Promise.all(Array.from({ length: concurrency }, (_, i) => runSlot(i)));
    this.logger.log(
      `Bitrix import users: created=${stats.users.created} updated=${stats.users.updated} skipped=${stats.users.skipped} errors=${stats.users.errors}`,
    );
  }

  private async processUserBatch(batch: Record<string, unknown>[]): Promise<ImportStats> {
    const result: ImportStats = { created: 0, updated: 0, skipped: 0, errors: 0 };
    const legacyIds = batch.map((r) => Number(r["ID"])).filter((id) => id > 0);
    if (legacyIds.length === 0) return result;
    const existing = await this.prisma.user.findMany({
      where: { legacySource: LEGACY_SOURCE, legacyId: { in: legacyIds } },
      select: { legacyId: true, id: true },
    });
    const existingByLegacyId = new Map(existing.map((e) => [e.legacyId, e]));
    const newRecords: Record<string, unknown>[] = [];
    const existingRecords: Record<string, unknown>[] = [];
    for (const row of batch) {
      const id = Number(row["ID"]);
      if (!id) {
        result.skipped++;
        continue;
      }
      if (existingByLegacyId.has(id)) existingRecords.push(row);
      else newRecords.push(row);
    }
    if (newRecords.length > 0) {
      try {
        const data = newRecords.map((row) => {
          const legacyId = Number(row["ID"]);
          const d = mapBitrixUserToPrisma(row as Record<string, unknown>);
          return {
            email: `bitrix-user-${legacyId}@legacy.local`,
            fullName: d.fullName,
            passwordHash: d.passwordHash,
            role: d.role,
            legacySource: d.legacySource,
            legacyId,
            legacyRaw: d.legacyRaw as object,
            syncedAt: d.syncedAt,
          };
        });
        const r = await this.prisma.user.createMany({ data, skipDuplicates: true });
        result.created += r.count;
      } catch (e) {
        this.logger.warn(`User batch insert error: ${e}`);
        result.errors += newRecords.length;
      }
    }
    for (let i = 0; i < existingRecords.length; i += UPDATE_BATCH_SIZE) {
      const chunk = existingRecords.slice(i, i + UPDATE_BATCH_SIZE);
      try {
        await this.prisma.$transaction(
          chunk.map((row) => {
            const id = Number(row["ID"]);
            const d = mapBitrixUserToPrisma(row as Record<string, unknown>);
            return this.prisma.user.update({
              where: { legacySource_legacyId: { legacySource: LEGACY_SOURCE, legacyId: id } },
              data: {
                fullName: d.fullName,
                legacyRaw: d.legacyRaw as object,
                syncedAt: d.syncedAt,
              },
            });
          }),
        );
        result.updated += chunk.length;
      } catch (e) {
        this.logger.warn(`User batch update error (legacyIds ${chunk.map((r) => Number(r["ID"])).join(",")}): ${e}`);
        result.errors += chunk.length;
      }
    }
    return result;
  }

  private async importCompaniesBulk(
    pool: Pool,
    stats: {
      companies: ImportStats;
    },
  ): Promise<void> {
    const batchSize = getBatchSize();
    const concurrency = getConcurrency();
    this.logger.log("Bitrix initial import: companies (bulk)…");
    let batchIndex = 0;
    const runSlot = async (slotIndex: number): Promise<void> => {
      for (let offset = slotIndex * batchSize; ; offset += concurrency * batchSize) {
        const batch = await this.loadBatch(pool, "b_crm_company", offset, batchSize);
        if (batch.length === 0) break;
        batchIndex++;
        const result = await this.processCompanyBatch(batch);
        stats.companies.created += result.created;
        stats.companies.updated += result.updated;
        stats.companies.skipped += result.skipped;
        stats.companies.errors += result.errors;
        this.logger.log(
          `companies batch ${batchIndex} (offset ${offset}) created: ${result.created} updated: ${result.updated} skipped: ${result.skipped} errors: ${result.errors}`,
        );
        await new Promise<void>((resolve) => setImmediate(resolve));
      }
    };
    await Promise.all(Array.from({ length: concurrency }, (_, i) => runSlot(i)));
    this.logger.log(
      `Bitrix import companies: created=${stats.companies.created} updated=${stats.companies.updated} skipped=${stats.companies.skipped} errors=${stats.companies.errors}`,
    );
  }

  private async processCompanyBatch(
    batch: Record<string, unknown>[],
  ): Promise<ImportStats> {
    const result: ImportStats = { created: 0, updated: 0, skipped: 0, errors: 0 };
    const legacyIds = batch.map((r) => Number(r["ID"])).filter((id) => id > 0);
    if (legacyIds.length === 0) return result;
    const existing = await this.prisma.company.findMany({
      where: { legacySource: LEGACY_SOURCE, legacyId: { in: legacyIds } },
      select: { legacyId: true, id: true },
    });
    const existingByLegacyId = new Map(existing.map((e) => [e.legacyId, e]));
    const newRecords: Record<string, unknown>[] = [];
    const existingRecords: Record<string, unknown>[] = [];
    for (const row of batch) {
      const id = Number(row["ID"]);
      if (!id) {
        result.skipped++;
        continue;
      }
      if (existingByLegacyId.has(id)) existingRecords.push(row);
      else newRecords.push(row);
    }
    if (newRecords.length > 0) {
      try {
        const data = newRecords.map((row) => {
          const d = mapBitrixCompanyToPrisma(row as Record<string, unknown>);
          return {
            name: d.name,
            edrpou: d.edrpou,
            taxId: d.taxId,
            legacySource: d.legacySource,
            legacyId: d.legacyId,
            legacyRaw: d.legacyRaw as object,
            syncedAt: d.syncedAt,
          };
        });
        const r = await this.prisma.company.createMany({ data, skipDuplicates: true });
        result.created += r.count;
      } catch (e) {
        this.logger.warn(`Company batch insert error: ${e}`);
        result.errors += newRecords.length;
      }
    }
    for (let i = 0; i < existingRecords.length; i += UPDATE_BATCH_SIZE) {
      const chunk = existingRecords.slice(i, i + UPDATE_BATCH_SIZE);
      try {
        await this.prisma.$transaction(
          chunk.map((row) => {
            const id = Number(row["ID"]);
            const d = mapBitrixCompanyToPrisma(row as Record<string, unknown>);
            return this.prisma.company.update({
              where: { legacySource_legacyId: { legacySource: LEGACY_SOURCE, legacyId: id } },
              data: {
                name: d.name,
                edrpou: d.edrpou,
                taxId: d.taxId,
                legacyRaw: d.legacyRaw as object,
                syncedAt: d.syncedAt,
              },
            });
          }),
        );
        result.updated += chunk.length;
      } catch (e) {
        this.logger.warn(`Company batch update error (legacyIds ${chunk.map((r) => Number(r["ID"])).join(",")}): ${e}`);
        result.errors += chunk.length;
      }
    }
    return result;
  }

  private async importContactsBulk(
    pool: Pool,
    stats: { contacts: ImportStats; contactPhones: ImportStats },
  ): Promise<void> {
    const batchSize = getBatchSize();
    const companyIdByLegacyId = await this.loadCompanyIdByLegacyId();
    const userIdByLegacyId = await this.loadUserIdByLegacyId();
    this.logger.log("Bitrix initial import: contacts + phones (bulk)…");
    let batchIndex = 0;
    const contactConcurrency = 1;
    const runSlot = async (slotIndex: number): Promise<void> => {
      for (let offset = slotIndex * batchSize; ; offset += contactConcurrency * batchSize) {
        const batch = await this.loadBatch(pool, "b_crm_contact", offset, batchSize);
        if (batch.length === 0) break;
        batchIndex++;
        const result = await this.processContactBatch(
          pool,
          batch,
          companyIdByLegacyId,
          userIdByLegacyId,
        );
        stats.contacts.created += result.contacts.created;
        stats.contacts.updated += result.contacts.updated;
        stats.contacts.skipped += result.contacts.skipped;
        stats.contacts.errors += result.contacts.errors;
        stats.contactPhones.created += result.contactPhones.created;
        stats.contactPhones.updated += result.contactPhones.updated;
        stats.contactPhones.skipped += result.contactPhones.skipped;
        stats.contactPhones.errors += result.contactPhones.errors;
        this.logger.log(
          `contacts batch ${batchIndex} (offset ${offset}) created: ${result.contacts.created} updated: ${result.contacts.updated} skipped: ${result.contacts.skipped} errors: ${result.contacts.errors} | phones created: ${result.contactPhones.created}`,
        );
        await new Promise<void>((resolve) => setImmediate(resolve));
      }
    };
    await Promise.all(Array.from({ length: contactConcurrency }, (_, i) => runSlot(i)));
    this.logger.log(
      `Bitrix import contacts: created=${stats.contacts.created} updated=${stats.contacts.updated} skipped=${stats.contacts.skipped} errors=${stats.contacts.errors}`,
    );
    this.logger.log(
      `Bitrix import contact phones: created=${stats.contactPhones.created} updated=${stats.contactPhones.updated} skipped=${stats.contactPhones.skipped} errors=${stats.contactPhones.errors}`,
    );
  }

  private async loadCompanyIdByLegacyId(): Promise<Map<number, string>> {
    const rows = await this.prisma.company.findMany({
      where: { legacySource: LEGACY_SOURCE },
      select: { legacyId: true, id: true },
    });
    return new Map(rows.map((r) => [r.legacyId!, r.id]));
  }

  private async loadUserIdByLegacyId(): Promise<Map<number, string>> {
    const rows = await this.prisma.user.findMany({
      where: { legacySource: LEGACY_SOURCE },
      select: { legacyId: true, id: true },
    });
    return new Map(rows.map((r) => [r.legacyId!, r.id]));
  }

  private async processContactBatch(
    pool: Pool,
    batch: Record<string, unknown>[],
    companyIdByLegacyId: Map<number, string>,
    userIdByLegacyId: Map<number, string>,
  ): Promise<{ contacts: ImportStats; contactPhones: ImportStats }> {
    const cStats: ImportStats = { created: 0, updated: 0, skipped: 0, errors: 0 };
    const pStats: ImportStats = { created: 0, updated: 0, skipped: 0, errors: 0 };
    const elementIds = batch.map((r) => Number(r["ID"])).filter((id) => id > 0);
    if (elementIds.length === 0) return { contacts: cStats, contactPhones: pStats };
    const multiRows = await this.loadFieldMultiForElements(pool, elementIds);
    const phonesByElement = this.groupFieldMultiByElement(multiRows, "PHONE");
    const emailsByElement = this.groupFieldMultiByElement(multiRows, "EMAIL");

    const contactUfByLegacyId = await this.loadContactUfBatch(pool, elementIds);
    for (const row of batch) {
      const id = Number(row["ID"]);
      const uf = contactUfByLegacyId.get(id);
      if (uf) Object.assign(row, uf);
    }

    const legacyIds = elementIds;
    const existing = await this.prisma.contact.findMany({
      where: { legacySource: LEGACY_SOURCE, legacyId: { in: legacyIds } },
      select: { legacyId: true, id: true },
    });
    const existingByLegacyId = new Map(existing.map((e) => [e.legacyId!, e]));
    const newRecords: Record<string, unknown>[] = [];
    const existingRecords: Record<string, unknown>[] = [];
    for (const row of batch) {
      const id = Number(row["ID"]);
      if (!id) {
        cStats.skipped++;
        continue;
      }
      if (existingByLegacyId.has(id)) existingRecords.push(row);
      else newRecords.push(row);
    }

    const contactIdByLegacyId = new Map<number, string>(existing.map((e) => [e.legacyId!, e.id]));

    if (newRecords.length > 0) {
      try {
        const data = newRecords.map((row) => {
          const legacyId = Number(row["ID"]);
          const phones = phonesByElement.get(legacyId) ?? [];
          const emails = emailsByElement.get(legacyId) ?? [];
          const primaryPhone = phones[0]?.value ?? "";
          const primaryEmail = emails[0]?.value ?? null;
          const d = mapBitrixContactToPrisma(row as Record<string, unknown>, primaryPhone, primaryEmail);
          const companyId = row["COMPANY_ID"] ? companyIdByLegacyId.get(Number(row["COMPANY_ID"])) ?? null : null;
          const ownerId = row["ASSIGNED_BY_ID"] ? userIdByLegacyId.get(Number(row["ASSIGNED_BY_ID"])) ?? null : null;
          return {
            firstName: d.firstName,
            lastName: d.lastName,
            middleName: d.middleName,
            phone: d.phone,
            phoneNormalized: d.phoneNormalized,
            email: d.email,
            position: d.position,
            address: d.address,
            externalCode: d.externalCode ?? undefined,
            region: d.region ?? undefined,
            addressInfo: d.addressInfo ?? undefined,
            city: d.city ?? undefined,
            clientType: d.clientType ?? undefined,
            companyId,
            ownerId,
            legacySource: d.legacySource,
            legacyId,
            legacyRaw: d.legacyRaw as object,
            syncedAt: d.syncedAt,
          };
        });
        const normalizedToDedupe = [...new Set(data.map((r) => r.phoneNormalized).filter((n): n is string => n != null && n !== ""))];
        const takenInDb = new Set<string>();
        if (normalizedToDedupe.length > 0) {
          const existingPhones = await this.prisma.contact.findMany({
            where: { phoneNormalized: { in: normalizedToDedupe } },
            select: { phoneNormalized: true },
          });
          existingPhones.forEach((c) => {
            if (c.phoneNormalized) takenInDb.add(c.phoneNormalized);
          });
        }
        const assignedInBatch = new Set<string>();
        for (const row of data) {
          const n = row.phoneNormalized;
          if (n && (takenInDb.has(n) || assignedInBatch.has(n))) {
            row.phoneNormalized = null;
          } else if (n) {
            assignedInBatch.add(n);
          }
        }
        const created = await this.prisma.contact.createManyAndReturn({ data });
        cStats.created += created.length;
        for (const c of created) {
          if (c.legacyId != null) contactIdByLegacyId.set(c.legacyId, c.id);
        }
      } catch (e) {
        this.logger.warn(`Contact batch insert error: ${e}`);
        cStats.errors += newRecords.length;
      }
    }

    const phoneRows: { contactId: string; phone: string; phoneNormalized: string; label: string | null; legacySource: string; legacyId: number; legacyRaw: object; syncedAt: Date }[] = [];
    for (const row of batch) {
      const contactLegacyId = Number(row["ID"]);
      const ourContactId = contactIdByLegacyId.get(contactLegacyId);
      if (!ourContactId) continue;
      const phones = phonesByElement.get(contactLegacyId) ?? [];
      for (const ph of phones) {
        const normalized = normalizePhoneDigits(ph.value);
        if (!normalized) {
          pStats.skipped++;
          continue;
        }
        phoneRows.push({
          contactId: ourContactId,
          phone: ph.value,
          phoneNormalized: normalized,
          label: ph.typeId === "PHONE" ? null : ph.typeId,
          legacySource: LEGACY_SOURCE,
          legacyId: ph.rowId,
          legacyRaw: { typeId: ph.typeId, value: ph.value },
          syncedAt: new Date(),
        });
      }
    }
    if (phoneRows.length > 0) {
      try {
        const r = await this.prisma.contactPhone.createMany({ data: phoneRows, skipDuplicates: true });
        pStats.created += r.count;
      } catch (e) {
        this.logger.warn(`ContactPhone batch insert error: ${e}`);
        pStats.errors += phoneRows.length;
      }
    }

    for (let i = 0; i < existingRecords.length; i += UPDATE_BATCH_SIZE) {
      const chunk = existingRecords.slice(i, i + UPDATE_BATCH_SIZE);
      try {
        await this.prisma.$transaction(
          chunk.map((row) => {
            const id = Number(row["ID"]);
            const phones = phonesByElement.get(id) ?? [];
            const emails = emailsByElement.get(id) ?? [];
            const primaryPhone = phones[0]?.value ?? "";
            const primaryEmail = emails[0]?.value ?? null;
            const d = mapBitrixContactToPrisma(row as Record<string, unknown>, primaryPhone, primaryEmail);
            const companyId = row["COMPANY_ID"] ? companyIdByLegacyId.get(Number(row["COMPANY_ID"])) ?? null : null;
            const ownerId = row["ASSIGNED_BY_ID"] ? userIdByLegacyId.get(Number(row["ASSIGNED_BY_ID"])) ?? null : null;
            return this.prisma.contact.update({
              where: { legacySource_legacyId: { legacySource: LEGACY_SOURCE, legacyId: id } },
              data: {
                firstName: d.firstName,
                lastName: d.lastName,
                middleName: d.middleName,
                phone: d.phone,
                email: d.email,
                position: d.position,
                address: d.address,
                externalCode: d.externalCode ?? undefined,
                region: d.region ?? undefined,
                addressInfo: d.addressInfo ?? undefined,
                city: d.city ?? undefined,
                clientType: d.clientType ?? undefined,
                companyId,
                ownerId,
                legacyRaw: d.legacyRaw as object,
                syncedAt: d.syncedAt,
              },
            });
          }),
        );
        cStats.updated += chunk.length;
      } catch (e) {
        this.logger.warn(`Contact batch update error (legacyIds ${chunk.map((r) => Number(r["ID"])).join(",")}): ${e}`);
        cStats.errors += chunk.length;
      }
    }
    return { contacts: cStats, contactPhones: pStats };
  }

  private async loadContactIdByLegacyId(): Promise<Map<number, string>> {
    const rows = await this.prisma.contact.findMany({
      where: { legacySource: LEGACY_SOURCE },
      select: { legacyId: true, id: true },
    });
    return new Map(rows.map((r) => [r.legacyId!, r.id]));
  }

  private async importLeadsBulk(
    pool: Pool,
    stats: { leads: ImportStats },
  ): Promise<void> {
    const batchSize = getBatchSize();
    const concurrency = getConcurrency();
    const companyIdByLegacyId = await this.loadCompanyIdByLegacyId();
    const contactIdByLegacyId = await this.loadContactIdByLegacyId();
    const userIdByLegacyId = await this.loadUserIdByLegacyId();
    this.logger.log("Bitrix initial import: leads (bulk)…");
    let batchIndex = 0;
    const runSlot = async (slotIndex: number): Promise<void> => {
      for (let offset = slotIndex * batchSize; ; offset += concurrency * batchSize) {
        const batch = await this.loadBatch(pool, "b_crm_lead", offset, batchSize);
        if (batch.length === 0) break;
        batchIndex++;
        const result = await this.processLeadBatch(
          batch,
          companyIdByLegacyId,
          contactIdByLegacyId,
          userIdByLegacyId,
        );
        stats.leads.created += result.created;
        stats.leads.updated += result.updated;
        stats.leads.skipped += result.skipped;
        stats.leads.errors += result.errors;
        this.logger.log(
          `leads batch ${batchIndex} (offset ${offset}) created: ${result.created} updated: ${result.updated} skipped: ${result.skipped} errors: ${result.errors}`,
        );
        await new Promise<void>((resolve) => setImmediate(resolve));
      }
    };
    await Promise.all(Array.from({ length: concurrency }, (_, i) => runSlot(i)));
    this.logger.log(
      `Bitrix import leads: created=${stats.leads.created} updated=${stats.leads.updated} skipped=${stats.leads.skipped} errors=${stats.leads.errors}`,
    );
  }

  private async processLeadBatch(
    batch: Record<string, unknown>[],
    companyIdByLegacyId: Map<number, string>,
    contactIdByLegacyId: Map<number, string>,
    userIdByLegacyId: Map<number, string>,
  ): Promise<ImportStats> {
    const result: ImportStats = { created: 0, updated: 0, skipped: 0, errors: 0 };
    const legacyIds = batch.map((r) => Number(r["ID"])).filter((id) => id > 0);
    if (legacyIds.length === 0) return result;
    const existing = await this.prisma.lead.findMany({
      where: { legacySource: LEGACY_SOURCE, legacyId: { in: legacyIds } },
      select: { legacyId: true, id: true },
    });
    const existingByLegacyId = new Map(existing.map((e) => [e.legacyId!, e]));
    const newRecords: Record<string, unknown>[] = [];
    const existingRecords: Record<string, unknown>[] = [];
    for (const row of batch) {
      const id = Number(row["ID"]);
      if (!id) {
        result.skipped++;
        continue;
      }
      const companyId = Number(row["COMPANY_ID"]);
      const ourCompanyId = companyId ? companyIdByLegacyId.get(companyId) : null;
      if (!ourCompanyId) {
        result.skipped++;
        continue;
      }
      if (existingByLegacyId.has(id)) existingRecords.push(row);
      else newRecords.push(row);
    }
    if (newRecords.length > 0) {
      try {
        const data = newRecords.map((row) => {
          const companyId = Number(row["COMPANY_ID"]);
          const ourCompanyId = companyIdByLegacyId.get(companyId)!;
          const contactId = row["CONTACT_ID"] ? contactIdByLegacyId.get(Number(row["CONTACT_ID"])) ?? null : null;
          const ownerId = row["ASSIGNED_BY_ID"] ? userIdByLegacyId.get(Number(row["ASSIGNED_BY_ID"])) ?? null : null;
          const d = mapBitrixLeadToPrisma(row as Record<string, unknown>, ourCompanyId, contactId, ownerId);
          return {
            ...d,
            legacyRaw: d.legacyRaw as object,
          };
        });
        const r = await this.prisma.lead.createMany({ data, skipDuplicates: true });
        result.created += r.count;
      } catch (e) {
        this.logger.warn(`Lead batch insert error: ${e}`);
        result.errors += newRecords.length;
      }
    }
    for (let i = 0; i < existingRecords.length; i += UPDATE_BATCH_SIZE) {
      const chunk = existingRecords.slice(i, i + UPDATE_BATCH_SIZE);
      try {
        await this.prisma.$transaction(
          chunk.map((row) => {
            const id = Number(row["ID"]);
            const companyId = Number(row["COMPANY_ID"]);
            const ourCompanyId = companyIdByLegacyId.get(companyId)!;
            const contactId = row["CONTACT_ID"] ? contactIdByLegacyId.get(Number(row["CONTACT_ID"])) ?? null : null;
            const ownerId = row["ASSIGNED_BY_ID"] ? userIdByLegacyId.get(Number(row["ASSIGNED_BY_ID"])) ?? null : null;
            const d = mapBitrixLeadToPrisma(row as Record<string, unknown>, ourCompanyId, contactId, ownerId);
            return this.prisma.lead.update({
              where: { legacySource_legacyId: { legacySource: LEGACY_SOURCE, legacyId: id } },
              data: {
                companyId: d.companyId,
                contactId: d.contactId,
                ownerId: d.ownerId,
                status: d.status,
                name: d.name,
                firstName: d.firstName,
                lastName: d.lastName,
                fullName: d.fullName,
                phone: d.phone,
                phoneNormalized: d.phoneNormalized,
                email: d.email,
                comment: d.comment,
                legacyRaw: d.legacyRaw as object,
                syncedAt: d.syncedAt,
              },
            });
          }),
        );
        result.updated += chunk.length;
      } catch (e) {
        this.logger.warn(`Lead batch update error (legacyIds ${chunk.map((r) => Number(r["ID"])).join(",")}): ${e}`);
        result.errors += chunk.length;
      }
    }
    return result;
  }

  private async loadOrderIdByLegacyId(): Promise<Map<number, string>> {
    const rows = await this.prisma.order.findMany({
      where: { legacySource: LEGACY_SOURCE },
      select: { legacyId: true, id: true },
    });
    return new Map(rows.map((r) => [r.legacyId!, r.id]));
  }

  private async importOrdersBulk(
    pool: Pool,
    stats: { orders: ImportStats },
  ): Promise<void> {
    const batchSize = getBatchSize();
    const concurrency = getConcurrency();
    const userIdByLegacyId = await this.loadUserIdByLegacyId();
    const companyIdByLegacyId = await this.loadCompanyIdByLegacyId();
    const contactIdByLegacyId = await this.loadContactIdByLegacyId();
    this.logger.log("Bitrix initial import: orders (bulk)…");
    let batchIndex = 0;
    const runSlot = async (slotIndex: number): Promise<void> => {
      for (let offset = slotIndex * batchSize; ; offset += concurrency * batchSize) {
        const batch = await this.loadBatch(pool, "b_crm_deal", offset, batchSize);
        if (batch.length === 0) break;
        const elementIds = batch.map((r) => Number(r["ID"])).filter((id) => id > 0);
        const dealUfByLegacyId = await this.loadDealUfBatch(pool, elementIds);
        for (const row of batch) {
          const id = Number(row["ID"]);
          const uf = dealUfByLegacyId.get(id);
          if (uf) Object.assign(row, uf);
        }
        batchIndex++;
        const result = await this.processOrderBatch(
          batch,
          userIdByLegacyId,
          companyIdByLegacyId,
          contactIdByLegacyId,
        );
        stats.orders.created += result.created;
        stats.orders.updated += result.updated;
        stats.orders.skipped += result.skipped;
        stats.orders.errors += result.errors;
        this.logger.log(
          `orders batch ${batchIndex} (offset ${offset}) created: ${result.created} updated: ${result.updated} skipped: ${result.skipped} errors: ${result.errors}`,
        );
        await new Promise<void>((resolve) => setImmediate(resolve));
      }
    };
    await Promise.all(Array.from({ length: concurrency }, (_, i) => runSlot(i)));
    this.logger.log(
      `Bitrix import orders: created=${stats.orders.created} updated=${stats.orders.updated} skipped=${stats.orders.skipped} errors=${stats.orders.errors}`,
    );
  }

  private async processOrderBatch(
    batch: Record<string, unknown>[],
    userIdByLegacyId: Map<number, string>,
    companyIdByLegacyId: Map<number, string>,
    contactIdByLegacyId: Map<number, string>,
  ): Promise<ImportStats> {
    const result: ImportStats = { created: 0, updated: 0, skipped: 0, errors: 0 };
    const legacyIds = batch.map((r) => Number(r["ID"])).filter((id) => id > 0);
    if (legacyIds.length === 0) return result;
    const existing = await this.prisma.order.findMany({
      where: { legacySource: LEGACY_SOURCE, legacyId: { in: legacyIds } },
      select: { legacyId: true, id: true },
    });
    const existingByLegacyId = new Map(existing.map((e) => [e.legacyId!, e]));
    const newRecords: Record<string, unknown>[] = [];
    const existingRecords: Record<string, unknown>[] = [];
    for (const row of batch) {
      const id = Number(row["ID"]);
      if (!id) {
        result.skipped++;
        continue;
      }
      const assignedById = Number(row["ASSIGNED_BY_ID"] ?? 0);
      const ownerId = assignedById ? userIdByLegacyId.get(assignedById) : null;
      if (!ownerId) {
        result.skipped++;
        continue;
      }
      if (existingByLegacyId.has(id)) existingRecords.push(row);
      else newRecords.push(row);
    }
    if (newRecords.length > 0) {
      try {
        const data = newRecords.map((row) => {
          const id = Number(row["ID"]);
          const companyId = row["COMPANY_ID"] ? companyIdByLegacyId.get(Number(row["COMPANY_ID"])) ?? null : null;
          const contactId = row["CONTACT_ID"] ? contactIdByLegacyId.get(Number(row["CONTACT_ID"])) ?? null : null;
          const clientId = contactId;
          const orderNumber = `BITRIX-${id}`;
          const d = mapBitrixDealToPrisma(
            row as Record<string, unknown>,
            companyId,
            clientId,
            contactId,
            userIdByLegacyId.get(Number(row["ASSIGNED_BY_ID"]))!,
            orderNumber,
          );
          return {
            orderNumber: d.orderNumber,
            companyId: d.companyId,
            clientId: d.clientId,
            contactId: d.contactId,
            ownerId: d.ownerId,
            status: d.status,
            paymentMethod: d.paymentMethod ?? undefined,
            currency: d.currency,
            subtotalAmount: d.subtotalAmount,
            discountAmount: d.discountAmount,
            totalAmount: d.totalAmount,
            paidAmount: d.paidAmount,
            debtAmount: d.debtAmount,
            comment: d.comment,
            legacySource: d.legacySource,
            legacyId: d.legacyId,
            legacyRaw: d.legacyRaw as object,
            syncedAt: d.syncedAt,
            createdAt: d.createdAt,
            updatedAt: d.updatedAt,
            orderSource: "CRM" as const,
          };
        });
        const r = await this.prisma.order.createMany({ data, skipDuplicates: true });
        result.created += r.count;
      } catch (e) {
        this.logger.warn(`Order batch insert error: ${e}`);
        result.errors += newRecords.length;
      }
    }
    const orderTxTimeout = Number(process.env.BITRIX_IMPORT_ORDER_TX_TIMEOUT_MS) || 60_000;
    for (let i = 0; i < existingRecords.length; i += UPDATE_BATCH_SIZE) {
      const chunk = existingRecords.slice(i, i + UPDATE_BATCH_SIZE);
      try {
        await this.prisma.$transaction(
          async (tx) => {
            for (const row of chunk) {
              const id = Number(row["ID"]);
              const companyId = row["COMPANY_ID"] ? companyIdByLegacyId.get(Number(row["COMPANY_ID"])) ?? null : null;
              const contactId = row["CONTACT_ID"] ? contactIdByLegacyId.get(Number(row["CONTACT_ID"])) ?? null : null;
              const clientId = contactId;
              const ownerId = userIdByLegacyId.get(Number(row["ASSIGNED_BY_ID"]))!;
              const orderNumber = `BITRIX-${id}`;
              const d = mapBitrixDealToPrisma(
                row as Record<string, unknown>,
                companyId,
                clientId,
                contactId,
                ownerId,
                orderNumber,
              );
              await tx.order.update({
                where: { legacySource_legacyId: { legacySource: LEGACY_SOURCE, legacyId: id } },
                data: {
                  companyId: d.companyId,
                  clientId: d.clientId,
                  contactId: d.contactId,
                  ownerId: d.ownerId,
                  status: d.status,
                  paymentMethod: d.paymentMethod ?? undefined,
                  currency: d.currency,
                  subtotalAmount: d.subtotalAmount,
                  discountAmount: d.discountAmount,
                  totalAmount: d.totalAmount,
                  paidAmount: d.paidAmount,
                  debtAmount: d.debtAmount,
                  comment: d.comment,
                  legacyRaw: d.legacyRaw as object,
                  syncedAt: d.syncedAt,
                  createdAt: d.createdAt,
                  updatedAt: d.updatedAt,
                },
              });
            }
          },
          { timeout: orderTxTimeout },
        );
        result.updated += chunk.length;
      } catch (e) {
        this.logger.warn(`Order batch update error (legacyIds ${chunk.map((r) => Number(r["ID"])).join(",")}): ${e}`);
        result.errors += chunk.length;
      }
    }
    return result;
  }

  private async importOrderItemsBulk(
    pool: Pool,
    stats: { orderItems: ImportStats },
  ): Promise<void> {
    const batchSize = getBatchSize();
    const concurrency = getConcurrency();
    const orderIdByLegacyId = await this.loadOrderIdByLegacyId();
    this.logger.log("Bitrix initial import: order items (bulk)…");
    let batchIndex = 0;
    const runSlot = async (slotIndex: number): Promise<void> => {
      for (let offset = slotIndex * batchSize; ; offset += concurrency * batchSize) {
        const batch = await this.loadBatch(pool, "b_crm_product_row", offset, batchSize);
        if (batch.length === 0) break;
        batchIndex++;
        const result = await this.processOrderItemBatch(batch, orderIdByLegacyId);
        stats.orderItems.created += result.created;
        stats.orderItems.updated += result.updated;
        stats.orderItems.skipped += result.skipped;
        stats.orderItems.errors += result.errors;
        this.logger.log(
          `orderItems batch ${batchIndex} (offset ${offset}) created: ${result.created} updated: ${result.updated} skipped: ${result.skipped} errors: ${result.errors}`,
        );
        await new Promise<void>((resolve) => setImmediate(resolve));
      }
    };
    await Promise.all(Array.from({ length: concurrency }, (_, i) => runSlot(i)));
    this.logger.log(
      `Bitrix import order items: created=${stats.orderItems.created} updated=${stats.orderItems.updated} skipped=${stats.orderItems.skipped} errors=${stats.orderItems.errors}`,
    );
  }

  private async processOrderItemBatch(
    batch: Record<string, unknown>[],
    orderIdByLegacyId: Map<number, string>,
  ): Promise<ImportStats> {
    const result: ImportStats = { created: 0, updated: 0, skipped: 0, errors: 0 };
    const legacyIds = batch.map((r) => Number(r["ID"])).filter((id) => id > 0);
    if (legacyIds.length === 0) return result;
    const existing = await this.prisma.orderItem.findMany({
      where: { legacySource: LEGACY_SOURCE, legacyId: { in: legacyIds } },
      select: { legacyId: true, id: true },
    });
    const existingByLegacyId = new Map(existing.map((e) => [e.legacyId!, e]));
    const newRecords: Record<string, unknown>[] = [];
    const existingRecords: Record<string, unknown>[] = [];
    for (const row of batch) {
      const id = Number(row["ID"]);
      const ownerId = Number(row["OWNER_ID"] ?? row["DEAL_ID"] ?? 0);
      if (!id || !ownerId) {
        result.skipped++;
        continue;
      }
      const orderId = orderIdByLegacyId.get(ownerId);
      if (!orderId) {
        result.skipped++;
        continue;
      }
      if (existingByLegacyId.has(id)) existingRecords.push(row);
      else newRecords.push(row);
    }
    const productId: string | null = null;
    if (newRecords.length > 0) {
      try {
        const data = newRecords.map((row) => {
          const id = Number(row["ID"]);
          const ownerId = Number(row["OWNER_ID"] ?? row["DEAL_ID"] ?? 0);
          const orderId = orderIdByLegacyId.get(ownerId)!;
          const productName = row["PRODUCT_NAME"] != null ? String(row["PRODUCT_NAME"]).trim() : null;
          const d = mapBitrixProductRowToPrisma(
            row as Record<string, unknown>,
            orderId,
            productId,
            productName,
          );
          return {
            orderId: d.orderId,
            productId: d.productId,
            productNameSnapshot: d.productNameSnapshot,
            qty: d.qty,
            price: d.price,
            lineTotal: d.lineTotal,
            legacySource: d.legacySource,
            legacyId: d.legacyId,
            legacyRaw: d.legacyRaw as object,
            syncedAt: d.syncedAt,
          };
        });
        const r = await this.prisma.orderItem.createMany({ data, skipDuplicates: true });
        result.created += r.count;
      } catch (e) {
        this.logger.warn(`OrderItem batch insert error: ${e}`);
        result.errors += newRecords.length;
      }
    }
    for (let i = 0; i < existingRecords.length; i += UPDATE_BATCH_SIZE) {
      const chunk = existingRecords.slice(i, i + UPDATE_BATCH_SIZE);
      try {
        await this.prisma.$transaction(
          chunk.map((row) => {
            const id = Number(row["ID"]);
            const ownerId = Number(row["OWNER_ID"] ?? row["DEAL_ID"] ?? 0);
            const orderId = orderIdByLegacyId.get(ownerId)!;
            const productName = row["PRODUCT_NAME"] != null ? String(row["PRODUCT_NAME"]).trim() : null;
            const d = mapBitrixProductRowToPrisma(
              row as Record<string, unknown>,
              orderId,
              productId,
              productName,
            );
            return this.prisma.orderItem.update({
              where: { legacySource_legacyId: { legacySource: LEGACY_SOURCE, legacyId: id } },
              data: {
                productId: d.productId,
                productNameSnapshot: d.productNameSnapshot,
                qty: d.qty,
                price: d.price,
                lineTotal: d.lineTotal,
                legacyRaw: d.legacyRaw as object,
                syncedAt: d.syncedAt,
              },
            });
          }),
        );
        result.updated += chunk.length;
      } catch (e) {
        this.logger.warn(`OrderItem batch update error (legacyIds ${chunk.map((r) => Number(r["ID"])).join(",")}): ${e}`);
        result.errors += chunk.length;
      }
    }
    return result;
  }

  private async queryRows(pool: Pool, sql: string): Promise<unknown[]> {
    const [rows] = await pool.query(sql);
    return Array.isArray(rows) ? (rows as unknown[]) : [];
  }

  private groupFieldMultiByElement(
    rows: Record<string, unknown>[],
    typeId: string,
  ): Map<number, { value: string; typeId: string; rowId: number }[]> {
    const map = new Map<number, { value: string; typeId: string; rowId: number }[]>();
    for (const row of rows) {
      const rowTypeId = String(row["TYPE_ID"] ?? "").toUpperCase();
      if (rowTypeId !== typeId) continue;
      const elementId = Number(row["ELEMENT_ID"] ?? row["ENTITY_ID"] ?? 0);
      const value = String(row["VALUE"] ?? "").trim();
      const rowId = Number(row["ID"] ?? 0);
      if (!elementId) continue;
      const list = map.get(elementId) ?? [];
      list.push({ value, typeId: rowTypeId, rowId });
      map.set(elementId, list);
    }
    return map;
  }

  private async upsertUser(row: Record<string, unknown>): Promise<"created" | "updated" | "skipped" | "error"> {
    const id = Number(row["ID"]);
    if (!id) return "skipped";
    try {
      const data = mapBitrixUserToPrisma(row);
      const existing = await this.prisma.user.findUnique({
        where: { legacySource_legacyId: { legacySource: LEGACY_SOURCE, legacyId: id } },
      });
      if (existing) {
        const emailConflict = await this.prisma.user.findFirst({
          where: { email: data.email, id: { not: existing.id } },
        });
        const updateEmail = emailConflict ? `bitrix-user-${id}@legacy.local` : data.email;
        await this.prisma.user.update({
          where: { id: existing.id },
          data: {
            fullName: data.fullName,
            legacyRaw: data.legacyRaw as object,
            syncedAt: data.syncedAt,
            ...(updateEmail !== existing.email ? { email: updateEmail } : {}),
          },
        });
        return "updated";
      }
      const emailUsed = await this.prisma.user.findUnique({ where: { email: data.email } });
      await this.prisma.user.create({
        data: {
          ...data,
          email: emailUsed ? `bitrix-user-${id}@legacy.local` : data.email,
          legacyRaw: data.legacyRaw as object,
        },
      });
      return "created";
    } catch (e) {
      this.logger.warn(`User legacyId=${id} error: ${e}`);
      return "error";
    }
  }

  private async upsertCompany(row: Record<string, unknown>): Promise<"created" | "updated" | "skipped" | "error"> {
    const id = Number(row["ID"]);
    if (!id) return "skipped";
    try {
      const data = mapBitrixCompanyToPrisma(row);
      const existed = await this.prisma.company.findUnique({
        where: { legacySource_legacyId: { legacySource: LEGACY_SOURCE, legacyId: id } },
      });
      await this.prisma.company.upsert({
        where: { legacySource_legacyId: { legacySource: LEGACY_SOURCE, legacyId: id } },
        create: {
          name: data.name,
          edrpou: data.edrpou,
          taxId: data.taxId,
          legacySource: data.legacySource,
          legacyId: data.legacyId,
          legacyRaw: data.legacyRaw as object,
          syncedAt: data.syncedAt,
        },
        update: {
          name: data.name,
          edrpou: data.edrpou,
          taxId: data.taxId,
          legacyRaw: data.legacyRaw as object,
          syncedAt: data.syncedAt,
        },
      });
      return existed ? "updated" : "created";
    } catch (e) {
      this.logger.warn(`Company legacyId=${id} error: ${e}`);
      return "error";
    }
  }

  private async upsertContact(
    row: Record<string, unknown>,
    primaryPhone: string,
    primaryEmail: string | null,
  ): Promise<{ result: "created" | "updated" | "skipped" | "error"; contactId: string | null }> {
    const id = Number(row["ID"]);
    if (!id) return { result: "skipped", contactId: null };
    try {
      const data = mapBitrixContactToPrisma(row, primaryPhone, primaryEmail);
      const existing = await this.prisma.contact.findUnique({
        where: { legacySource_legacyId: { legacySource: LEGACY_SOURCE, legacyId: id } },
      });
      const companyId = row["COMPANY_ID"] ? await this.resolveCompanyId(Number(row["COMPANY_ID"])) : null;
      const ownerId = row["ASSIGNED_BY_ID"] ? await this.resolveUserId(Number(row["ASSIGNED_BY_ID"])) : null;

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
        await this.prisma.contact.update({
          where: { id: existing.id },
          data: payload,
        });
        return { result: "updated", contactId: existing.id };
      }
      const created = await this.prisma.contact.create({
        data: payload,
      });
      return { result: "created", contactId: created.id };
    } catch (e) {
      this.logger.warn(`Contact legacyId=${id} error: ${e}`);
      return { result: "error", contactId: null };
    }
  }

  private async upsertContactPhone(
    contactId: string,
    value: string,
    typeId: string,
    legacyRowId: number,
  ): Promise<"created" | "updated" | "skipped" | "error"> {
    const normalized = normalizePhoneDigits(value);
    if (!normalized) return "skipped";
    try {
      const existing = await this.prisma.contactPhone.findUnique({
        where: { contactId_phoneNormalized: { contactId, phoneNormalized: normalized } },
      });
      const payload = {
        phone: value,
        phoneNormalized: normalized,
        label: typeId === "PHONE" ? null : typeId,
        legacySource: LEGACY_SOURCE,
        legacyId: legacyRowId,
        legacyRaw: { typeId, value },
        syncedAt: new Date(),
      };
      if (existing) {
        await this.prisma.contactPhone.update({
          where: { id: existing.id },
          data: payload,
        });
        return "updated";
      }
      await this.prisma.contactPhone.create({
        data: {
          contactId,
          ...payload,
          legacyRaw: payload.legacyRaw as object,
        },
      });
      return "created";
    } catch (e) {
      this.logger.warn(`ContactPhone contactId=${contactId} legacyRowId=${legacyRowId} error: ${e}`);
      return "error";
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

  private async upsertLead(row: Record<string, unknown>): Promise<"created" | "updated" | "skipped" | "error"> {
    const id = Number(row["ID"]);
    if (!id) return "skipped";
    const companyId = Number(row["COMPANY_ID"]);
    const ourCompanyId = companyId ? await this.resolveCompanyId(companyId) : null;
    if (!ourCompanyId) {
      this.logger.debug(`Lead legacyId=${id} skipped: no company`);
      return "skipped";
    }
    const contactId = row["CONTACT_ID"] ? await this.resolveContactId(Number(row["CONTACT_ID"])) : null;
    const ownerId = row["ASSIGNED_BY_ID"] ? await this.resolveUserId(Number(row["ASSIGNED_BY_ID"])) : null;
    try {
      const data = mapBitrixLeadToPrisma(row, ourCompanyId, contactId, ownerId);
      const existed = await this.prisma.lead.findUnique({
        where: { legacySource_legacyId: { legacySource: LEGACY_SOURCE, legacyId: id } },
      });
      await this.prisma.lead.upsert({
        where: { legacySource_legacyId: { legacySource: LEGACY_SOURCE, legacyId: id } },
        create: {
          ...data,
          legacyRaw: data.legacyRaw as object,
        },
        update: {
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
          legacyRaw: data.legacyRaw as object,
          syncedAt: data.syncedAt,
        },
      });
      return existed ? "updated" : "created";
    } catch (e) {
      this.logger.warn(`Lead legacyId=${id} error: ${e}`);
      return "error";
    }
  }

  private async upsertOrder(row: Record<string, unknown>): Promise<"created" | "updated" | "skipped" | "error"> {
    const id = Number(row["ID"]);
    if (!id) return "skipped";
    const assignedById = Number(row["ASSIGNED_BY_ID"] ?? 0);
    const ownerId = await this.resolveUserId(assignedById);
    if (!ownerId) {
      this.logger.debug(`Order legacyId=${id} skipped: no owner (ASSIGNED_BY_ID=${assignedById})`);
      return "skipped";
    }
    const companyId = row["COMPANY_ID"] ? await this.resolveCompanyId(Number(row["COMPANY_ID"])) : null;
    const contactId = row["CONTACT_ID"] ? await this.resolveContactId(Number(row["CONTACT_ID"])) : null;
    const clientId = contactId;
    const orderNumber = `BITRIX-${id}`;
    try {
      const data = mapBitrixDealToPrisma(row, companyId, clientId, contactId, ownerId, orderNumber);
      const existed = await this.prisma.order.findUnique({
        where: { legacySource_legacyId: { legacySource: LEGACY_SOURCE, legacyId: id } },
      });
      await this.prisma.order.upsert({
        where: { legacySource_legacyId: { legacySource: LEGACY_SOURCE, legacyId: id } },
        create: {
          ...data,
          legacyRaw: data.legacyRaw as object,
        },
        update: {
          companyId: data.companyId,
          clientId: data.clientId,
          contactId: data.contactId,
          ownerId: data.ownerId,
          status: data.status,
          currency: data.currency,
          subtotalAmount: data.subtotalAmount,
          discountAmount: data.discountAmount,
          totalAmount: data.totalAmount,
          paidAmount: data.paidAmount,
          debtAmount: data.debtAmount,
          comment: data.comment,
          legacyRaw: data.legacyRaw as object,
          syncedAt: data.syncedAt,
          createdAt: data.createdAt,
          updatedAt: data.updatedAt,
        },
      });
      return existed ? "updated" : "created";
    } catch (e) {
      this.logger.warn(`Order legacyId=${id} error: ${e}`);
      return "error";
    }
  }

  private async upsertOrderItem(row: Record<string, unknown>): Promise<"created" | "updated" | "skipped" | "error"> {
    const id = Number(row["ID"]);
    const ownerId = Number(row["OWNER_ID"] ?? row["DEAL_ID"] ?? 0);
    if (!id || !ownerId) return "skipped";
    const order = await this.prisma.order.findUnique({
      where: { legacySource_legacyId: { legacySource: LEGACY_SOURCE, legacyId: ownerId } },
    });
    if (!order) {
      this.logger.debug(`OrderItem legacyId=${id} skipped: order legacyId=${ownerId} not found`);
      return "skipped";
    }
    const productName = row["PRODUCT_NAME"] != null ? String(row["PRODUCT_NAME"]).trim() : null;
    const { sku } = parseBitrixProductNameForSku(productName);
    let productId: string | null = null;
    if (sku) {
      const product = await this.prisma.product.findUnique({ where: { sku } });
      productId = product?.id ?? null;
    }
    try {
      const data = mapBitrixProductRowToPrisma(row, order.id, productId, productName);
      const existed = await this.prisma.orderItem.findUnique({
        where: { legacySource_legacyId: { legacySource: LEGACY_SOURCE, legacyId: id } },
      });
      await this.prisma.orderItem.upsert({
        where: { legacySource_legacyId: { legacySource: LEGACY_SOURCE, legacyId: id } },
        create: {
          orderId: data.orderId,
          productId: data.productId,
          productNameSnapshot: data.productNameSnapshot,
          qty: data.qty,
          price: data.price,
          lineTotal: data.lineTotal,
          legacySource: data.legacySource,
          legacyId: data.legacyId,
          legacyRaw: data.legacyRaw as object,
          syncedAt: data.syncedAt,
        },
        update: {
          productId: data.productId,
          productNameSnapshot: data.productNameSnapshot,
          qty: data.qty,
          price: data.price,
          lineTotal: data.lineTotal,
          legacyRaw: data.legacyRaw as object,
          syncedAt: data.syncedAt,
        },
      });
      return existed ? "updated" : "created";
    } catch (e) {
      this.logger.warn(`OrderItem legacyId=${id} error: ${e}`);
      return "error";
    }
  }
}

import { BadRequestException, Injectable, NotFoundException } from "@nestjs/common";
import type { BankAccount, BankProvider } from "@prisma/client";
import { Prisma } from "@prisma/client";
import { PrismaService } from "../prisma/prisma.service";
import type { CreateBankAccountDto } from "./dto/create-bank-account.dto";
import type { UpdateBankAccountDto } from "./dto/update-bank-account.dto";
import type { Privat24Credentials } from "./privat24.client";
import { Privat24Client } from "./privat24.client";

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function maskValue(value: string | undefined): string {
  if (!value || value.length < 4) return value ? "••••" : "";
  return "••••" + value.slice(-4);
}

type CredentialsPayload = Record<string, unknown> | null;
const BANK_VISIBILITY_SETTING_ID = "bankAccountVisibilityByUser";
const USER_DEFAULT_BANK_SETTING_ID = "userDefaultBankAccountId";
/** JSON: { bankAccountId: string | null } — ФОП за замовчуванням для нових замовлень з магазину. */
const STORE_DEFAULT_BANK_SETTING_ID = "storeDefaultBankAccountId";

type VisibilityMap = Record<string, string[]>;
type UserDefaultMap = Record<string, string>;

function parseStoreDefaultBankFromSettingValue(value: unknown): string | null | undefined {
  if (value === undefined) return undefined;
  if (value === null) return null;
  if (typeof value === "string") {
    const t = value.trim();
    return t.length ? t : null;
  }
  if (typeof value === "object" && !Array.isArray(value) && value !== null) {
    const id = (value as { bankAccountId?: unknown }).bankAccountId;
    if (id === null || id === undefined) return null;
    if (typeof id === "string") {
      const t = id.trim();
      return t.length ? t : null;
    }
  }
  return undefined;
}

function maskCredentials(credentials: CredentialsPayload): {
  clientIdMasked?: string;
  tokenMasked?: string;
  idMasked?: string;
} {
  if (!credentials || typeof credentials !== "object") return {};
  const c = credentials as Record<string, unknown>;
  const clientId = typeof c.clientId === "string" ? c.clientId : undefined;
  const token = typeof c.token === "string" ? c.token : undefined;
  const groupId = typeof c.id === "string" ? c.id : undefined;
  return {
    ...(clientId !== undefined && { clientIdMasked: maskValue(clientId) }),
    ...(token !== undefined && { tokenMasked: maskValue(token) }),
    ...(groupId !== undefined && { idMasked: groupId ? maskValue(groupId) : "" }),
  };
}

function toMasked(account: BankAccount): Omit<BankAccount, "credentials"> & { credentialsMasked?: { clientIdMasked?: string; tokenMasked?: string; idMasked?: string } } {
  const { credentials, ...rest } = account;
  return {
    ...rest,
    credentialsMasked: maskCredentials(credentials as CredentialsPayload),
  };
}

@Injectable()
export class BankAccountsService {
  constructor(private readonly prisma: PrismaService) {}

  private async getVisibilityMap(): Promise<VisibilityMap> {
    const row = await this.prisma.systemSetting.findUnique({
      where: { id: BANK_VISIBILITY_SETTING_ID },
    });
    if (!row || typeof row.value !== "object" || row.value == null) return {};
    return row.value as VisibilityMap;
  }

  private async getUserDefaultMap(): Promise<UserDefaultMap> {
    const row = await this.prisma.systemSetting.findUnique({
      where: { id: USER_DEFAULT_BANK_SETTING_ID },
    });
    if (!row || typeof row.value !== "object" || row.value == null) return {};
    return row.value as UserDefaultMap;
  }

  private async saveVisibilityMap(map: VisibilityMap) {
    await this.prisma.systemSetting.upsert({
      where: { id: BANK_VISIBILITY_SETTING_ID },
      update: { value: map as Prisma.InputJsonValue },
      create: { id: BANK_VISIBILITY_SETTING_ID, value: map as Prisma.InputJsonValue },
    });
  }

  private async saveUserDefaultMap(map: UserDefaultMap) {
    await this.prisma.systemSetting.upsert({
      where: { id: USER_DEFAULT_BANK_SETTING_ID },
      update: { value: map as Prisma.InputJsonValue },
      create: { id: USER_DEFAULT_BANK_SETTING_ID, value: map as Prisma.InputJsonValue },
    });
  }

  async create(dto: CreateBankAccountDto) {
    const created = await this.prisma.bankAccount.create({
      data: {
        provider: (dto.provider as BankProvider) ?? "PRIVAT24",
        name: dto.name,
        currency: dto.currency,
        iban: dto.iban ?? null,
        accountNumber: dto.accountNumber ?? null,
        externalCode: dto.externalCode ?? null,
        documentRequisites:
          dto.documentRequisites == null
            ? Prisma.JsonNull
            : (dto.documentRequisites as Prisma.InputJsonValue),
        credentials: dto.credentials ? (dto.credentials as object) : undefined,
        isActive: dto.isActive ?? true,
      },
    });
    return toMasked(created);
  }

  async list() {
    const accounts = await this.prisma.bankAccount.findMany({
      orderBy: { createdAt: "desc" },
    });
    return accounts.map(toMasked);
  }

  /** For order form: active accounts visible to user, with user's default first. */
  async listForOrder(
    userId?: string,
  ): Promise<{
    accounts: Array<{ id: string; name: string; currency: string }>;
    defaultBankAccountId: string | null;
  }> {
    const accounts = await this.prisma.bankAccount.findMany({
      where: { isActive: true },
      orderBy: { name: "asc" },
      select: { id: true, name: true, currency: true },
    });
    if (!userId) {
      return { accounts, defaultBankAccountId: null };
    }

    const [visibilityMap, userDefaultMap] = await Promise.all([
      this.getVisibilityMap(),
      this.getUserDefaultMap(),
    ]);

    const visible = accounts.filter((acc) => {
      const userIds = visibilityMap[acc.id];
      if (!Array.isArray(userIds) || userIds.length === 0) return true;
      return userIds.includes(userId);
    });

    const defaultBankId = userDefaultMap[userId] ?? null;
    const defaultInVisible =
      defaultBankId && visible.some((a) => a.id === defaultBankId) ? defaultBankId : null;

    let ordered = [...visible];
    if (defaultBankId) {
      const idx = ordered.findIndex((x) => x.id === defaultBankId);
      if (idx > 0) {
        const [chosen] = ordered.splice(idx, 1);
        ordered = [chosen, ...ordered];
      }
    }

    return { accounts: ordered, defaultBankAccountId: defaultInVisible };
  }

  /**
   * Active bank account IDs visible to the user (same rules as listForOrder).
   * Used to scope payments, transactions, and sync for non-admin users.
   */
  async getVisibleBankAccountIds(userId: string): Promise<string[]> {
    const accounts = await this.prisma.bankAccount.findMany({
      where: { isActive: true },
      select: { id: true },
    });
    const visibilityMap = await this.getVisibilityMap();
    return accounts
      .filter((acc) => {
        const userIds = visibilityMap[acc.id];
        if (!Array.isArray(userIds) || userIds.length === 0) return true;
        return userIds.includes(userId);
      })
      .map((a) => a.id);
  }

  async getVisibilitySettings() {
    const [users, accounts, visibilityMap, userDefaultMap, storeRow] = await Promise.all([
      this.prisma.user.findMany({
        orderBy: [{ fullName: "asc" }, { email: "asc" }],
        select: { id: true, fullName: true, email: true, role: true },
      }),
      this.prisma.bankAccount.findMany({
        where: { isActive: true },
        orderBy: { name: "asc" },
        select: { id: true, name: true },
      }),
      this.getVisibilityMap(),
      this.getUserDefaultMap(),
      this.prisma.systemSetting.findUnique({
        where: { id: STORE_DEFAULT_BANK_SETTING_ID },
        select: { value: true },
      }),
    ]);

    const parsed = storeRow ? parseStoreDefaultBankFromSettingValue(storeRow.value) : undefined;
    const storeDefaultBankAccountId =
      parsed === undefined ? null : parsed === null ? null : parsed;

    return { users, accounts, visibilityMap, userDefaultMap, storeDefaultBankAccountId };
  }

  /**
   * Для checkout магазину: запис у SystemSetting має пріоритет; якщо запису ще немає — fallback на STORE_DEFAULT_BANK_ACCOUNT_ID.
   */
  async resolveStoreDefaultBankAccountIdForCheckout(): Promise<string | null> {
    const row = await this.prisma.systemSetting.findUnique({
      where: { id: STORE_DEFAULT_BANK_SETTING_ID },
      select: { value: true },
    });
    const parsed = row ? parseStoreDefaultBankFromSettingValue(row.value) : undefined;

    let id: string | null = null;
    if (parsed === undefined) {
      id = process.env.STORE_DEFAULT_BANK_ACCOUNT_ID?.trim() || null;
    } else {
      id = parsed;
    }

    if (!id) return null;

    const acc = await this.prisma.bankAccount.findUnique({
      where: { id },
      select: { id: true, isActive: true },
    });
    if (!acc) {
      throw new BadRequestException(
        "У налаштуваннях ФОП обрано рахунок, який не знайдено. Оновіть «ФОП за замовчуванням для магазину» у Налаштування → ФОП.",
      );
    }
    if (!acc.isActive) {
      throw new BadRequestException(
        "Рахунок ФОП для магазину вимкнено. Увімкніть його або оберіть інший у Налаштування → ФОП.",
      );
    }
    return acc.id;
  }

  async setStoreDefaultBankAccountId(bankAccountId: string | null) {
    let next: string | null = bankAccountId?.trim() || null;
    if (next) {
      const acc = await this.prisma.bankAccount.findUnique({
        where: { id: next },
        select: { id: true, isActive: true },
      });
      if (!acc) throw new NotFoundException("Bank account not found");
      if (!acc.isActive) {
        throw new BadRequestException("Оберіть активний рахунок ФОП");
      }
    } else {
      next = null;
    }

    if (next === null) {
      await this.prisma.systemSetting.deleteMany({ where: { id: STORE_DEFAULT_BANK_SETTING_ID } });
    } else {
      await this.prisma.systemSetting.upsert({
        where: { id: STORE_DEFAULT_BANK_SETTING_ID },
        update: { value: { bankAccountId: next } as Prisma.InputJsonValue },
        create: { id: STORE_DEFAULT_BANK_SETTING_ID, value: { bankAccountId: next } as Prisma.InputJsonValue },
      });
    }

    return { ok: true as const, storeDefaultBankAccountId: next };
  }

  async updateVisibilitySettings(body: {
    accountId: string;
    userIds: string[];
    defaultForUserIds?: string[];
  }) {
    const accountId = String(body.accountId || "").trim();
    if (!accountId) throw new BadRequestException("accountId is required");

    const account = await this.prisma.bankAccount.findUnique({
      where: { id: accountId },
      select: { id: true },
    });
    if (!account) throw new NotFoundException("Bank account not found");

    const userIds = Array.from(new Set((body.userIds ?? []).map((x) => String(x).trim()).filter(Boolean)));
    const defaultForUserIds = Array.from(
      new Set((body.defaultForUserIds ?? []).map((x) => String(x).trim()).filter(Boolean)),
    );

    const existingUsers = await this.prisma.user.findMany({
      where: { id: { in: Array.from(new Set([...userIds, ...defaultForUserIds])) } },
      select: { id: true },
    });
    const validUserIds = new Set(existingUsers.map((u) => u.id));
    const cleanVisible = userIds.filter((id) => validUserIds.has(id));
    const cleanDefaults = defaultForUserIds.filter((id) => validUserIds.has(id));

    const [visibilityMap, userDefaultMap] = await Promise.all([
      this.getVisibilityMap(),
      this.getUserDefaultMap(),
    ]);

    visibilityMap[accountId] = cleanVisible;

    // Remove old defaults that pointed to this account, then set new defaults.
    Object.keys(userDefaultMap).forEach((uid) => {
      if (userDefaultMap[uid] === accountId) delete userDefaultMap[uid];
    });
    cleanDefaults.forEach((uid) => {
      userDefaultMap[uid] = accountId;
      // If a user has default on this account, ensure visibility is granted.
      if (!visibilityMap[accountId].includes(uid)) visibilityMap[accountId].push(uid);
    });

    await Promise.all([this.saveVisibilityMap(visibilityMap), this.saveUserDefaultMap(userDefaultMap)]);
    return { ok: true, visibilityMap, userDefaultMap };
  }

  async getById(id: string) {
    const account = await this.prisma.bankAccount.findUnique({
      where: { id },
      include: { transactions: { take: 0 } },
    });
    if (!account) throw new NotFoundException("Bank account not found");
    return toMasked(account);
  }

  async update(id: string, dto: UpdateBankAccountDto) {
    const current = await this.prisma.bankAccount.findUnique({
      where: { id },
    });
    if (!current) throw new NotFoundException("Bank account not found");

    const data: {
      name?: string;
      isActive?: boolean;
      syncWindowDays?: number;
      iban?: string | null;
      externalCode?: string | null;
      documentRequisites?: Prisma.InputJsonValue | typeof Prisma.JsonNull;
      credentials?: object;
    } = {
      ...(dto.name !== undefined && { name: dto.name }),
      ...(dto.isActive !== undefined && { isActive: dto.isActive }),
      ...(dto.syncWindowDays !== undefined && { syncWindowDays: dto.syncWindowDays }),
      ...(dto.iban !== undefined && { iban: dto.iban === "" ? null : dto.iban }),
      ...(dto.externalCode !== undefined && { externalCode: dto.externalCode === "" ? null : dto.externalCode }),
      ...(dto.documentRequisites !== undefined && {
        documentRequisites:
          dto.documentRequisites == null
            ? Prisma.JsonNull
            : (dto.documentRequisites as Prisma.InputJsonValue),
      }),
    };

    if (dto.credentials !== undefined) {
      const existing = (current.credentials as Record<string, unknown>) ?? {};
      const next: Record<string, unknown> = { ...existing };
      const dtoHasClientId = Object.prototype.hasOwnProperty.call(dto.credentials, "clientId");
      const dtoHasId = Object.prototype.hasOwnProperty.call(dto.credentials, "id");
      const existingClientId = typeof existing.clientId === "string" ? existing.clientId : undefined;
      const existingId = typeof existing.id === "string" ? existing.id : undefined;
      if (Object.prototype.hasOwnProperty.call(dto.credentials, "clientId")) {
        next.clientId = dto.credentials.clientId === "" ? undefined : dto.credentials.clientId;
      }
      if (Object.prototype.hasOwnProperty.call(dto.credentials, "token")) {
        next.token = dto.credentials.token === "" ? undefined : dto.credentials.token;
      }
      if (Object.prototype.hasOwnProperty.call(dto.credentials, "id")) {
        next.id = dto.credentials.id === "" ? undefined : dto.credentials.id;
      }
      // Legacy cleanup: older UI stored App ID UUID into `id`.
      // If user updates App ID but does not touch `id`, clear stale UUID `id`.
      const staleUuidId = dtoHasClientId && !dtoHasId && typeof next.id === "string" && UUID_RE.test(next.id);
      if (staleUuidId || (dtoHasClientId && !dtoHasId && existingId && existingClientId && existingId === existingClientId)) {
        next.id = undefined;
      }
      data.credentials = next as object;
    }

    const updated = await this.prisma.bankAccount.update({
      where: { id },
      data,
    });
    return toMasked(updated);
  }

  async delete(id: string) {
    const deleted = await this.prisma.bankAccount.delete({
      where: { id },
    });
    return toMasked(deleted);
  }

  /**
   * Fetch account requisites (legalName, bankDetails) from Privat24 by IBAN.
   * Uses stored credentials, or override from body when provided (e.g. token from form before save).
   */
  async getRequisitesFromBank(
    id: string,
    credentialsOverride?: { token?: string; clientId?: string; id?: string },
  ): Promise<{
    legalName?: string;
    taxId?: string;
    address?: string;
    bankDetails?: string;
    iban?: string;
    mfo?: string;
  }> {
    const account = await this.prisma.bankAccount.findUnique({
      where: { id },
    });
    if (!account) throw new NotFoundException("Bank account not found");
    if (account.provider !== "PRIVAT24") {
      throw new BadRequestException("Requisites from bank are only supported for PRIVAT24 accounts");
    }
    const credentials = account.credentials as Record<string, unknown> | null;
    const token =
      credentialsOverride?.token?.trim() ||
      (credentials && typeof credentials.token === "string" ? credentials.token : null);
    if (!token) {
      throw new BadRequestException(
        "API token is required. Enter TOKEN in the form below (and save), or pass it in the request.",
      );
    }
    const iban = account.iban?.replace(/\s/g, "").toUpperCase();
    if (!iban) {
      throw new BadRequestException("Bank account has no IBAN. Set IBAN in account settings first.");
    }

    const creds: Privat24Credentials = {
      token,
      clientId:
        credentialsOverride?.clientId?.trim() ||
        (credentials && typeof credentials.clientId === "string" ? credentials.clientId : undefined),
      id:
        credentialsOverride?.id?.trim() ||
        (credentials && typeof credentials.id === "string" ? credentials.id : undefined),
    };
    const client = new Privat24Client();
    const to = new Date();
    const from = new Date(to);
    from.setDate(from.getDate() - 7);
    let cursor: string | undefined;
    const allBalances: Array<{ acc: string; nameACC?: string; currency?: string }> = [];
    do {
      const result = await client.getBalances(creds, from, to, cursor);
      allBalances.push(...result.balances);
      cursor = result.next_page_id;
    } while (cursor);

    const normalized = (s: string) => s.replace(/\s/g, "").toUpperCase();
    const match = allBalances.find((b) => normalized(b.acc) === iban);
    if (!match) {
      throw new BadRequestException(
        `Account with IBAN ${iban} not found in Privat24 response. Check IBAN and API access.`,
      );
    }

    const legalName = match.nameACC?.trim() || undefined;
    const bankDetails = "АТ КБ \"ПРИВАТБАНК\"";
    return {
      legalName,
      bankDetails,
      iban: account.iban ?? undefined,
      mfo: "305299",
      // taxId, address, edrpou, taxPayerStatus — користувач дописує вручну
    };
  }
}

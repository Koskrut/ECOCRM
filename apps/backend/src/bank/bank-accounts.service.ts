import { appendFileSync } from "node:fs";
import { BadRequestException, Injectable, NotFoundException } from "@nestjs/common";
import type { BankAccount, BankProvider } from "@prisma/client";
import { Prisma } from "@prisma/client";
import { PrismaService } from "../prisma/prisma.service";
import type { CreateBankAccountDto } from "./dto/create-bank-account.dto";
import type { UpdateBankAccountDto } from "./dto/update-bank-account.dto";
import type { Privat24Credentials } from "./privat24.client";
import { Privat24Client } from "./privat24.client";

const DEBUG_LOG_PATH = "/Users/konstantin/CRM/.cursor/debug-f04031.log";
const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
function debugLog(msg: string, data: Record<string, unknown> = {}) {
  try {
    appendFileSync(
      DEBUG_LOG_PATH,
      JSON.stringify({ timestamp: Date.now(), location: "bank-accounts.service", message: msg, data }) + "\n",
    );
  } catch (_) {}
}

function maskValue(value: string | undefined): string {
  if (!value || value.length < 4) return value ? "••••" : "";
  return "••••" + value.slice(-4);
}

type CredentialsPayload = Record<string, unknown> | null;

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

  /** For order form: active accounts, id and name only. */
  async listForOrder(): Promise<Array<{ id: string; name: string }>> {
    const accounts = await this.prisma.bankAccount.findMany({
      where: { isActive: true },
      orderBy: { name: "asc" },
      select: { id: true, name: true },
    });
    return accounts;
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
      debugLog("update credentials merge", {
        accountId: id,
        dtoCredentialsKeys: Object.keys(dto.credentials),
        nextKeys: Object.keys(next),
        hasId: "id" in next && next.id != null,
        clearedLegacyId:
          staleUuidId || (dtoHasClientId && !dtoHasId && existingId != null && existingId === existingClientId),
      });
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

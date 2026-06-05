import { BadRequestException, Injectable, NotFoundException } from "@nestjs/common";
import { PrismaService } from "../../prisma/prisma.service";
import { Privat24Client, type Privat24Credentials } from "./privat24.client";

@Injectable()
export class Privat24RequisitesService {
  constructor(private readonly prisma: PrismaService) {}

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
    const account = await this.prisma.bankAccount.findUnique({ where: { id } });
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

    return {
      legalName: match.nameACC?.trim() || undefined,
      bankDetails: 'АТ КБ "ПРИВАТБАНК"',
      iban: account.iban ?? undefined,
      mfo: "305299",
    };
  }
}

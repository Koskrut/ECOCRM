import { Injectable, NotFoundException } from "@nestjs/common";
import type { BankProvider } from "@prisma/client";
import { PrismaService } from "../prisma/prisma.service";
import type { CreateBankAccountDto } from "./dto/create-bank-account.dto";
import type { UpdateBankAccountDto } from "./dto/update-bank-account.dto";

@Injectable()
export class BankAccountsService {
  constructor(private readonly prisma: PrismaService) {}

  async create(dto: CreateBankAccountDto) {
    return this.prisma.bankAccount.create({
      data: {
        provider: (dto.provider as BankProvider) ?? "PRIVAT24",
        name: dto.name,
        currency: dto.currency,
        iban: dto.iban ?? null,
        accountNumber: dto.accountNumber ?? null,
        credentials: dto.credentials ? (dto.credentials as object) : undefined,
        isActive: dto.isActive ?? true,
      },
    });
  }

  async list() {
    return this.prisma.bankAccount.findMany({
      orderBy: { createdAt: "desc" },
    });
  }

  async getById(id: string) {
    const account = await this.prisma.bankAccount.findUnique({
      where: { id },
      include: { transactions: { take: 0 } },
    });
    if (!account) throw new NotFoundException("Bank account not found");
    return account;
  }

  async update(id: string, dto: UpdateBankAccountDto) {
    await this.getById(id);
    return this.prisma.bankAccount.update({
      where: { id },
      data: {
        ...(dto.name !== undefined && { name: dto.name }),
        ...(dto.isActive !== undefined && { isActive: dto.isActive }),
      },
    });
  }
}

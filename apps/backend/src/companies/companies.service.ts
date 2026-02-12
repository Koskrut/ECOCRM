import { Injectable, NotFoundException } from "@nestjs/common";
import { PrismaClient, Prisma } from "@prisma/client";
import { Pagination } from "../common/pagination";
import { CreateCompanyDto } from "./dto/create-company.dto";
import { UpdateCompanyDto } from "./dto/update-company.dto";
import { Company } from "./entities/company.entity";

type ListCompaniesResult = {
  items: Company[];
  total: number;
  page: number;
  pageSize: number;
};

@Injectable()
export class CompaniesService {
  constructor(private readonly prisma: PrismaClient) {}

  public async create(dto: CreateCompanyDto): Promise<Company> {
    const company = await this.prisma.company.create({
      data: {
        name: dto.name,
        edrpou: dto.edrpou,
        taxId: dto.taxId,
      },
    });

    return {
      ...company,
      edrpou: company.edrpou ?? undefined,
      taxId: company.taxId ?? undefined,
      createdAt: company.createdAt.toISOString(),
      updatedAt: company.updatedAt.toISOString(),
    };
  }

  public async list(
    search: string | undefined,
    pagination: Pagination,
  ): Promise<ListCompaniesResult> {
    const where: Prisma.CompanyWhereInput = {};

    if (search && search.trim().length > 0) {
      where.OR = [
        { name: { contains: search, mode: "insensitive" } },
        { edrpou: { contains: search, mode: "insensitive" } },
        { taxId: { contains: search, mode: "insensitive" } },
      ];
    }

    const [total, companies] = await this.prisma.$transaction([
      this.prisma.company.count({ where }),
      this.prisma.company.findMany({
        where,
        orderBy: { name: "asc" },
        skip: pagination.offset,
        take: pagination.limit,
      }),
    ]);

    const items = companies.map((company) => ({
      ...company,
      edrpou: company.edrpou ?? undefined,
      taxId: company.taxId ?? undefined,
      createdAt: company.createdAt.toISOString(),
      updatedAt: company.updatedAt.toISOString(),
    }));

    return {
      items,
      total,
      page: pagination.page,
      pageSize: pagination.pageSize,
    };
  }

  public async findOne(id: string): Promise<Company> {
    const company = await this.prisma.company.findUnique({
      where: { id },
    });

    if (!company) {
      throw new NotFoundException("Company not found");
    }

    return {
      ...company,
      edrpou: company.edrpou ?? undefined,
      taxId: company.taxId ?? undefined,
      createdAt: company.createdAt.toISOString(),
      updatedAt: company.updatedAt.toISOString(),
    };
  }

  public async remove(id: string): Promise<{ ok: true }> {
    await this.prisma.company.delete({ where: { id } });
    return { ok: true };
  }

  public async update(id: string, dto: UpdateCompanyDto): Promise<Company> {
    const existing = await this.prisma.company.findUnique({
      where: { id },
    });

    if (!existing) {
      throw new NotFoundException("Company not found");
    }

    const company = await this.prisma.company.update({
      where: { id },
      data: {
        name: dto.name,
        edrpou: dto.edrpou,
        taxId: dto.taxId,
      },
    });

    return {
      ...company,
      edrpou: company.edrpou ?? undefined,
      taxId: company.taxId ?? undefined,
      createdAt: company.createdAt.toISOString(),
      updatedAt: company.updatedAt.toISOString(),
    };
  }
}

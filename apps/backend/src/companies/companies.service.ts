import { ConflictException, Injectable, NotFoundException } from "@nestjs/common";
import type { Prisma } from "@prisma/client";
import { UserRole } from "@prisma/client";
import { PrismaService } from "../prisma/prisma.service";
import type { AuthUser } from "../auth/auth.types";
import type { Pagination } from "../common/pagination";
import type { CreateCompanyDto } from "./dto/create-company.dto";
import type { UpdateCompanyDto } from "./dto/update-company.dto";
import type { Company } from "./entities/company.entity";

export type CompanyChangeHistoryItem = {
  id: string;
  companyId: string;
  changedBy: string | null;
  action: string;
  payload: { field: string; oldValue: string | null; newValue: string | null }[];
  createdAt: string;
};

type ListCompaniesResult = {
  items: Company[];
  total: number;
  page: number;
  pageSize: number;
};

function isPrismaUniqueError(e: unknown): boolean {
  return typeof e === "object" && e !== null && (e as { code?: string }).code === "P2002";
}

@Injectable()
export class CompaniesService {
  constructor(private readonly prisma: PrismaService) {}

  public async create(dto: CreateCompanyDto, actor?: AuthUser): Promise<Company> {
    try {
      const company = await this.prisma.company.create({
        data: {
          name: dto.name,
          edrpou: dto.edrpou ?? null,
          taxId: dto.taxId ?? null,
          phone: dto.phone ?? null,
          address: dto.address ?? null,
          lat: dto.lat ?? null,
          lng: dto.lng ?? null,
          googlePlaceId: dto.googlePlaceId ?? null,
          ownerId: dto.ownerId ?? null,
        },
      });

      await this.prisma.companyChangeHistory.create({
        data: {
          companyId: company.id,
          changedBy: actor?.id ?? null,
          action: "CREATED",
          payload: [
            { field: "name", oldValue: null, newValue: dto.name ?? null },
            { field: "edrpou", oldValue: null, newValue: dto.edrpou ?? null },
            { field: "taxId", oldValue: null, newValue: dto.taxId ?? null },
            { field: "phone", oldValue: null, newValue: dto.phone ?? null },
            { field: "address", oldValue: null, newValue: dto.address ?? null },
            { field: "lat", oldValue: null, newValue: dto.lat != null ? String(dto.lat) : null },
            { field: "lng", oldValue: null, newValue: dto.lng != null ? String(dto.lng) : null },
            { field: "googlePlaceId", oldValue: null, newValue: dto.googlePlaceId ?? null },
          ] as Prisma.InputJsonValue,
        },
      });

      return {
        ...company,
        edrpou: company.edrpou ?? undefined,
        taxId: company.taxId ?? undefined,
        phone: company.phone ?? undefined,
        address: company.address ?? undefined,
        lat: company.lat ?? undefined,
        lng: company.lng ?? undefined,
        googlePlaceId: company.googlePlaceId ?? undefined,
        createdAt: company.createdAt.toISOString(),
        updatedAt: company.updatedAt.toISOString(),
      };
    } catch (e) {
      if (isPrismaUniqueError(e)) {
        throw new ConflictException("Company with the same EDRPOU / Tax ID already exists");
      }
      throw e;
    }
  }

  public async list(
    search: string | undefined,
    pagination: Pagination,
    actor?: AuthUser,
  ): Promise<ListCompaniesResult> {
    const where: Prisma.CompanyWhereInput = {};

    if (search && search.trim().length > 0) {
      where.OR = [
        { name: { contains: search, mode: "insensitive" } },
        { edrpou: { contains: search, mode: "insensitive" } },
        { taxId: { contains: search, mode: "insensitive" } },
        { phone: { contains: search, mode: "insensitive" } },
        { address: { contains: search, mode: "insensitive" } },
      ];
    }

    if (actor?.role === UserRole.MANAGER) {
      const existingAnd: Prisma.CompanyWhereInput[] =
        where.AND === undefined ? [] : Array.isArray(where.AND) ? where.AND : [where.AND];
      where.AND = [...existingAnd, { OR: [{ ownerId: actor.id }, { ownerId: null }] }];
    }

    const [total, companies] = await this.prisma.$transaction([
      this.prisma.company.count({ where }),
      this.prisma.company.findMany({
        where,
        orderBy: { name: "asc" },
        skip: pagination.offset,
        take: pagination.limit,
        include: { owner: { select: { id: true, fullName: true } } },
      }),
    ]);

    const items = companies.map((company) => {
      const owner = (company as { owner?: { id: string; fullName: string } | null }).owner;
      return {
        ...company,
        edrpou: company.edrpou ?? undefined,
        taxId: company.taxId ?? undefined,
        phone: company.phone ?? undefined,
        address: company.address ?? undefined,
        lat: company.lat ?? undefined,
        lng: company.lng ?? undefined,
        googlePlaceId: company.googlePlaceId ?? undefined,
        ownerId: company.ownerId ?? undefined,
        owner: owner ? { id: owner.id, fullName: owner.fullName } : null,
        createdAt: company.createdAt.toISOString(),
        updatedAt: company.updatedAt.toISOString(),
      };
    });

    return {
      items,
      total,
      page: pagination.page,
      pageSize: pagination.pageSize,
    };
  }

  public async findOne(id: string, actor?: AuthUser): Promise<Company> {
    const [company, lastVisit] = await this.prisma.$transaction([
      this.prisma.company.findUnique({
        where: { id },
        include: { owner: { select: { id: true, fullName: true } } },
      }),
      this.prisma.visit.findFirst({
        where: { companyId: id },
        orderBy: { startsAt: "desc" },
      }),
    ]);

    if (!company) {
      throw new NotFoundException("Company not found");
    }

    if (actor?.role === UserRole.MANAGER && company.ownerId != null && company.ownerId !== actor.id) {
      throw new NotFoundException("Company not found");
    }

    const owner = (company as { owner?: { id: string; fullName: string } | null }).owner;
    return {
      ...company,
      edrpou: company.edrpou ?? undefined,
      taxId: company.taxId ?? undefined,
      phone: company.phone ?? undefined,
      address: company.address ?? undefined,
      lat: company.lat ?? undefined,
      lng: company.lng ?? undefined,
      googlePlaceId: company.googlePlaceId ?? undefined,
      ownerId: company.ownerId ?? undefined,
      owner: owner ? { id: owner.id, fullName: owner.fullName } : null,
      createdAt: company.createdAt.toISOString(),
      updatedAt: company.updatedAt.toISOString(),
      lastVisitAt: lastVisit?.startsAt?.toISOString() ?? undefined,
    };
  }

  public async remove(id: string): Promise<{ ok: true }> {
    await this.prisma.company.delete({ where: { id } });
    return { ok: true };
  }

  public async update(id: string, dto: UpdateCompanyDto, actor?: AuthUser): Promise<Company> {
    const existing = await this.prisma.company.findUnique({
      where: { id },
    });

    if (!existing) {
      throw new NotFoundException("Company not found");
    }

    const payload: { field: string; oldValue: string | null; newValue: string | null }[] = [];
    const newName = dto.name != null ? dto.name : existing.name;
    const newEdrpou = dto.edrpou !== undefined ? dto.edrpou : existing.edrpou;
    const newTaxId = dto.taxId !== undefined ? dto.taxId : existing.taxId;
    const newPhone = dto.phone !== undefined ? dto.phone : existing.phone;
    const newAddress = dto.address !== undefined ? dto.address : existing.address;
    const newLat = dto.lat !== undefined ? dto.lat : existing.lat;
    const newLng = dto.lng !== undefined ? dto.lng : existing.lng;
    const newGooglePlaceId = dto.googlePlaceId !== undefined ? dto.googlePlaceId : existing.googlePlaceId;
    const newOwnerId = dto.ownerId !== undefined ? dto.ownerId : existing.ownerId;

    if (dto.name !== undefined && dto.name !== existing.name) {
      payload.push({ field: "name", oldValue: existing.name ?? null, newValue: dto.name ?? null });
    }
    if (dto.edrpou !== undefined && (dto.edrpou ?? null) !== (existing.edrpou ?? null)) {
      payload.push({ field: "edrpou", oldValue: existing.edrpou ?? null, newValue: newEdrpou ?? null });
    }
    if (dto.taxId !== undefined && (dto.taxId ?? null) !== (existing.taxId ?? null)) {
      payload.push({ field: "taxId", oldValue: existing.taxId ?? null, newValue: newTaxId ?? null });
    }
    if (dto.phone !== undefined && (dto.phone ?? null) !== (existing.phone ?? null)) {
      payload.push({ field: "phone", oldValue: existing.phone ?? null, newValue: newPhone ?? null });
    }
    if (dto.address !== undefined && (dto.address ?? null) !== (existing.address ?? null)) {
      payload.push({ field: "address", oldValue: existing.address ?? null, newValue: newAddress ?? null });
    }
    if (dto.lat !== undefined && (dto.lat ?? null) !== (existing.lat ?? null)) {
      payload.push({
        field: "lat",
        oldValue: existing.lat != null ? String(existing.lat) : null,
        newValue: newLat != null ? String(newLat) : null,
      });
    }
    if (dto.lng !== undefined && (dto.lng ?? null) !== (existing.lng ?? null)) {
      payload.push({
        field: "lng",
        oldValue: existing.lng != null ? String(existing.lng) : null,
        newValue: newLng != null ? String(newLng) : null,
      });
    }
    if (dto.googlePlaceId !== undefined && (dto.googlePlaceId ?? null) !== (existing.googlePlaceId ?? null)) {
      payload.push({
        field: "googlePlaceId",
        oldValue: existing.googlePlaceId ?? null,
        newValue: newGooglePlaceId ?? null,
      });
    }
    if (dto.ownerId !== undefined && (dto.ownerId ?? null) !== (existing.ownerId ?? null)) {
      payload.push({
        field: "ownerId",
        oldValue: existing.ownerId ?? null,
        newValue: newOwnerId ?? null,
      });
    }

    try {
      const company = await this.prisma.company.update({
        where: { id },
        data: {
          name: newName,
          edrpou: newEdrpou ?? null,
          taxId: newTaxId ?? null,
          phone: newPhone ?? null,
          address: newAddress ?? null,
          lat: newLat ?? null,
          lng: newLng ?? null,
          googlePlaceId: newGooglePlaceId ?? null,
          ownerId: newOwnerId ?? null,
        },
        include: { owner: { select: { id: true, fullName: true } } },
      });

      if (payload.length > 0) {
        await this.prisma.companyChangeHistory.create({
          data: {
            companyId: id,
            changedBy: actor?.id ?? null,
            action: "UPDATED",
            payload: payload as Prisma.InputJsonValue,
          },
        });
      }

      const owner = (company as { owner?: { id: string; fullName: string } | null }).owner;
      return {
        ...company,
        edrpou: company.edrpou ?? undefined,
        taxId: company.taxId ?? undefined,
        phone: company.phone ?? undefined,
        address: company.address ?? undefined,
        lat: company.lat ?? undefined,
        lng: company.lng ?? undefined,
        googlePlaceId: company.googlePlaceId ?? undefined,
        ownerId: company.ownerId ?? undefined,
        owner: owner ? { id: owner.id, fullName: owner.fullName } : null,
        createdAt: company.createdAt.toISOString(),
        updatedAt: company.updatedAt.toISOString(),
      };
    } catch (e) {
      if (isPrismaUniqueError(e)) {
        throw new ConflictException("Company with the same EDRPOU / Tax ID already exists");
      }
      throw e;
    }
  }

  public async getChangeHistory(companyId: string, actor?: AuthUser): Promise<CompanyChangeHistoryItem[]> {
    const company = await this.prisma.company.findUnique({
      where: { id: companyId },
      select: { id: true, ownerId: true },
    });
    if (!company) {
      throw new NotFoundException("Company not found");
    }
    if (actor?.role === UserRole.MANAGER && company.ownerId != null && company.ownerId !== actor.id) {
      throw new NotFoundException("Company not found");
    }

    const rows = await this.prisma.companyChangeHistory.findMany({
      where: { companyId },
      orderBy: { createdAt: "desc" },
      take: 100,
    });

    return rows.map((r: { id: string; companyId: string; changedBy: string | null; action: string; payload: unknown; createdAt: Date }) => ({
      id: r.id,
      companyId: r.companyId,
      changedBy: r.changedBy ?? null,
      action: r.action,
      payload: (r.payload as { field: string; oldValue: string | null; newValue: string | null }[]) ?? [],
      createdAt: r.createdAt.toISOString(),
    }));
  }
}

import { ConflictException, Injectable, NotFoundException, Optional, BadRequestException } from "@nestjs/common";
import type { Prisma } from "@prisma/client";
import { CustomFieldEntityType, UserRole } from "@prisma/client";
import { AuditService } from "../audit/audit.service";
import { PrismaService } from "../prisma/prisma.service";
import { WorkflowDomainEmitterService } from "../workflows/workflow-domain-emitter.service";
import type { AuthUser } from "../auth/auth.types";
import type { Pagination } from "../common/pagination";
import { normalizePhoneToE164 } from "../common/phone.utils";
import type { CreateCompanyDto } from "./dto/create-company.dto";
import type { UpdateCompanyDto } from "./dto/update-company.dto";
import type { Company } from "./entities/company.entity";
import {
  companyDenormalizedFromDefault,
  mapAddressRow,
} from "../common/entity-address.util";

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
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    @Optional() private readonly workflowEmitter?: WorkflowDomainEmitterService,
  ) {}

  public async create(
    dto: CreateCompanyDto,
    actor?: AuthUser,
    tx?: Prisma.TransactionClient,
  ): Promise<Company> {
    const companyPhone =
      dto.phone != null
        ? (normalizePhoneToE164(dto.phone) ?? (dto.phone.trim() || null))
        : null;
    const ownerId = dto.ownerId ?? actor?.id ?? null;
    const db = tx ?? this.prisma;
    try {
      const company = await db.company.create({
        data: {
          name: dto.name,
          edrpou: dto.edrpou ?? null,
          taxId: dto.taxId ?? null,
          phone: companyPhone,
          address: dto.address ?? null,
          lat: dto.lat ?? null,
          lng: dto.lng ?? null,
          googlePlaceId: dto.googlePlaceId ?? null,
          ownerId,
        },
      });

      // Defer workflow emit to the caller (post-commit) when running inside a transaction.
      if (!tx) {
        this.workflowEmitter?.emitRecordCreated(CustomFieldEntityType.COMPANY, company.id, {
          id: company.id,
          name: company.name,
          edrpou: company.edrpou,
          taxId: company.taxId,
          phone: company.phone,
          address: company.address,
          ownerId: company.ownerId,
        });
      }

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
        {
          addresses: {
            some: {
              OR: [
                { addressText: { contains: search, mode: "insensitive" } },
                { city: { contains: search, mode: "insensitive" } },
                { label: { contains: search, mode: "insensitive" } },
              ],
            },
          },
        },
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
        include: {
          owner: { select: { id: true, fullName: true } },
          addresses: { orderBy: [{ isDefault: "desc" }, { createdAt: "asc" }] },
        },
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
      addresses: (company.addresses ?? []).map(mapAddressRow),
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

    if (actor?.role === UserRole.MANAGER && existing.ownerId != null && existing.ownerId !== actor.id) {
      throw new NotFoundException("Company not found");
    }

    const payload: { field: string; oldValue: string | null; newValue: string | null }[] = [];
    const newName = dto.name != null ? dto.name : existing.name;
    const newEdrpou = dto.edrpou !== undefined ? dto.edrpou : existing.edrpou;
    const newTaxId = dto.taxId !== undefined ? dto.taxId : existing.taxId;
    const newPhone =
      dto.phone !== undefined
        ? (normalizePhoneToE164(dto.phone) ?? (dto.phone?.trim() || null))
        : existing.phone;
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
        const wfChanges: Record<string, { previous?: unknown; current?: unknown }> = {};
        for (const p of payload) {
          wfChanges[p.field] = { previous: p.oldValue, current: p.newValue };
        }
        this.workflowEmitter?.emitRecordUpdated(
          CustomFieldEntityType.COMPANY,
          id,
          {
            id: company.id,
            name: company.name,
            edrpou: company.edrpou,
            taxId: company.taxId,
            phone: company.phone,
            address: company.address,
            lat: company.lat,
            lng: company.lng,
            googlePlaceId: company.googlePlaceId,
            ownerId: company.ownerId,
          },
          wfChanges,
        );
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

    const [auditPage, legacyRows] = await Promise.all([
      this.audit.listForEntity("Company", companyId, { page: 1, pageSize: 100 }),
      this.prisma.companyChangeHistory.findMany({
        where: { companyId },
        orderBy: { createdAt: "desc" },
        take: 100,
      }),
    ]);

    const fromAudit: CompanyChangeHistoryItem[] = auditPage.items.map((row) => ({
      id: row.id,
      companyId: row.entityId,
      changedBy: row.changedBy,
      action: row.action,
      payload: Array.isArray(row.diff)
        ? (row.diff as { field: string; before: unknown; after: unknown }[]).map((d) => ({
            field: d.field,
            oldValue: d.before == null ? null : String(d.before),
            newValue: d.after == null ? null : String(d.after),
          }))
        : [],
      createdAt: row.createdAt.toISOString(),
    }));

    const fromLegacy = legacyRows.map(
      (r: { id: string; companyId: string; changedBy: string | null; action: string; payload: unknown; createdAt: Date }) => ({
        id: r.id,
        companyId: r.companyId,
        changedBy: r.changedBy ?? null,
        action: r.action,
        payload: (r.payload as { field: string; oldValue: string | null; newValue: string | null }[]) ?? [],
        createdAt: r.createdAt.toISOString(),
      }),
    );

    return [...fromAudit, ...fromLegacy].sort(
      (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime(),
    );
  }

  private assertCompanyAccess(company: { ownerId: string | null }, actor?: AuthUser) {
    if (actor?.role === UserRole.MANAGER && company.ownerId != null && company.ownerId !== actor.id) {
      throw new NotFoundException("Company not found");
    }
  }

  async syncDenormalizedAddress(companyId: string) {
    const defaultAddress = await this.prisma.companyAddress.findFirst({
      where: { companyId, isDefault: true },
      orderBy: { updatedAt: "desc" },
    });
    const cache = companyDenormalizedFromDefault(defaultAddress);
    await this.prisma.company.update({
      where: { id: companyId },
      data: cache,
    });
    return cache;
  }

  async listAddresses(companyId: string, actor?: AuthUser) {
    const company = await this.prisma.company.findUnique({
      where: { id: companyId },
      select: { id: true, ownerId: true },
    });
    if (!company) throw new NotFoundException("Company not found");
    this.assertCompanyAccess(company, actor);

    const items = await this.prisma.companyAddress.findMany({
      where: { companyId },
      orderBy: [{ isDefault: "desc" }, { createdAt: "asc" }],
    });
    return { items: items.map(mapAddressRow) };
  }

  async createAddress(
    companyId: string,
    data: {
      label?: string | null;
      city?: string | null;
      addressText: string;
      lat?: number | null;
      lng?: number | null;
      googlePlaceId?: string | null;
      isDefault?: boolean;
    },
    actor?: AuthUser,
  ) {
    const company = await this.prisma.company.findUnique({
      where: { id: companyId },
      select: { id: true, ownerId: true },
    });
    if (!company) throw new NotFoundException("Company not found");
    this.assertCompanyAccess(company, actor);

    const addressText = data.addressText?.trim();
    if (!addressText) throw new BadRequestException("addressText is required");

    const existingCount = await this.prisma.companyAddress.count({ where: { companyId } });
    const isDefault = data.isDefault ?? existingCount === 0;

    const created = await this.prisma.$transaction(async (tx) => {
      if (isDefault) {
        await tx.companyAddress.updateMany({
          where: { companyId, isDefault: true },
          data: { isDefault: false },
        });
      }
      return tx.companyAddress.create({
        data: {
          companyId,
          label: data.label?.trim() || null,
          city: data.city?.trim() || null,
          addressText,
          lat: data.lat ?? null,
          lng: data.lng ?? null,
          googlePlaceId: data.googlePlaceId ?? null,
          isDefault,
        },
      });
    });

    if (isDefault) await this.syncDenormalizedAddress(companyId);
    return mapAddressRow(created);
  }

  async updateAddress(
    companyId: string,
    addressId: string,
    data: {
      label?: string | null;
      city?: string | null;
      addressText?: string;
      lat?: number | null;
      lng?: number | null;
      googlePlaceId?: string | null;
    },
    actor?: AuthUser,
  ) {
    const company = await this.prisma.company.findUnique({
      where: { id: companyId },
      select: { id: true, ownerId: true },
    });
    if (!company) throw new NotFoundException("Company not found");
    this.assertCompanyAccess(company, actor);

    const existing = await this.prisma.companyAddress.findFirst({
      where: { id: addressId, companyId },
    });
    if (!existing) throw new NotFoundException("address not found");

    if (data.addressText !== undefined && !data.addressText.trim()) {
      throw new BadRequestException("addressText cannot be empty");
    }

    const updated = await this.prisma.companyAddress.update({
      where: { id: addressId },
      data: {
        ...(data.label !== undefined ? { label: data.label?.trim() || null } : {}),
        ...(data.city !== undefined ? { city: data.city?.trim() || null } : {}),
        ...(data.addressText !== undefined ? { addressText: data.addressText.trim() } : {}),
        ...(data.lat !== undefined ? { lat: data.lat } : {}),
        ...(data.lng !== undefined ? { lng: data.lng } : {}),
        ...(data.googlePlaceId !== undefined ? { googlePlaceId: data.googlePlaceId } : {}),
      },
    });

    if (existing.isDefault) await this.syncDenormalizedAddress(companyId);
    return mapAddressRow(updated);
  }

  async deleteAddress(companyId: string, addressId: string, actor?: AuthUser) {
    const company = await this.prisma.company.findUnique({
      where: { id: companyId },
      select: { id: true, ownerId: true },
    });
    if (!company) throw new NotFoundException("Company not found");
    this.assertCompanyAccess(company, actor);

    const existing = await this.prisma.companyAddress.findFirst({
      where: { id: addressId, companyId },
    });
    if (!existing) throw new NotFoundException("address not found");

    await this.prisma.companyAddress.delete({ where: { id: addressId } });

    if (existing.isDefault) {
      const nextDefault = await this.prisma.companyAddress.findFirst({
        where: { companyId },
        orderBy: { createdAt: "asc" },
      });
      if (nextDefault) {
        await this.prisma.companyAddress.update({
          where: { id: nextDefault.id },
          data: { isDefault: true },
        });
      }
      await this.syncDenormalizedAddress(companyId);
    }

    return { ok: true };
  }

  async setDefaultAddress(companyId: string, addressId: string, actor?: AuthUser) {
    const company = await this.prisma.company.findUnique({
      where: { id: companyId },
      select: { id: true, ownerId: true },
    });
    if (!company) throw new NotFoundException("Company not found");
    this.assertCompanyAccess(company, actor);

    const target = await this.prisma.companyAddress.findFirst({
      where: { id: addressId, companyId },
    });
    if (!target) throw new NotFoundException("address not found");

    await this.prisma.$transaction(async (tx) => {
      await tx.companyAddress.updateMany({
        where: { companyId, isDefault: true },
        data: { isDefault: false },
      });
      await tx.companyAddress.update({
        where: { id: addressId },
        data: { isDefault: true },
      });
    });

    await this.syncDenormalizedAddress(companyId);
    const updated = await this.prisma.companyAddress.findUniqueOrThrow({ where: { id: addressId } });
    return mapAddressRow(updated);
  }

  async getDefaultAddress(companyId: string) {
    return this.prisma.companyAddress.findFirst({
      where: { companyId, isDefault: true },
      orderBy: { updatedAt: "desc" },
    });
  }
}

import { BadRequestException, Injectable } from "@nestjs/common";
import type { Prisma } from "@prisma/client";
import { PrismaService } from "../prisma/prisma.service";

@Injectable()
export class ShippingProfilesService {
  constructor(private readonly prisma: PrismaService) {}

  async list(contactId: string) {
    return this.prisma.contactShippingProfile.findMany({
      where: { contactId },
      orderBy: [{ isDefault: "desc" }, { updatedAt: "desc" }],
    });
  }

  async create(contactId: string, data: Record<string, unknown>) {
    if (!data?.label) throw new BadRequestException("label is required");
    return this.prisma.contactShippingProfile.create({
      data: {
        contactId,
        ...data,
      } as Prisma.ContactShippingProfileUncheckedCreateInput,
    });
  }

  async update(profileId: string, data: Record<string, unknown>) {
    return this.prisma.contactShippingProfile.update({
      where: { id: profileId },
      data: data as Prisma.ContactShippingProfileUpdateInput,
    });
  }

  async setDefault(profileId: string) {
    const profile = await this.prisma.contactShippingProfile.findUnique({
      where: { id: profileId },
    });
    if (!profile) throw new BadRequestException("profile not found");

    await this.prisma.contactShippingProfile.updateMany({
      where: { contactId: profile.contactId, isDefault: true },
      data: { isDefault: false },
    });

    return this.prisma.contactShippingProfile.update({
      where: { id: profileId },
      data: { isDefault: true },
    });
  }
}

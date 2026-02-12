import { BadRequestException, Injectable } from "@nestjs/common";
import { PrismaClient } from "@prisma/client";

@Injectable()
export class ShippingProfilesService {
  constructor(private readonly prisma: PrismaClient) {}

  async list(contactId: string) {
    return this.prisma.contactShippingProfile.findMany({
      where: { contactId },
      orderBy: [{ isDefault: "desc" }, { updatedAt: "desc" }],
    });
  }

  async create(contactId: string, data: any) {
    if (!data?.label) throw new BadRequestException("label is required");
    return this.prisma.contactShippingProfile.create({
      data: {
        contactId,
        ...data,
      },
    });
  }

  async update(profileId: string, data: any) {
    return this.prisma.contactShippingProfile.update({
      where: { id: profileId },
      data,
    });
  }

  async setDefault(profileId: string) {
    const profile = await this.prisma.contactShippingProfile.findUnique({ where: { id: profileId } });
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

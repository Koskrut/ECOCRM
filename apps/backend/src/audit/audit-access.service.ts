import { BadRequestException, Injectable } from "@nestjs/common";
import type { AuthUser } from "../auth/auth.types";
import { TimelineAccessService } from "../timeline/timeline-access.service";

const SUPPORTED_ENTITY_TYPES = new Set(["Contact", "Company", "Order", "Lead"]);

const ENTITY_TYPE_TO_TIMELINE: Record<string, "contact" | "company" | "order" | "lead"> = {
  Contact: "contact",
  Company: "company",
  Order: "order",
  Lead: "lead",
};

@Injectable()
export class AuditAccessService {
  constructor(private readonly timelineAccess: TimelineAccessService) {}

  assertEntityType(entityType: string): void {
    if (!SUPPORTED_ENTITY_TYPES.has(entityType)) {
      throw new BadRequestException(`Unsupported audit entity type: ${entityType}`);
    }
  }

  async assertAccess(entityType: string, entityId: string, actor?: AuthUser): Promise<void> {
    this.assertEntityType(entityType);
    const timelineType = ENTITY_TYPE_TO_TIMELINE[entityType];
    await this.timelineAccess.assertAccess(timelineType, entityId, actor);
  }
}

import { Module } from "@nestjs/common";
import { PrismaModule } from "../prisma/prisma.module";
import { ActivityTimelineAdapter } from "./adapters/activity-timeline.adapter";
import { OrderStatusTimelineAdapter } from "./adapters/order-status-timeline.adapter";
import { TtnTimelineAdapter } from "./adapters/ttn-timeline.adapter";
import { CanonicalTimelineService } from "./canonical-timeline.service";
import { TimelineAccessService } from "./timeline-access.service";
import { TimelineController } from "./timeline.controller";

@Module({
  imports: [PrismaModule],
  controllers: [TimelineController],
  providers: [
    TimelineAccessService,
    ActivityTimelineAdapter,
    OrderStatusTimelineAdapter,
    TtnTimelineAdapter,
    CanonicalTimelineService,
  ],
  exports: [CanonicalTimelineService],
})
export class TimelineModule {}

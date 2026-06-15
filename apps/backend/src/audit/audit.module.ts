import { Module } from "@nestjs/common";
import { APP_INTERCEPTOR } from "@nestjs/core";
import { TimelineModule } from "../timeline/timeline.module";
import { AuditAccessService } from "./audit-access.service";
import { AuditController } from "./audit.controller";
import { AuditContextInterceptor } from "./audit-context.interceptor";
import { AuditService } from "./audit.service";

@Module({
  imports: [TimelineModule],
  controllers: [AuditController],
  providers: [
    AuditService,
    AuditAccessService,
    {
      provide: APP_INTERCEPTOR,
      useClass: AuditContextInterceptor,
    },
  ],
  exports: [AuditService, AuditAccessService],
})
export class AuditModule {}

/** Workers/cron apps: audit context ALS only (no HTTP controller). */
@Module({
  providers: [
    {
      provide: APP_INTERCEPTOR,
      useClass: AuditContextInterceptor,
    },
  ],
})
export class AuditContextModule {}

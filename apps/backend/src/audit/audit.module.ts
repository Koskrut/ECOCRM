import { Module } from "@nestjs/common";
import { APP_INTERCEPTOR } from "@nestjs/core";
import { AuditController } from "./audit.controller";
import { AuditContextInterceptor } from "./audit-context.interceptor";
import { AuditService } from "./audit.service";

@Module({
  controllers: [AuditController],
  providers: [
    AuditService,
    {
      provide: APP_INTERCEPTOR,
      useClass: AuditContextInterceptor,
    },
  ],
  exports: [AuditService],
})
export class AuditModule {}

import { Global, Module } from "@nestjs/common";
import { APP_INTERCEPTOR } from "@nestjs/core";
import { FinanceIdempotencyInterceptor } from "./finance-idempotency.interceptor";
import { FinanceIdempotencyService } from "./finance-idempotency.service";

@Global()
@Module({
  providers: [
    FinanceIdempotencyService,
    FinanceIdempotencyInterceptor,
    { provide: APP_INTERCEPTOR, useClass: FinanceIdempotencyInterceptor },
  ],
  exports: [FinanceIdempotencyService],
})
export class FinanceIdempotencyModule {}

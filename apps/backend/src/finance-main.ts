/**
 * Standalone finance worker: bank + payments + payment requests (`finance-runner`).
 */
import "dotenv/config";
import { Module, ValidationPipe } from "@nestjs/common";
import { APP_GUARD } from "@nestjs/core";
import { NestFactory } from "@nestjs/core";
import { ScheduleModule } from "@nestjs/schedule";
import { AuthModule } from "./auth/auth.module";
import { JwtAuthGuard } from "./auth/jwt-auth.guard";
import { RolesGuard } from "./auth/roles.guard";
import { RbacModule } from "./rbac/rbac.module";
import { PermissionsGuard } from "./rbac/permissions.guard";
import { PrismaModule } from "./prisma/prisma.module";
import { AuditContextModule } from "./audit/audit.module";
import { FinanceIdempotencyModule } from "./finance-idempotency/finance-idempotency.module";
import { IntegrationPortsModule } from "./integration-ports/integration-ports.module";
import { BankModule } from "./bank/bank.module";
import { Privat24Module } from "./integrations/privat24/privat24.module";
import { UpcModule } from "./integrations/upc/upc.module";
import { PaymentsModule } from "./payments/payments.module";
import { ReceivablesModule } from "./receivables/receivables.module";
import { ClientBalancesModule } from "./client-balances/client-balances.module";
import { PaymentRequestsModule } from "./payment-requests/payment-requests.module";
import { SystemModule } from "./system/system.module";
import { ModuleAccessGuard } from "./modules/gating/module-access.guard";
import { UnauthorizedExceptionFilter } from "./common/unauthorized-exception.filter";

@Module({
  imports: [
    PrismaModule,
    AuditContextModule,
    FinanceIdempotencyModule,
    ScheduleModule.forRoot(),
    AuthModule,
    RbacModule,
    IntegrationPortsModule,
    SystemModule,
    PaymentRequestsModule,
    PaymentsModule,
    ReceivablesModule,
    ClientBalancesModule,
    BankModule,
    Privat24Module,
    UpcModule,
  ],
  providers: [
    { provide: APP_GUARD, useClass: JwtAuthGuard },
    { provide: APP_GUARD, useClass: RolesGuard },
    { provide: APP_GUARD, useClass: PermissionsGuard },
    { provide: APP_GUARD, useClass: ModuleAccessGuard },
  ],
})
class FinanceRootModule {}

async function bootstrap() {
  const app = await NestFactory.create(FinanceRootModule, { rawBody: true });
  app.useGlobalFilters(new UnauthorizedExceptionFilter());
  app.useGlobalPipes(
    new ValidationPipe({
      transform: true,
      whitelist: true,
      forbidNonWhitelisted: false,
      transformOptions: { enableImplicitConversion: true },
    }),
  );
  const port = process.env.PORT ? Number(process.env.PORT) : 3001;
  app.enableShutdownHooks();
  await app.listen(port);
  console.log(`Finance worker listening on http://localhost:${port}`);
}

bootstrap();

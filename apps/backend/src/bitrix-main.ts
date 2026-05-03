/**
 * Standalone Bitrix sync + webhook worker (`bitrix-runner` in Dockerfile).
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
import { BitrixWebhookModule } from "./integrations/bitrix-webhook/bitrix-webhook.module";
import { SystemModule } from "./system/system.module";
import { ModuleAccessGuard } from "./modules/gating/module-access.guard";
import { UnauthorizedExceptionFilter } from "./common/unauthorized-exception.filter";

@Module({
  imports: [PrismaModule, ScheduleModule.forRoot(), AuthModule, RbacModule, SystemModule, BitrixWebhookModule],
  providers: [
    { provide: APP_GUARD, useClass: JwtAuthGuard },
    { provide: APP_GUARD, useClass: RolesGuard },
    { provide: APP_GUARD, useClass: PermissionsGuard },
    { provide: APP_GUARD, useClass: ModuleAccessGuard },
  ],
})
class BitrixRootModule {}

async function bootstrap() {
  const app = await NestFactory.create(BitrixRootModule, { rawBody: true });
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
  console.log(`Bitrix worker listening on http://localhost:${port}`);
}

bootstrap();

import "dotenv/config";
import { ValidationPipe } from "@nestjs/common";
import { NestFactory } from "@nestjs/core";
import { AppModule } from "./app.module";
import { UnauthorizedExceptionFilter } from "./common/unauthorized-exception.filter";

// Suppress pg deprecation from @prisma/adapter-pg: transaction runs multiple queries on one
// client without awaiting (Prisma engine + PgTransaction.performIO). Harmless until pg@9.
const origEmitWarning = process.emitWarning.bind(process);
type EmitWarningFn = (warning: string | Error, ...args: unknown[]) => void;
(process.emitWarning as EmitWarningFn) = function (warning: string | Error, ...args: unknown[]) {
  const msg = typeof warning === "string" ? warning : (warning as Error).message;
  const typeArg = args[0];
  const name =
    typeof typeArg === "string"
      ? typeArg
      : typeof typeArg === "object" && typeArg !== null && typeArg !== undefined && "type" in typeArg
        ? (typeArg as { type?: string }).type
        : typeof warning === "object" && warning !== null && "name" in warning
          ? (warning as Error).name
          : "Warning";
  if (
    name === "DeprecationWarning" &&
    typeof msg === "string" &&
    msg.includes("client.query() when the client is already executing")
  ) {
    return;
  }
  return (origEmitWarning as EmitWarningFn).apply(process, [warning, ...args]);
};

async function bootstrap() {
  const app = await NestFactory.create(AppModule);

  app.useGlobalFilters(new UnauthorizedExceptionFilter());

  app.useGlobalPipes(
    new ValidationPipe({
      transform: true,
      whitelist: true,
      forbidNonWhitelisted: false,
      transformOptions: { enableImplicitConversion: true },
    }),
  );

  const isProduction = process.env.NODE_ENV === "production";
  const corsOrigins = isProduction
    ? (process.env.CORS_ORIGIN ?? "")
        .split(",")
        .map((s) => s.trim())
        .filter(Boolean)
    : true;

  app.enableCors({
    origin: corsOrigins,
    credentials: true,
  });

  const port = process.env.PORT ? Number(process.env.PORT) : 3001;

  // Включаем корректное завершение Nest (и PrismaService тоже)
  app.enableShutdownHooks();

  await app.listen(port);
  console.log(`Backend listening on http://localhost:${port}`);
}

bootstrap();

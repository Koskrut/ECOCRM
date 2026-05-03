import "dotenv/config";
import { ValidationPipe } from "@nestjs/common";
import { NestFactory } from "@nestjs/core";
import { AppModuleCore } from "./app.module.core";
import { UnauthorizedExceptionFilter } from "./common/unauthorized-exception.filter";
import { mountModuleUpstreamProxies } from "./proxy/module-upstream-proxy.setup";

// Same pg deprecation suppression as main.ts (see main.ts).
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
  const app = await NestFactory.create(AppModuleCore, {
    rawBody: true,
  });

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

  mountModuleUpstreamProxies(app);

  const port = process.env.PORT ? Number(process.env.PORT) : 3001;

  app.enableShutdownHooks();

  await app.listen(port);
  console.log(`Core backend listening on http://localhost:${port}`);
}

bootstrap();

import "dotenv/config";
import { ValidationPipe } from "@nestjs/common";
import { NestFactory } from "@nestjs/core";
import { AppModule } from "./app.module";
import { UnauthorizedExceptionFilter } from "./common/unauthorized-exception.filter";

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

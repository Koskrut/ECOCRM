import "dotenv/config";
import { NestFactory } from "@nestjs/core";
import { AppModule } from "./app.module";

async function bootstrap() {
  const app = await NestFactory.create(AppModule);

  app.enableCors({
    origin: true,
    credentials: true,
  });

  const port = process.env.PORT ? Number(process.env.PORT) : 3001;

  // Включаем корректное завершение Nest (и PrismaService тоже)
  app.enableShutdownHooks();

  await app.listen(port);
  console.log(`Backend listening on http://localhost:${port}`);
}

bootstrap();

import "reflect-metadata";
import { Controller, Get, Module } from "@nestjs/common";
import { NestFactory } from "@nestjs/core";

@Controller()
class HealthController {
  @Get("health")
  health() {
    return { ok: true, client: "bio3ua" };
  }
}

@Module({
  controllers: [HealthController],
})
class AppModule {}

async function bootstrap() {
  const app = await NestFactory.create(AppModule);
  const port = process.env.PORT ? Number(process.env.PORT) : 3010;
  await app.listen(port);
  console.log(`crm-client-bio3ua listening on http://localhost:${port}`);
}

bootstrap();

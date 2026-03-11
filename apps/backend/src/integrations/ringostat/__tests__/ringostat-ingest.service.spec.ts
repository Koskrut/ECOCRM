import { Test } from "@nestjs/testing";
import type { PrismaClient } from "@prisma/client";
import { PrismaService } from "../../../src/prisma/prisma.service";
import { RingostatIngestService } from "../ringostat-ingest.service";

describe("RingostatIngestService", () => {
  let service: RingostatIngestService;
  let prisma: PrismaService & PrismaClient;

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({
      providers: [PrismaService, RingostatIngestService],
    }).compile();

    service = moduleRef.get(RingostatIngestService);
    prisma = moduleRef.get(PrismaService) as PrismaService & PrismaClient;
  });

  afterAll(async () => {
    await prisma.$disconnect();
  });

  it("normalizes UA phone numbers to E.164-like format", async () => {
    // @ts-expect-error access private for test
    const normalize = (s: string | undefined) => service["normalizePhone"](s);

    expect(normalize("+380501234567")).toBe("+380501234567");
    expect(normalize("050 123 45 67")).toBe("+380501234567");
    expect(normalize("380501234567")).toBe("+380501234567");
    expect(normalize("501234567")).toBe("+380501234567");
  });

  it("builds activity body with status, direction, duration and phone", async () => {
    // @ts-expect-error access private for test
    const build = (args: Parameters<typeof service["buildActivityBody"]>[0]) =>
      // @ts-expect-error private
      service["buildActivityBody"](args);

    const body = build({
      direction: "INBOUND",
      status: "MISSED",
      durationSec: 42,
      customerPhoneNormalized: "+380501234567",
      hasRecording: true,
    });

    expect(body).toContain("Статус: MISSED");
    expect(body).toContain("Направление: входящий");
    expect(body).toContain("Длительность: 42 сек.");
    expect(body).toContain("Телефон: +380501234567");
    expect(body).toContain("Запись: доступна");
  });
}


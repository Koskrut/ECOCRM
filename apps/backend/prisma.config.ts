import { defineConfig } from '@prisma/config';
import * as dotenv from 'dotenv';

// Загружаем переменные окружения
dotenv.config();

const url = process.env.DATABASE_URL;

if (!url) {
  throw new Error('DATABASE_URL is not defined in .env file');
}

export default defineConfig({
  datasource: {
    url: process.env.DATABASE_URL,
  },
  migrations: {
    seed: "ts-node ./prisma/seed.ts",
  },
});
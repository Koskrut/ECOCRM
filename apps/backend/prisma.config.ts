import { defineConfig } from '@prisma/config';
import * as dotenv from 'dotenv';

// Загружаем переменные окружения
dotenv.config();

const url = process.env.DATABASE_URL;

if (!url) {
  throw new Error('DATABASE_URL is not defined in .env file');
}

export default defineConfig({
  // Исправлено: datasource в единственном числе и url сразу внутри
  datasource: {
    url: url,
  },
});
import 'reflect-metadata';
import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { NestFactory } from '@nestjs/core';
import type { NestExpressApplication } from '@nestjs/platform-express';
import { AppModule } from './app.module';

function loadLocalEnv() {
  for (const file of [resolve(process.cwd(), '.env'), resolve(process.cwd(), 'prisma/.env'), resolve(process.cwd(), '../../.env'), resolve(process.cwd(), '../../prisma/.env')]) {
    if (!existsSync(file)) continue;
    for (const raw of readFileSync(file, 'utf8').split(/\r?\n/)) {
      const line = raw.trim();
      if (!line || line.startsWith('#') || !line.includes('=')) continue;
      const [key, ...rest] = line.split('=');
      if (!process.env[key]) process.env[key] = rest.join('=').trim().replace(/^"|"$/g, '');
    }
  }
}

async function bootstrap() {
  loadLocalEnv();
  const app = await NestFactory.create<NestExpressApplication>(AppModule);
  app.useBodyParser('json', { limit: '20mb' });
  app.useStaticAssets(resolve(process.env.UPLOAD_DIR ?? resolve(process.cwd(), 'uploads')), { prefix: '/uploads/' });

  app.enableCors();

  const port = Number(process.env.PORT ?? 3000);
  await app.listen(port);
  console.log(`[KidsQuiz] NestJS API Server is running on: http://localhost:${port}`);
}

bootstrap();

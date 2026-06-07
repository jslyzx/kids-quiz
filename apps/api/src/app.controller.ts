import { Controller, Get, ServiceUnavailableException } from '@nestjs/common';
import { Public } from './auth/public.decorator';
import { PrismaService } from './prisma/prisma.service';

@Controller()
export class AppController {
  constructor(private readonly prisma: PrismaService) {}

  @Public()
  @Get('health')
  async getHealth() {
    const startedAt = Date.now();
    try {
      await this.prisma.$queryRaw`SELECT 1`;
      return {
        ok: true,
        service: 'kids-quiz-api-nestjs',
        database: 'ok',
        checkedAt: new Date().toISOString(),
        latencyMs: Date.now() - startedAt,
      };
    } catch (error) {
      throw new ServiceUnavailableException({
        ok: false,
        service: 'kids-quiz-api-nestjs',
        database: 'error',
        checkedAt: new Date().toISOString(),
        message: error instanceof Error ? error.message : String(error),
      });
    }
  }
}

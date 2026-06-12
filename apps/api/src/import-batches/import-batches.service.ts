import { BadRequestException, Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import type { CreateImportBatchDto, FinishImportBatchDto } from './dto';

function jsonSafe<T>(value: T): T {
  return JSON.parse(JSON.stringify(value, (_key, v) => typeof v === 'bigint' ? v.toString() : v));
}

@Injectable()
export class ImportBatchesService {
  constructor(private readonly prisma: PrismaService) {}

  async list(ownerId: bigint) {
    const rows = await this.prisma.importBatch.findMany({
      where: { ownerId },
      orderBy: { createdAt: 'desc' },
      take: 50,
      include: { _count: { select: { questionGroups: true } } },
    });
    return jsonSafe(rows.map((row) => ({ ...row, groupCount: row._count.questionGroups })));
  }

  async get(ownerId: bigint, id: number) {
    if (!id || Number.isNaN(id)) throw new BadRequestException('Invalid import batch id');
    const row = await this.prisma.importBatch.findFirst({
      where: { id: BigInt(id), ownerId },
      include: {
        questionGroups: {
          orderBy: { createdAt: 'asc' },
          include: {
            knowledgePoint: {
              select: { id: true, name: true, path: true },
            },
            knowledgePointLinks: {
              include: {
                knowledgePoint: {
                  select: { id: true, name: true, path: true },
                },
              },
            },
            questions: {
              orderBy: { sortOrder: 'asc' },
              select: {
                id: true,
                questionType: true,
                stem: true,
                explanation: true,
                difficulty: true,
                gradeLevel: true,
                tags: true,
                status: true,
                createdAt: true,
                knowledgePoint: {
                  select: { id: true, name: true, path: true },
                },
                knowledgePointLinks: {
                  include: {
                    knowledgePoint: {
                      select: { id: true, name: true, path: true },
                    },
                  },
                },
              },
            },
          },
        },
        _count: { select: { questionGroups: true } },
      },
    });
    if (!row) throw new BadRequestException('Import batch not found');
    return jsonSafe({ ...row, groupCount: row._count.questionGroups });
  }

  async create(ownerId: bigint, dto: CreateImportBatchDto) {
    const title = dto?.title?.trim() || `导入批次 ${new Date().toLocaleString()}`;
    const row = await this.prisma.importBatch.create({
      data: {
        ownerId,
        title,
        sourceType: dto?.sourceType?.trim() || 'json',
        sourceName: dto?.sourceName?.trim() || null,
        notes: dto?.notes?.trim() || null,
        status: 'IMPORTING',
      },
    });
    return jsonSafe(row);
  }

  async finish(ownerId: bigint, id: number, dto: FinishImportBatchDto) {
    if (!id || Number.isNaN(id)) throw new BadRequestException('Invalid import batch id');
    const status = dto?.status === 'FAILED' ? 'FAILED' : 'COMPLETED';
    const result = await this.prisma.importBatch.updateMany({
      where: { id: BigInt(id), ownerId },
      data: {
        status,
        stats: dto?.stats === undefined ? undefined : dto.stats as Prisma.InputJsonValue,
        notes: dto?.notes?.trim() || undefined,
        completedAt: new Date(),
      },
    });
    if (!result.count) throw new BadRequestException('Import batch not found');
    const row = await this.prisma.importBatch.findFirst({ where: { id: BigInt(id), ownerId } });
    return jsonSafe(row);
  }
}

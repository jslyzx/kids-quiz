import { BadRequestException, Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import type { AddPaperQuestionGroupDto, CreatePaperDto, ReorderPaperItemsDto, SmartGeneratePaperDto, UpdatePaperDto } from './dto';

function jsonSafe<T>(value: T): T {
  return JSON.parse(JSON.stringify(value, (_key, v) => typeof v === 'bigint' ? v.toString() : v));
}

@Injectable()
export class PapersService {
  constructor(private readonly prisma: PrismaService) {}

  async list(ownerId: bigint) {
    const rows = await this.prisma.paper.findMany({
      where: { ownerId, status: { not: 'DELETED' } },
      orderBy: { createdAt: 'desc' },
      include: { items: true },
      take: 50,
    });
    return jsonSafe(rows.map((paper) => ({ ...paper, itemCount: paper.items.length })));
  }

  async get(ownerId: bigint, id: number) {
    const row = await this.prisma.paper.findFirst({
      where: { id: BigInt(id), ownerId },
      include: {
        items: {
          orderBy: { sortOrder: 'asc' },
          include: {
            group: { include: { questions: { orderBy: { sortOrder: 'asc' }, include: { answerSlots: { orderBy: { sortOrder: 'asc' } } } } } },
            question: { include: { answerSlots: { orderBy: { sortOrder: 'asc' } } } },
          },
        },
      },
    });
    if (!row || row.status === 'DELETED') throw new BadRequestException('Paper not found');
    return jsonSafe(row);
  }

  async create(ownerId: bigint, dto: CreatePaperDto) {
    if (!dto?.title?.trim()) throw new BadRequestException('Paper title is required');
    const subjectId = await this.ensureDefaultSubject(ownerId);
    const paper = await this.prisma.paper.create({
      data: {
        ownerId,
        subjectId,
        title: dto.title.trim(),
        description: dto.description?.trim() || null,
      },
    });
    return this.get(ownerId, Number(paper.id));
  }

  async smartGenerate(ownerId: bigint, dto: SmartGeneratePaperDto) {
    if (!dto?.title?.trim()) throw new BadRequestException('Paper title is required');
    const subjectId = await this.ensureDefaultSubject(ownerId);
    const count = Math.min(50, Math.max(1, Number(dto.count ?? 10)));
    const keyword = dto.keyword?.trim();
    const gradeLevel = dto.gradeLevel?.trim();
    const tag = dto.tag?.trim();
    const maxDifficulty = Number(dto.maxDifficulty || 5);
    const candidates = await this.prisma.questionGroup.findMany({
      where: {
        ownerId,
        status: { not: 'DELETED' },
        difficulty: { lte: maxDifficulty },
        ...(gradeLevel ? { gradeLevel } : {}),
        ...(keyword ? { title: { contains: keyword } } : {}),
      },
      orderBy: [{ difficulty: 'asc' }, { updatedAt: 'desc' }],
      take: 200,
      include: { _count: { select: { questions: true } } },
    });
    const groups = (tag ? candidates.filter((group) => Array.isArray(group.tags) && (group.tags as unknown[]).map(String).includes(tag)) : candidates).slice(0, count);
    if (!groups.length) throw new BadRequestException('No question groups matched smart generation rules');

    const paper = await this.prisma.paper.create({
      data: {
        ownerId,
        subjectId,
        title: dto.title.trim(),
        description: dto.description?.trim() || `智能组卷：${keyword || '全部题目'}，${groups.length} 道大题`,
        items: {
          create: groups.map((group, index) => ({
            groupId: group.id,
            sortOrder: index + 1,
            score: group.score || 1,
          })),
        },
      },
    });
    return this.get(ownerId, Number(paper.id));
  }

  async update(ownerId: bigint, id: number, dto: UpdatePaperDto) {
    if (!id || Number.isNaN(id)) throw new BadRequestException('Invalid paper id');
    const result = await this.prisma.paper.updateMany({
      where: { id: BigInt(id), ownerId, status: { not: 'DELETED' } },
      data: {
        title: dto.title?.trim() || undefined,
        description: dto.description === undefined ? undefined : (dto.description?.trim() || null),
      },
    });
    if (!result.count) throw new BadRequestException('Paper not found');
    return this.get(ownerId, id);
  }

  async remove(ownerId: bigint, id: number) {
    if (!id || Number.isNaN(id)) throw new BadRequestException('Invalid paper id');
    const result = await this.prisma.paper.updateMany({
      where: { id: BigInt(id), ownerId, status: { not: 'DELETED' } },
      data: { status: 'DELETED' },
    });
    if (!result.count) throw new BadRequestException('Paper not found');
    return { ok: true };
  }

  async addQuestionGroup(ownerId: bigint, id: number, dto: AddPaperQuestionGroupDto) {
    if (!id || Number.isNaN(id)) throw new BadRequestException('Invalid paper id');
    const groupId = Number(dto?.groupId);
    if (!groupId || Number.isNaN(groupId)) throw new BadRequestException('Invalid question group id');

    const [paper, group, lastItem] = await Promise.all([
      this.prisma.paper.findFirst({ where: { id: BigInt(id), ownerId } }),
      this.prisma.questionGroup.findFirst({ where: { id: BigInt(groupId), ownerId } }),
      this.prisma.paperQuestion.findFirst({
        where: { paperId: BigInt(id) },
        orderBy: { sortOrder: 'desc' },
      }),
    ]);
    if (!paper || paper.status === 'DELETED') throw new BadRequestException('Paper not found');
    if (!group || group.status === 'DELETED') throw new BadRequestException('Question group not found');

    await this.prisma.paperQuestion.create({
      data: {
        paperId: BigInt(id),
        groupId: BigInt(groupId),
        sortOrder: (lastItem?.sortOrder ?? 0) + 1,
        score: group.score || 1,
      },
    });
    return this.get(ownerId, id);
  }

  async removeItem(ownerId: bigint, id: number, itemId: number) {
    if (!id || Number.isNaN(id)) throw new BadRequestException('Invalid paper id');
    if (!itemId || Number.isNaN(itemId)) throw new BadRequestException('Invalid paper item id');
    await this.ensurePaper(ownerId, id);
    await this.prisma.paperQuestion.deleteMany({ where: { id: BigInt(itemId), paperId: BigInt(id) } });
    return this.get(ownerId, id);
  }

  async reorderItems(ownerId: bigint, id: number, dto: ReorderPaperItemsDto) {
    if (!id || Number.isNaN(id)) throw new BadRequestException('Invalid paper id');
    await this.ensurePaper(ownerId, id);
    const itemIds = (dto?.itemIds ?? []).map((value) => Number(value)).filter((value) => value && !Number.isNaN(value));
    if (!itemIds.length) throw new BadRequestException('Paper item ids are required');

    const existing = await this.prisma.paperQuestion.findMany({
      where: { paperId: BigInt(id), id: { in: itemIds.map((itemId) => BigInt(itemId)) } },
      select: { id: true },
    });
    if (existing.length !== itemIds.length) throw new BadRequestException('Some paper items do not belong to this paper');

    await this.prisma.$transaction(itemIds.map((itemId, index) => this.prisma.paperQuestion.update({
      where: { id: BigInt(itemId) },
      data: { sortOrder: index + 1 },
    })));
    return this.get(ownerId, id);
  }

  private async ensurePaper(ownerId: bigint, id: number) {
    const paper = await this.prisma.paper.findFirst({
      where: { id: BigInt(id), ownerId, status: { not: 'DELETED' } },
      select: { id: true },
    });
    if (!paper) throw new BadRequestException('Paper not found');
  }

  private async ensureDefaultSubject(ownerId: bigint) {
    const existing = await this.prisma.subject.findFirst({
      where: { ownerId, name: '数学', status: { not: 'DELETED' } },
      orderBy: { id: 'asc' },
      select: { id: true },
    });
    if (existing) return existing.id;
    const subject = await this.prisma.subject.create({
      data: { ownerId, name: '数学', icon: '🔢' },
      select: { id: true },
    });
    return subject.id;
  }
}

import { BadRequestException, Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import type { AddPaperQuestionGroupDto, CreatePaperDto, ReorderPaperItemsDto, SmartGeneratePaperDto, UpdatePaperDto } from './dto';

const DEFAULT_OWNER_ID = 1n;
const DEFAULT_SUBJECT_ID = 1n;

function jsonSafe<T>(value: T): T {
  return JSON.parse(JSON.stringify(value, (_key, v) => typeof v === 'bigint' ? v.toString() : v));
}

@Injectable()
export class PapersService {
  constructor(private readonly prisma: PrismaService) {}

  async list() {
    const rows = await this.prisma.paper.findMany({
      where: { status: { not: 'DELETED' } },
      orderBy: { createdAt: 'desc' },
      include: { items: true },
      take: 50,
    });
    return jsonSafe(rows.map((paper) => ({ ...paper, itemCount: paper.items.length })));
  }

  async get(id: number) {
    const row = await this.prisma.paper.findUnique({
      where: { id: BigInt(id) },
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

  async create(dto: CreatePaperDto) {
    if (!dto?.title?.trim()) throw new BadRequestException('Paper title is required');
    await this.ensureDefaults();
    const paper = await this.prisma.paper.create({
      data: {
        ownerId: DEFAULT_OWNER_ID,
        subjectId: DEFAULT_SUBJECT_ID,
        title: dto.title.trim(),
        description: dto.description?.trim() || null,
      },
    });
    return this.get(Number(paper.id));
  }

  async smartGenerate(dto: SmartGeneratePaperDto) {
    if (!dto?.title?.trim()) throw new BadRequestException('Paper title is required');
    await this.ensureDefaults();
    const count = Math.min(50, Math.max(1, Number(dto.count ?? 10)));
    const keyword = dto.keyword?.trim();
    const gradeLevel = dto.gradeLevel?.trim();
    const tag = dto.tag?.trim();
    const maxDifficulty = Number(dto.maxDifficulty || 5);
    const candidates = await this.prisma.questionGroup.findMany({
      where: {
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
        ownerId: DEFAULT_OWNER_ID,
        subjectId: DEFAULT_SUBJECT_ID,
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
    return this.get(Number(paper.id));
  }

  async update(id: number, dto: UpdatePaperDto) {
    if (!id || Number.isNaN(id)) throw new BadRequestException('Invalid paper id');
    await this.prisma.paper.update({
      where: { id: BigInt(id) },
      data: {
        title: dto.title?.trim() || undefined,
        description: dto.description === undefined ? undefined : (dto.description?.trim() || null),
      },
    });
    return this.get(id);
  }

  async remove(id: number) {
    if (!id || Number.isNaN(id)) throw new BadRequestException('Invalid paper id');
    await this.prisma.paper.update({ where: { id: BigInt(id) }, data: { status: 'DELETED' } });
    return { ok: true };
  }

  async addQuestionGroup(id: number, dto: AddPaperQuestionGroupDto) {
    if (!id || Number.isNaN(id)) throw new BadRequestException('Invalid paper id');
    const groupId = Number(dto?.groupId);
    if (!groupId || Number.isNaN(groupId)) throw new BadRequestException('Invalid question group id');

    const [paper, group, lastItem] = await Promise.all([
      this.prisma.paper.findUnique({ where: { id: BigInt(id) } }),
      this.prisma.questionGroup.findUnique({ where: { id: BigInt(groupId) } }),
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
    return this.get(id);
  }

  async removeItem(id: number, itemId: number) {
    if (!id || Number.isNaN(id)) throw new BadRequestException('Invalid paper id');
    if (!itemId || Number.isNaN(itemId)) throw new BadRequestException('Invalid paper item id');
    await this.prisma.paperQuestion.deleteMany({
      where: { id: BigInt(itemId), paperId: BigInt(id) },
    });
    return this.get(id);
  }

  async reorderItems(id: number, dto: ReorderPaperItemsDto) {
    if (!id || Number.isNaN(id)) throw new BadRequestException('Invalid paper id');
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
    return this.get(id);
  }

  private async ensureDefaults() {
    await this.prisma.user.upsert({
      where: { id: DEFAULT_OWNER_ID },
      update: {},
      create: { id: DEFAULT_OWNER_ID, username: 'admin', passwordHash: 'dev-placeholder', displayName: '管理员' },
    });
    await this.prisma.subject.upsert({
      where: { id: DEFAULT_SUBJECT_ID },
      update: {},
      create: { id: DEFAULT_SUBJECT_ID, ownerId: DEFAULT_OWNER_ID, name: '数学', icon: '📐' },
    });
  }
}

import { BadRequestException, Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import type { SaveQuestionGroupDto } from './dto';

function jsonSafe<T>(value: T): T {
  return JSON.parse(JSON.stringify(value, (_key, v) => typeof v === 'bigint' ? v.toString() : v));
}

function mapSlotType(value: string): string {
  const map: Record<string, string> = {
    text: 'TEXT',
    number: 'NUMBER',
    expression: 'EXPRESSION',
    choice: 'CHOICE',
    match: 'MATCH',
    order: 'ORDER',
    compare_symbol: 'COMPARE_SYMBOL',
  };
  return map[value] ?? 'TEXT';
}

function mapQuestionType(value: string): string {
  const map: Record<string, string> = {
    calculation: 'CALCULATION',
    fill_blank: 'FILL_BLANK',
    single_choice: 'SINGLE_CHOICE',
    multiple_choice: 'MULTIPLE_CHOICE',
    true_false: 'TRUE_FALSE',
    matching: 'MATCHING',
    ordering: 'ORDERING',
    sentence_build: 'SENTENCE_BUILD',
    word_problem: 'WORD_PROBLEM',
  };
  return map[value] ?? 'FILL_BLANK';
}

function normalizeQuestionOptions(question: any) {
  const options = Array.isArray(question?.content?.options) ? question.content.options : Array.isArray(question?.options) ? question.options : [];
  return options
    .map((option: any, index: number) => ({
      optionKey: String(option?.key ?? option?.optionKey ?? option?.label ?? String.fromCharCode(65 + index)).trim(),
      content: String(option?.text ?? option?.content ?? option?.value ?? '').trim(),
      sortOrder: index,
    }))
    .filter((option: { optionKey: string; content: string }) => option.optionKey || option.content);
}

function groupMeta(dto: SaveQuestionGroupDto) {
  return {
    difficulty: Math.min(5, Math.max(1, Number((dto as any).difficulty ?? 1))),
    gradeLevel: (dto as any).gradeLevel?.trim?.() || null,
    tags: Array.isArray((dto as any).tags) ? (dto as any).tags : [],
  };
}

function numericIds(values: unknown) {
  return Array.from(new Set((Array.isArray(values) ? values : values == null ? [] : [values])
    .map((value) => Number(value))
    .filter((value) => value && !Number.isNaN(value))));
}

function inferDefaultTags(group: { groupType?: string | null; title?: string | null }) {
  const title = String(group.title ?? '');
  const tags: string[] = [];
  if (title.includes('古诗') || /梅花|唐诗|宋词/.test(title)) tags.push('古诗');
  if (title.includes('口算') || group.groupType === 'MENTAL_MATH') tags.push('口算');
  if (group.groupType === 'MATCHING_GROUP') tags.push('连线题');
  if (group.groupType === 'COMPOSITE') tags.push('复合题');
  if (!tags.length) tags.push('待补知识点');
  return Array.from(new Set(tags));
}

function normalizeLegacyText(value: string) {
  return String(value ?? '')
    .replace(/\\\((.+?)\\\)/gs, (_all, expr) => `{{math:${String(expr).trim()}}}`)
    .replace(/\\\[(.+?)\\\]/gs, (_all, expr) => `{{math:${String(expr).trim()}}}`)
    .replace(/\{_(\d+)\}/g, (_all, no) => `{{blank:${Number(no) + 1}}}`)
    .replace(/\{\{blank_(\d+)\}\}/g, (_all, no) => `{{blank:${Number(no) + 1}}}`);
}

function normalizeLegacyJson(value: unknown): unknown {
  if (typeof value === 'string') return normalizeLegacyText(value);
  if (Array.isArray(value)) return value.map((item) => normalizeLegacyJson(item));
  if (value && typeof value === 'object') {
    return Object.fromEntries(Object.entries(value).map(([key, item]) => [key, normalizeLegacyJson(item)]));
  }
  return value;
}

function shiftZeroBasedBlankSlotKey(value: unknown) {
  const text = String(value ?? '');
  const match = text.match(/^blank_(\d+)$/);
  if (!match) return text;
  return `blank_${Number(match[1]) + 1}`;
}

@Injectable()
export class QuestionGroupsService {
  constructor(private readonly prisma: PrismaService) {}

  async createFromDraft(ownerId: bigint, dto: SaveQuestionGroupDto) {
    if (!dto || !('type' in dto)) throw new BadRequestException('Invalid draft payload');

    const result = await this.prisma.$transaction(async (tx: any) => {
      const subjectId = await this.ensureDefaultSubject(tx, ownerId);
      const importBatchId = await this.resolveImportBatchId(tx, ownerId, (dto as any).importBatchId);
      const knowledgePointIds = await this.resolveKnowledgePointIds(tx, ownerId, (dto as any).knowledgePointIds);
      const primaryKnowledgePointId = knowledgePointIds[0] ?? null;

      if (dto.type === 'calculation_group') {
        const meta = groupMeta(dto);
        const group = await tx.questionGroup.create({
          data: {
            ownerId,
            subjectId,
            importBatchId,
            knowledgePointId: primaryKnowledgePointId,
            title: dto.title,
            ...meta,
            groupType: 'MENTAL_MATH',
            content: { sourceType: 'calculation_group', columns: dto.columns ?? 4 },
          },
        });
        await this.createGroupKnowledgePointLinks(tx, group.id, knowledgePointIds);
        for (const [index, item] of dto.items.entries()) {
          const q = await tx.question.create({
            data: {
              ownerId,
              subjectId,
              groupId: group.id,
              knowledgePointId: primaryKnowledgePointId,
              questionType: 'CALCULATION',
              stem: item.stem,
              ...meta,
              sortOrder: index,
            },
          });
          await this.createQuestionKnowledgePointLinks(tx, q.id, knowledgePointIds);
          await tx.answerSlot.create({
            data: {
              questionId: q.id,
              slotKey: 'answer',
              slotType: 'NUMBER',
              correctAnswer: [String(item.answer)],
            },
          });
        }
        return group;
      }

      if (dto.type === 'composite_group') {
        const meta = groupMeta(dto);
        const group = await tx.questionGroup.create({
          data: {
            ownerId,
            subjectId,
            importBatchId,
            knowledgePointId: primaryKnowledgePointId,
            title: dto.title,
            ...meta,
            commonStem: dto.commonStem,
            groupType: 'COMPOSITE',
            content: { table: dto.table ?? null, materials: dto.materials ?? null },
          },
        });
        await this.createGroupKnowledgePointLinks(tx, group.id, knowledgePointIds);
        for (const [index, child] of dto.children.entries()) {
          await this.createQuestionWithSlots(tx, ownerId, subjectId, group.id, child, index, { ...meta, knowledgePointId: primaryKnowledgePointId, knowledgePointIds });
        }
        return group;
      }

      if (dto.type === 'question') {
        const meta = groupMeta(dto);
        const group = await tx.questionGroup.create({
          data: {
            ownerId,
            subjectId,
            importBatchId,
            knowledgePointId: primaryKnowledgePointId,
            title: dto.title,
            ...meta,
            groupType: 'PRACTICE_SET',
          },
        });
        await this.createGroupKnowledgePointLinks(tx, group.id, knowledgePointIds);
        await this.createQuestionWithSlots(tx, ownerId, subjectId, group.id, dto.question, 0, { ...meta, knowledgePointId: primaryKnowledgePointId, knowledgePointIds });
        return group;
      }

      throw new BadRequestException('Unsupported draft type');
    });

    return jsonSafe(await this.get(ownerId, Number(result.id)));
  }

  async updateFromDraft(ownerId: bigint, id: number, dto: SaveQuestionGroupDto) {
    if (!id || Number.isNaN(id)) throw new BadRequestException('Invalid question group id');
    if (!dto || !('type' in dto)) throw new BadRequestException('Invalid draft payload');

    await this.prisma.$transaction(async (tx: any) => {
      const subjectId = await this.ensureDefaultSubject(tx, ownerId);
      const groupId = BigInt(id);
      const exists = await tx.questionGroup.findFirst({ where: { id: groupId, ownerId }, select: { id: true } });
      if (!exists) throw new BadRequestException('Question group not found');
      const importBatchId = await this.resolveImportBatchId(tx, ownerId, (dto as any).importBatchId);
      const knowledgePointIds = await this.resolveKnowledgePointIds(tx, ownerId, (dto as any).knowledgePointIds);
      const primaryKnowledgePointId = knowledgePointIds[0] ?? null;

      await tx.question.deleteMany({ where: { groupId } });
      await tx.questionGroupKnowledgePoint.deleteMany({ where: { groupId } });

      if (dto.type === 'calculation_group') {
        const meta = groupMeta(dto);
        await tx.questionGroup.update({
          where: { id: groupId },
          data: {
            title: dto.title,
            ...meta,
            importBatchId,
            knowledgePointId: primaryKnowledgePointId,
            commonStem: null,
            groupType: 'MENTAL_MATH',
            content: { sourceType: 'calculation_group', columns: dto.columns ?? 4 },
          },
        });
        await this.createGroupKnowledgePointLinks(tx, groupId, knowledgePointIds);
        for (const [index, item] of dto.items.entries()) {
          const q = await tx.question.create({
            data: {
              ownerId,
              subjectId,
              groupId,
              knowledgePointId: primaryKnowledgePointId,
              questionType: 'CALCULATION',
              stem: item.stem,
              ...meta,
              sortOrder: index,
            },
          });
          await this.createQuestionKnowledgePointLinks(tx, q.id, knowledgePointIds);
          await tx.answerSlot.create({
            data: {
              questionId: q.id,
              slotKey: 'answer',
              slotType: 'NUMBER',
              correctAnswer: [String(item.answer)],
            },
          });
        }
        return;
      }

      if (dto.type === 'composite_group') {
        const meta = groupMeta(dto);
        await tx.questionGroup.update({
          where: { id: groupId },
          data: {
            title: dto.title,
            ...meta,
            importBatchId,
            knowledgePointId: primaryKnowledgePointId,
            commonStem: dto.commonStem,
            groupType: 'COMPOSITE',
            content: { table: dto.table ?? null, materials: dto.materials ?? null },
          },
        });
        await this.createGroupKnowledgePointLinks(tx, groupId, knowledgePointIds);
        for (const [index, child] of dto.children.entries()) {
          await this.createQuestionWithSlots(tx, ownerId, subjectId, groupId, child, index, { ...meta, knowledgePointId: primaryKnowledgePointId, knowledgePointIds });
        }
        return;
      }

      if (dto.type === 'question') {
        const meta = groupMeta(dto);
        await tx.questionGroup.update({
          where: { id: groupId },
          data: {
            title: dto.title,
            ...meta,
            importBatchId,
            knowledgePointId: primaryKnowledgePointId,
            commonStem: null,
            groupType: 'PRACTICE_SET',
            content: undefined,
          },
        });
        await this.createGroupKnowledgePointLinks(tx, groupId, knowledgePointIds);
        await this.createQuestionWithSlots(tx, ownerId, subjectId, groupId, dto.question, 0, { ...meta, knowledgePointId: primaryKnowledgePointId, knowledgePointIds });
        return;
      }

      throw new BadRequestException('Unsupported draft type');
    });

    return this.get(ownerId, id);
  }

  async list(ownerId: bigint, includeDisabled = false) {
    const rows = await this.prisma.questionGroup.findMany({
      where: { ownerId, ...(includeDisabled ? { status: { not: 'DELETED' } } : { status: 'ENABLED' }) },
      orderBy: { createdAt: 'desc' },
      include: {
        _count: { select: { questions: true } },
        questions: { orderBy: { sortOrder: 'asc' }, take: 1, select: { stem: true } },
      },
      take: 50,
    });
    return jsonSafe(rows);
  }

  async exportAll(ownerId: bigint) {
    const rows = await this.prisma.questionGroup.findMany({
      where: { ownerId, status: { not: 'DELETED' } },
      orderBy: { createdAt: 'desc' },
      include: {
        questions: {
          orderBy: { sortOrder: 'asc' },
          include: {
            answerSlots: { orderBy: { sortOrder: 'asc' } },
            options: true,
          },
        },
      },
    });
    return jsonSafe({
      version: 1,
      exportedAt: new Date().toISOString(),
      type: 'kids-quiz-question-bank',
      count: rows.length,
      groups: rows,
    });
  }

  async get(ownerId: bigint, id: number) {
    const row = await this.prisma.questionGroup.findFirst({
      where: { id: BigInt(id), ownerId },
      include: {
        questions: {
          orderBy: { sortOrder: 'asc' },
          include: { answerSlots: { orderBy: { sortOrder: 'asc' } }, options: true },
        },
      },
    });
    if (!row) throw new BadRequestException('Question group not found');
    return jsonSafe(row);
  }

  async bulkUpdateStatus(ownerId: bigint, ids: Array<string | number>, status?: string) {
    const nextStatus = status === 'DISABLED' ? 'DISABLED' : status === 'ENABLED' ? 'ENABLED' : null;
    if (!nextStatus) throw new BadRequestException('Unsupported question group status');
    const groupIds = ids.map((id) => Number(id)).filter((id) => id && !Number.isNaN(id)).map((id) => BigInt(id));
    if (!groupIds.length) throw new BadRequestException('No question groups selected');
    const result = await this.prisma.questionGroup.updateMany({
      where: { ownerId, id: { in: groupIds }, status: { not: 'DELETED' } },
      data: { status: nextStatus },
    });
    return jsonSafe({ ok: true, count: result.count, status: nextStatus });
  }

  async bulkAddTags(ownerId: bigint, ids: Array<string | number>, tags: string[]) {
    const groupIds = ids.map((id) => Number(id)).filter((id) => id && !Number.isNaN(id)).map((id) => BigInt(id));
    const nextTags = Array.from(new Set((tags ?? []).map((tag) => String(tag).trim()).filter(Boolean)));
    if (!groupIds.length) throw new BadRequestException('No question groups selected');
    if (!nextTags.length) throw new BadRequestException('No tags provided');
    const rows = await this.prisma.questionGroup.findMany({ where: { ownerId, id: { in: groupIds }, status: { not: 'DELETED' } }, select: { id: true, tags: true } });
    for (const row of rows) {
      const merged = Array.from(new Set([...(Array.isArray(row.tags) ? row.tags.map(String) : []), ...nextTags]));
      await this.prisma.questionGroup.update({ where: { id: row.id }, data: { tags: merged } });
      await this.prisma.question.updateMany({ where: { groupId: row.id, status: { not: 'DELETED' } }, data: { tags: merged } });
    }
    return jsonSafe({ ok: true, count: rows.length, tags: nextTags });
  }

  async bulkRemoveTags(ownerId: bigint, ids: Array<string | number>, tags: string[]) {
    const groupIds = ids.map((id) => Number(id)).filter((id) => id && !Number.isNaN(id)).map((id) => BigInt(id));
    const removeTags = new Set((tags ?? []).map((tag) => String(tag).trim()).filter(Boolean));
    if (!groupIds.length) throw new BadRequestException('No question groups selected');
    if (!removeTags.size) throw new BadRequestException('No tags provided');
    const rows = await this.prisma.questionGroup.findMany({ where: { ownerId, id: { in: groupIds }, status: { not: 'DELETED' } }, select: { id: true, tags: true } });
    for (const row of rows) {
      const nextTags = (Array.isArray(row.tags) ? row.tags.map(String) : []).filter((tag) => !removeTags.has(tag));
      await this.prisma.questionGroup.update({ where: { id: row.id }, data: { tags: nextTags } });
      await this.prisma.question.updateMany({ where: { groupId: row.id, status: { not: 'DELETED' } }, data: { tags: nextTags } });
    }
    return jsonSafe({ ok: true, count: rows.length, tags: Array.from(removeTags) });
  }

  async bulkApplyDefaults(ownerId: bigint, ids: Array<string | number>, options: { gradeLevel?: string; addMissingTags?: boolean }) {
    const groupIds = ids.map((id) => Number(id)).filter((id) => id && !Number.isNaN(id)).map((id) => BigInt(id));
    if (!groupIds.length) throw new BadRequestException('No question groups selected');
    const defaultGradeLevel = String(options?.gradeLevel ?? '').trim() || '二年级';
    const rows = await this.prisma.questionGroup.findMany({
      where: { ownerId, id: { in: groupIds }, status: { not: 'DELETED' } },
      select: { id: true, groupType: true, title: true, tags: true, gradeLevel: true },
    });
    let gradeFixed = 0;
    let tagFixed = 0;
    for (const row of rows) {
      const currentTags = Array.isArray(row.tags) ? row.tags.map(String).filter(Boolean) : [];
      const data: any = {};
      if (!String(row.gradeLevel ?? '').trim()) {
        data.gradeLevel = defaultGradeLevel;
        gradeFixed += 1;
      }
      if (options?.addMissingTags && !currentTags.length) {
        data.tags = inferDefaultTags(row);
        tagFixed += 1;
      }
      if (!Object.keys(data).length) continue;
      await this.prisma.questionGroup.update({ where: { id: row.id }, data });
      await this.prisma.question.updateMany({
        where: { groupId: row.id, status: { not: 'DELETED' } },
        data: {
          ...(data.gradeLevel ? { gradeLevel: data.gradeLevel } : {}),
          ...(data.tags ? { tags: data.tags } : {}),
        },
      });
    }
    return jsonSafe({ ok: true, count: rows.length, gradeFixed, tagFixed, gradeLevel: defaultGradeLevel });
  }

  async bulkNormalizeLegacy(ownerId: bigint, ids: Array<string | number>) {
    const groupIds = ids.map((id) => Number(id)).filter((id) => id && !Number.isNaN(id)).map((id) => BigInt(id));
    if (!groupIds.length) throw new BadRequestException('No question groups selected');
    const rows = await this.prisma.questionGroup.findMany({
      where: { ownerId, id: { in: groupIds }, status: { not: 'DELETED' } },
      include: {
        questions: {
          where: { status: { not: 'DELETED' } },
          include: { answerSlots: true, options: true },
        },
      },
    });
    let groupFixed = 0;
    let questionFixed = 0;
    let slotFixed = 0;
    let optionFixed = 0;
    for (const group of rows) {
      const nextCommonStem = group.commonStem ? normalizeLegacyText(group.commonStem) : group.commonStem;
      const nextContent = normalizeLegacyJson(group.content ?? null) as Prisma.InputJsonValue | null;
      const groupData: any = {};
      if (nextCommonStem !== group.commonStem) groupData.commonStem = nextCommonStem;
      if (JSON.stringify(nextContent) !== JSON.stringify(group.content ?? null)) groupData.content = nextContent ?? undefined;
      if (Object.keys(groupData).length) {
        await this.prisma.questionGroup.update({ where: { id: group.id }, data: groupData });
        groupFixed += 1;
      }

      for (const question of group.questions) {
        const nextStem = normalizeLegacyText(question.stem ?? '');
        const nextQuestionContent = normalizeLegacyJson(question.content ?? null) as Prisma.InputJsonValue | null;
        const questionData: any = {};
        if (nextStem !== question.stem) questionData.stem = nextStem;
        if (JSON.stringify(nextQuestionContent) !== JSON.stringify(question.content ?? null)) questionData.content = nextQuestionContent ?? undefined;
        if (Object.keys(questionData).length) {
          await this.prisma.question.update({ where: { id: question.id }, data: questionData });
          questionFixed += 1;
        }

        const shouldShiftBlankSlots = question.answerSlots.some((slot) => String(slot.slotKey ?? '') === 'blank_0') || /\{_\d+\}|\{\{blank_\d+\}\}/.test(question.stem ?? '');
        if (shouldShiftBlankSlots) {
          const blankSlots = question.answerSlots.filter((slot) => /^blank_\d+$/.test(String(slot.slotKey ?? '')));
          for (const slot of blankSlots) {
            await this.prisma.answerSlot.update({ where: { id: slot.id }, data: { slotKey: `__legacy_${slot.slotKey}_${slot.id}` } });
          }
          for (const slot of blankSlots) {
            const nextSlotKey = shiftZeroBasedBlankSlotKey(slot.slotKey);
            await this.prisma.answerSlot.update({ where: { id: slot.id }, data: { slotKey: nextSlotKey } });
            if (nextSlotKey !== slot.slotKey) slotFixed += 1;
          }
        }

        for (const option of question.options) {
          const nextText = normalizeLegacyText(option.content ?? '');
          if (nextText !== option.content) {
            await this.prisma.questionOption.update({ where: { id: option.id }, data: { content: nextText } });
            optionFixed += 1;
          }
        }
      }
    }
    return jsonSafe({ ok: true, count: rows.length, groupFixed, questionFixed, slotFixed, optionFixed });
  }

  async updateStatus(ownerId: bigint, id: number, status?: string) {
    if (!id || Number.isNaN(id)) throw new BadRequestException('Invalid question group id');
    const nextStatus = status === 'DISABLED' ? 'DISABLED' : status === 'ENABLED' ? 'ENABLED' : null;
    if (!nextStatus) throw new BadRequestException('Unsupported question group status');
    const result = await this.prisma.questionGroup.updateMany({
      where: { id: BigInt(id), ownerId, status: { not: 'DELETED' } },
      data: { status: nextStatus },
    });
    if (!result.count) throw new BadRequestException('Question group not found');
    return this.get(ownerId, id);
  }

  async remove(ownerId: bigint, id: number) {
    if (!id || Number.isNaN(id)) throw new BadRequestException('Invalid question group id');
    const result = await this.prisma.questionGroup.updateMany({
      where: { id: BigInt(id), ownerId, status: { not: 'DELETED' } },
      data: { status: 'DELETED' },
    });
    if (!result.count) throw new BadRequestException('Question group not found');
    return { ok: true };
  }

  private async ensureDefaultSubject(tx: any, ownerId: bigint) {
    const existing = await tx.subject.findFirst({
      where: { ownerId, name: '数学', status: { not: 'DELETED' } },
      orderBy: { id: 'asc' },
      select: { id: true },
    });
    if (existing) return existing.id as bigint;
    const subject = await tx.subject.create({
      data: {
        ownerId,
        name: '数学',
        icon: '🔢',
      },
      select: { id: true },
    });
    return subject.id as bigint;
  }

  private async resolveImportBatchId(tx: any, ownerId: bigint, value: unknown) {
    const id = Number(value);
    if (!id || Number.isNaN(id)) return null;
    const batch = await tx.importBatch.findFirst({ where: { id: BigInt(id), ownerId }, select: { id: true } });
    if (!batch) throw new BadRequestException('Import batch not found');
    return batch.id as bigint;
  }

  private async resolveKnowledgePointIds(tx: any, ownerId: bigint, values: unknown) {
    const ids = numericIds(values);
    if (!ids.length) return [] as bigint[];
    const rows = await tx.knowledgePoint.findMany({
      where: { ownerId, id: { in: ids.map((id) => BigInt(id)) }, status: { not: 'DELETED' } },
      select: { id: true },
    });
    if (rows.length !== ids.length) throw new BadRequestException('Some knowledge points were not found');
    return rows.map((row: { id: bigint }) => row.id);
  }

  private async createGroupKnowledgePointLinks(tx: any, groupId: bigint, knowledgePointIds: bigint[]) {
    for (const knowledgePointId of knowledgePointIds) {
      await tx.questionGroupKnowledgePoint.create({
        data: { groupId, knowledgePointId },
      });
    }
  }

  private async createQuestionKnowledgePointLinks(tx: any, questionId: bigint, knowledgePointIds: bigint[]) {
    for (const knowledgePointId of knowledgePointIds) {
      await tx.questionKnowledgePoint.create({
        data: { questionId, knowledgePointId },
      });
    }
  }

  private async createQuestionWithSlots(
    tx: any,
    ownerId: bigint,
    subjectId: bigint,
    groupId: bigint,
    question: SaveQuestionGroupDto extends infer _ ? any : never,
    sortOrder: number,
    meta?: { difficulty: number; gradeLevel: string | null; tags: string[]; knowledgePointId?: bigint | null; knowledgePointIds?: bigint[] },
  ) {
    const q = await tx.question.create({
      data: {
        ownerId,
        subjectId,
        groupId,
        knowledgePointId: meta?.knowledgePointId ?? null,
        questionType: mapQuestionType(question.question_type),
        stem: question.stem,
        difficulty: meta?.difficulty ?? 1,
        gradeLevel: meta?.gradeLevel ?? null,
        tags: meta?.tags ?? [],
        content: question.content ?? undefined,
        explanation: question.explanation ?? null,
        sortOrder,
      },
    });
    for (const [index, slot] of (question.answer_slots ?? []).entries()) {
      await tx.answerSlot.create({
        data: {
          questionId: q.id,
          slotKey: slot.slot_key,
          slotType: mapSlotType(slot.slot_type),
          correctAnswer: slot.correct_answer as any,
          answerRule: slot.answer_rule as any,
          sortOrder: index,
        },
      });
    }
    await this.createQuestionKnowledgePointLinks(tx, q.id, meta?.knowledgePointIds ?? []);
    // 选择题：从 answer_slots.choice 提取正确选项 key，写入 is_correct
    const correctOptionKeys = new Set<string>();
    for (const slot of (question.answer_slots ?? [])) {
      if (mapSlotType(slot.slot_type) === 'CHOICE') {
        const answers = Array.isArray(slot.correct_answer) ? slot.correct_answer : [slot.correct_answer];
        for (const a of answers) correctOptionKeys.add(String(a).trim());
      }
    }
    for (const option of normalizeQuestionOptions(question)) {
      await tx.questionOption.create({
        data: {
          questionId: q.id,
          optionKey: option.optionKey,
          content: option.content,
          isCorrect: correctOptionKeys.has(option.optionKey),
          sortOrder: option.sortOrder,
        },
      });
    }
  }
}


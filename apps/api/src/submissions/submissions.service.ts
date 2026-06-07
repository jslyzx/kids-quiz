import { BadRequestException, Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import type { SubmitPaperAttemptDto } from './dto';

function jsonSafe<T>(value: T): T {
  return JSON.parse(JSON.stringify(value, (_key, v) => typeof v === 'bigint' ? v.toString() : v));
}

function toBigIntOrNull(value: unknown) {
  const n = Number(value);
  return n && !Number.isNaN(n) ? BigInt(n) : null;
}

function dateKey(date = new Date()) {
  return `${date.getFullYear()}-${date.getMonth() + 1}-${date.getDate()}`;
}

function yesterdayKey() {
  const date = new Date();
  date.setDate(date.getDate() - 1);
  return dateKey(date);
}

function jsonStringArray(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value.map((item) => String(item).trim()).filter(Boolean);
}

@Injectable()
export class SubmissionsService {
  constructor(private readonly prisma: PrismaService) {}

  async submitPaperAttempt(ownerId: bigint, dto: SubmitPaperAttemptDto, studentId?: bigint) {
    const answers = dto?.answers ?? [];
    if (!Array.isArray(answers) || answers.length === 0) throw new BadRequestException('Answers are required');
    const source = dto.source === 'WRONG_RETRY' ? 'WRONG_RETRY' : 'PAPER';
    const paperId = toBigIntOrNull(dto?.paperId);
    if (!paperId && source !== 'WRONG_RETRY') throw new BadRequestException('Invalid paper id');
    if (paperId) await this.ensurePaper(ownerId, paperId);

    const student = studentId
      ? await this.ensureStudent(ownerId, studentId)
      : await this.ensureDefaultStudent(ownerId, dto.studentName, dto.avatarUrl);
    const totalCount = answers.length;
    const correctTotal = answers.filter((answer) => answer.isCorrect).length;
    const scoreTotal = answers.reduce((sum, answer) => sum + Number(answer.score ?? (answer.isCorrect ? answer.maxScore ?? 1 : 0)), 0);
    const maxScoreTotal = answers.reduce((sum, answer) => sum + Number(answer.maxScore ?? 1), 0);
    const attempt = await this.prisma.practiceAttempt.create({
      data: {
        studentId: student.id,
        paperId,
        source,
        totalCount,
        correctCount: correctTotal,
        wrongCount: totalCount - correctTotal,
        score: scoreTotal,
        maxScore: maxScoreTotal,
        accuracy: totalCount ? Math.round((correctTotal / totalCount) * 100) : 0,
        durationSeconds: Number(dto.durationSeconds ?? 0),
      },
    });

    const created = [];
    for (const answer of answers) {
      const questionId = toBigIntOrNull(answer.questionId);
      if (!questionId) continue;
      const question = await this.prisma.question.findFirst({ where: { id: questionId, ownerId }, select: { id: true } });
      if (!question) continue;
      const groupId = toBigIntOrNull(answer.groupId);
      const answerPaperId = toBigIntOrNull(answer.paperId) ?? paperId;
      if (answerPaperId) await this.ensurePaper(ownerId, answerPaperId);
      const maxScore = Number(answer.maxScore ?? 1);
      const score = Number(answer.score ?? (answer.isCorrect ? maxScore : 0));
      const row = await this.prisma.studentAnswer.create({
        data: {
          attemptId: attempt.id,
          studentId: student.id,
          questionId,
          groupId,
          paperId: answerPaperId,
          source,
          answerData: answer.answerData as any,
          correctData: answer.correctData as any,
          isCorrect: Boolean(answer.isCorrect),
          score,
          maxScore,
          durationSeconds: Number(dto.durationSeconds ?? 0),
          details: {
            create: (answer.details ?? []).map((detail) => ({
              slotKey: detail.slotKey,
              studentValue: detail.studentValue as any,
              correctValue: detail.correctValue as any,
              isCorrect: Boolean(detail.isCorrect),
              score: Number(detail.score ?? (detail.isCorrect ? 1 : 0)),
            })),
          },
        },
        include: { details: true },
      });
      created.push(row);
    }

    const correctCount = created.filter((item) => item.isCorrect).length;
    const savedCount = created.length;
    const accuracy = savedCount ? Math.round((correctCount / savedCount) * 100) : 0;
    const reward = await this.grantReward(student.id, {
      attemptId: attempt.id,
      accuracy,
      correct: correctCount,
      total: savedCount,
    });

    return jsonSafe({
      ok: true,
      savedCount,
      correctCount,
      wrongCount: savedCount - correctCount,
      reward,
      records: created,
    });
  }

  async listPaperAttempts(ownerId: bigint, paperId: number, studentId?: bigint) {
    const rows = await this.prisma.studentAnswer.findMany({
      where: { paperId: BigInt(paperId), source: { in: ['PAPER', 'WRONG_RETRY'] }, student: this.studentWhere(ownerId, studentId) },
      orderBy: { submittedAt: 'desc' },
      take: 100,
      include: { details: true, question: true, student: true },
    });
    return jsonSafe(rows);
  }

  async listWrongAnswers(ownerId: bigint, studentId?: bigint) {
    const rows = await this.prisma.studentAnswer.findMany({
      where: { source: { in: ['PAPER', 'WRONG_RETRY'] }, student: this.studentWhere(ownerId, studentId) },
      orderBy: { submittedAt: 'desc' },
      take: 1000,
      include: { details: true, question: { include: { group: true } }, student: true, paper: true },
    });
    const seen = new Set<string>();
    const unresolvedRows = new Map<string, any>();

    for (const row of rows) {
      const wrongDetails = [];
      for (const detail of row.details) {
        const key = `${row.questionId}:${detail.slotKey}`;
        if (seen.has(key)) continue;
        seen.add(key);
        if (!detail.isCorrect) wrongDetails.push(detail);
      }
      if (!wrongDetails.length) continue;
      const rowKey = String(row.id);
      const current = unresolvedRows.get(rowKey);
      if (current) current.details.push(...wrongDetails);
      else unresolvedRows.set(rowKey, { ...row, details: wrongDetails });
    }

    return jsonSafe(Array.from(unresolvedRows.values()).slice(0, 200));
  }

  async listWrongStats(ownerId: bigint, studentId?: bigint) {
    const rows = await this.prisma.studentAnswer.findMany({
      where: { source: { in: ['PAPER', 'WRONG_RETRY'] }, student: this.studentWhere(ownerId, studentId) },
      orderBy: { submittedAt: 'desc' },
      take: 5000,
      include: { details: true, paper: true },
    });
    const latest = new Map<string, { isCorrect: boolean; submittedAt: Date; paperTitle?: string | null }>();
    const everWrong = new Set<string>();
    const unresolvedQuestions = new Set<string>();
    const unresolvedPapers = new Map<string, { paperId: string; title: string; wrongSlots: number }>();

    for (const row of rows) {
      for (const detail of row.details) {
        const key = `${row.questionId}:${detail.slotKey}`;
        if (!detail.isCorrect) everWrong.add(key);
        if (!latest.has(key)) {
          latest.set(key, {
            isCorrect: detail.isCorrect,
            submittedAt: row.submittedAt,
            paperTitle: row.paper?.title,
          });
          if (!detail.isCorrect) {
            unresolvedQuestions.add(String(row.questionId));
            const paperKey = String(row.paperId ?? 'unknown');
            const current = unresolvedPapers.get(paperKey) ?? { paperId: paperKey, title: row.paper?.title || '未知试卷', wrongSlots: 0 };
            current.wrongSlots += 1;
            unresolvedPapers.set(paperKey, current);
          }
        }
      }
    }

    const unresolvedSlots = Array.from(latest.values()).filter((item) => !item.isCorrect).length;
    const masteredSlots = Array.from(everWrong).filter((key) => latest.get(key)?.isCorrect).length;
    const retryAttempts = await this.prisma.practiceAttempt.findMany({
      where: { source: 'WRONG_RETRY', student: this.studentWhere(ownerId, studentId) },
      orderBy: { submittedAt: 'desc' },
      take: 5,
      select: { id: true, totalCount: true, correctCount: true, wrongCount: true, accuracy: true, rewardStars: true, submittedAt: true },
    });

    return jsonSafe({
      unresolvedSlots,
      unresolvedQuestions: unresolvedQuestions.size,
      masteredSlots,
      everWrongSlots: everWrong.size,
      papers: Array.from(unresolvedPapers.values()).sort((a, b) => b.wrongSlots - a.wrongSlots).slice(0, 6),
      recentRetries: retryAttempts,
    });
  }

  async listPaperStats(ownerId: bigint, studentId?: bigint) {
    const rows = await this.prisma.studentAnswer.findMany({
      where: { source: 'PAPER', student: this.studentWhere(ownerId, studentId) },
      select: { paperId: true, isCorrect: true, score: true, maxScore: true },
      take: 5000,
      orderBy: { submittedAt: 'desc' },
    });
    const stats = new Map<string, { paperId: string; total: number; correct: number; wrong: number; score: number; maxScore: number; accuracy: number }>();
    for (const row of rows) {
      if (!row.paperId) continue;
      const paperId = String(row.paperId);
      const current = stats.get(paperId) ?? { paperId, total: 0, correct: 0, wrong: 0, score: 0, maxScore: 0, accuracy: 0 };
      current.total += 1;
      if (row.isCorrect) current.correct += 1;
      else current.wrong += 1;
      current.score += Number(row.score ?? 0);
      current.maxScore += Number(row.maxScore ?? 0);
      current.accuracy = current.total ? Math.round((current.correct / current.total) * 100) : 0;
      stats.set(paperId, current);
    }
    return Array.from(stats.values());
  }

  async listTagStats(ownerId: bigint, studentId?: bigint) {
    const rows = await this.prisma.studentAnswer.findMany({
      where: { source: { in: ['PAPER', 'WRONG_RETRY'] }, student: this.studentWhere(ownerId, studentId) },
      orderBy: { submittedAt: 'desc' },
      take: 5000,
      include: {
        details: true,
        question: {
          include: { group: true },
        },
      },
    });
    const stats = new Map<string, { tag: string; total: number; correct: number; wrong: number; accuracy: number; questionCount: number; recentWrongAt?: Date }>();
    const questionsByTag = new Map<string, Set<string>>();

    for (const row of rows) {
      const tags = [...jsonStringArray(row.question?.tags), ...jsonStringArray(row.question?.group?.tags)];
      const uniqueTags = Array.from(new Set(tags.length ? tags : ['未分类']));
      const detailTotal = row.details.length || 1;
      const detailCorrect = row.details.length ? row.details.filter((detail) => detail.isCorrect).length : row.isCorrect ? 1 : 0;
      for (const tag of uniqueTags) {
        const current = stats.get(tag) ?? { tag, total: 0, correct: 0, wrong: 0, accuracy: 0, questionCount: 0 };
        current.total += detailTotal;
        current.correct += detailCorrect;
        current.wrong = current.total - current.correct;
        current.accuracy = current.total ? Math.round((current.correct / current.total) * 100) : 0;
        if (detailCorrect < detailTotal && (!current.recentWrongAt || row.submittedAt > current.recentWrongAt)) current.recentWrongAt = row.submittedAt;
        stats.set(tag, current);
        const questionSet = questionsByTag.get(tag) ?? new Set<string>();
        questionSet.add(String(row.questionId));
        questionsByTag.set(tag, questionSet);
      }
    }

    return jsonSafe(Array.from(stats.values())
      .map((item) => ({ ...item, questionCount: questionsByTag.get(item.tag)?.size ?? 0 }))
      .sort((a, b) => {
        if (a.total < 3 && b.total >= 3) return 1;
        if (b.total < 3 && a.total >= 3) return -1;
        if (a.accuracy !== b.accuracy) return a.accuracy - b.accuracy;
        return b.total - a.total;
      }));
  }

  async listRecentAttempts(ownerId: bigint, studentId?: bigint) {
    const rows = await this.prisma.studentAnswer.findMany({
      where: { source: { in: ['PAPER', 'WRONG_RETRY'] }, student: this.studentWhere(ownerId, studentId) },
      orderBy: { submittedAt: 'desc' },
      take: 20,
      include: { details: true, question: true, student: true, paper: true },
    });
    return jsonSafe(rows);
  }

  async listPracticeAttempts(ownerId: bigint, paperId?: number, studentId?: bigint) {
    const rows = await this.prisma.practiceAttempt.findMany({
      where: { source: { in: ['PAPER', 'WRONG_RETRY'] }, student: this.studentWhere(ownerId, studentId), ...(paperId ? { paperId: BigInt(paperId) } : {}) },
      orderBy: { submittedAt: 'desc' },
      take: 100,
      include: { student: true, paper: true },
    });
    return jsonSafe(rows);
  }

  async getPracticeAttempt(ownerId: bigint, attemptId: number, studentId?: bigint) {
    const id = toBigIntOrNull(attemptId);
    if (!id) throw new BadRequestException('Invalid attempt id');
    const row = await this.prisma.practiceAttempt.findFirst({
      where: { id, student: this.studentWhere(ownerId, studentId) },
      include: {
        student: true,
        paper: true,
        answers: {
          orderBy: { submittedAt: 'asc' },
          include: { details: true, question: true, student: true, paper: true },
        },
      },
    });
    if (!row) throw new BadRequestException('Practice attempt not found');
    return jsonSafe(row);
  }

  private studentWhere(ownerId: bigint, studentId?: bigint) {
    return studentId ? { ownerId, id: studentId } : { ownerId };
  }

  private async ensureStudent(ownerId: bigint, studentId: bigint) {
    const student = await this.prisma.student.findFirst({
      where: { id: studentId, ownerId, status: { not: 'DELETED' } },
    });
    if (!student) throw new BadRequestException('Student not found');
    return student;
  }

  private async ensureDefaultStudent(ownerId: bigint, studentName?: string, avatarUrl?: string) {
    const name = studentName?.trim() || '小朋友';
    const avatar = avatarUrl?.trim() || null;
    const existing = await this.prisma.student.findFirst({
      where: { ownerId, status: { not: 'DELETED' } },
      orderBy: { id: 'asc' },
    });
    if (existing) {
      return this.prisma.student.update({
        where: { id: existing.id },
        data: { name, avatarUrl: avatar },
      });
    }
    return this.prisma.student.create({
      data: { ownerId, name, avatarUrl: avatar, grade: '二年级' },
    });
  }

  private async ensurePaper(ownerId: bigint, paperId: bigint) {
    const paper = await this.prisma.paper.findFirst({
      where: { id: paperId, ownerId, status: { not: 'DELETED' } },
      select: { id: true },
    });
    if (!paper) throw new BadRequestException('Paper not found');
  }

  private async grantReward(studentId: bigint, input: { attemptId: bigint; accuracy: number; correct: number; total: number }) {
    const student = await this.prisma.student.findUnique({
      where: { id: studentId },
      select: {
        totalStars: true,
        streakDays: true,
        lastPracticeDate: true,
        rewardBadges: true,
      },
    });
    const oldBadges = Array.isArray(student?.rewardBadges) ? student.rewardBadges.map(String) : [];
    const badges = new Set(oldBadges);
    const before = new Set(oldBadges);
    const lastKey = student?.lastPracticeDate ? dateKey(student.lastPracticeDate) : undefined;
    const today = dateKey();
    const nextStreak =
      lastKey === today ? (student?.streakDays ?? 0) : lastKey === yesterdayKey() ? (student?.streakDays ?? 0) + 1 : 1;
    const earned = Math.max(1, Math.round(input.correct * 2 + (input.accuracy >= 90 ? 5 : input.accuracy >= 70 ? 3 : 1)));
    const totalStars = (student?.totalStars ?? 0) + earned;

    if (!student?.lastPracticeDate) badges.add('first_practice');
    if (input.accuracy >= 90) badges.add('accuracy_90');
    if (input.total > 0 && input.accuracy === 100) badges.add('accuracy_100');
    if (nextStreak >= 3) badges.add('streak_3');
    if (nextStreak >= 7) badges.add('streak_7');
    if (totalStars >= 100) badges.add('stars_100');

    const badgeList = Array.from(badges);
    const updated = await this.prisma.student.update({
      where: { id: studentId },
      data: {
        totalStars: { increment: earned },
        streakDays: nextStreak,
        lastPracticeDate: new Date(),
        rewardBadges: badgeList as any,
      },
      select: {
        totalStars: true,
        streakDays: true,
        lastPracticeDate: true,
        rewardBadges: true,
      },
    });
    await this.prisma.practiceAttempt.update({
      where: { id: input.attemptId },
      data: {
        rewardStars: earned,
        totalCount: input.total,
        correctCount: input.correct,
        wrongCount: input.total - input.correct,
        accuracy: input.accuracy,
      },
    });

    const updatedBadges = Array.isArray(updated.rewardBadges) ? updated.rewardBadges.map(String) : badgeList;
    return {
      stars: earned,
      totalStars: updated.totalStars,
      streakDays: updated.streakDays,
      lastPracticeDate: updated.lastPracticeDate,
      badges: updatedBadges,
      newBadges: updatedBadges.filter((badge) => !before.has(badge)),
    };
  }
}

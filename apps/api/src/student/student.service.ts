import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

const DEFAULT_OWNER_ID = 1n;
const DEFAULT_STUDENT_ID = 1n;

function jsonSafe<T>(value: T): T {
  return JSON.parse(JSON.stringify(value, (_key, v) => typeof v === 'bigint' ? v.toString() : v));
}

@Injectable()
export class StudentService {
  constructor(private readonly prisma: PrismaService) {}

  async profile() {
    await this.ensureDefaults();
    return jsonSafe(await this.prisma.student.findUnique({ where: { id: DEFAULT_STUDENT_ID } }));
  }

  async updateProfile(dto: { name?: string; avatarUrl?: string; grade?: string }) {
    await this.ensureDefaults();
    const row = await this.prisma.student.update({
      where: { id: DEFAULT_STUDENT_ID },
      data: {
        name: dto.name?.trim() || undefined,
        avatarUrl: dto.avatarUrl === undefined ? undefined : (dto.avatarUrl?.trim() || null),
        grade: dto.grade === undefined ? undefined : (dto.grade?.trim() || null),
      },
    });
    return jsonSafe(row);
  }

  async taskSettings() {
    await this.ensureDefaults();
    const row = await this.prisma.student.findUnique({ where: { id: DEFAULT_STUDENT_ID }, select: { taskSettings: true } });
    return row?.taskSettings ?? { requireWrongFirst: true, targetAccuracy: 90, dailyLimit: 5, paperIds: [] };
  }

  async updateTaskSettings(dto: unknown) {
    await this.ensureDefaults();
    const row = await this.prisma.student.update({
      where: { id: DEFAULT_STUDENT_ID },
      data: { taskSettings: dto as any },
      select: { taskSettings: true },
    });
    return row.taskSettings;
  }

  async rewards() {
    await this.ensureDefaults();
    const row = await this.prisma.student.findUnique({
      where: { id: DEFAULT_STUDENT_ID },
      select: { totalStars: true, streakDays: true, lastPracticeDate: true, rewardBadges: true },
    });
    return {
      stars: row?.totalStars ?? 0,
      streakDays: row?.streakDays ?? 0,
      lastPracticeDate: row?.lastPracticeDate,
      badges: Array.isArray(row?.rewardBadges) ? row?.rewardBadges : [],
    };
  }

  async updateRewards(dto: { stars?: number; streakDays?: number; lastPracticeDate?: string; badges?: string[] }) {
    await this.ensureDefaults();
    const row = await this.prisma.student.update({
      where: { id: DEFAULT_STUDENT_ID },
      data: {
        totalStars: Number(dto.stars ?? 0),
        streakDays: Number(dto.streakDays ?? 0),
        lastPracticeDate: dto.lastPracticeDate ? new Date(dto.lastPracticeDate) : undefined,
        rewardBadges: Array.isArray(dto.badges) ? dto.badges : [],
      },
      select: { totalStars: true, streakDays: true, lastPracticeDate: true, rewardBadges: true },
    });
    return {
      stars: row.totalStars,
      streakDays: row.streakDays,
      lastPracticeDate: row.lastPracticeDate,
      badges: Array.isArray(row.rewardBadges) ? row.rewardBadges : [],
    };
  }

  private async ensureDefaults() {
    await this.prisma.user.upsert({
      where: { id: DEFAULT_OWNER_ID },
      update: {},
      create: { id: DEFAULT_OWNER_ID, username: 'admin', passwordHash: 'dev-placeholder', displayName: '管理员' },
    });
    await this.prisma.student.upsert({
      where: { id: DEFAULT_STUDENT_ID },
      update: {},
      create: { id: DEFAULT_STUDENT_ID, ownerId: DEFAULT_OWNER_ID, name: '小朋友', grade: '二年级' },
    });
  }
}

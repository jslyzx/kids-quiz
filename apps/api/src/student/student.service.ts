import { BadRequestException, Injectable, UnauthorizedException } from '@nestjs/common';
import bcrypt from 'bcryptjs';
import jwt, { type SignOptions } from 'jsonwebtoken';
import { PrismaService } from '../prisma/prisma.service';

function jsonSafe<T>(value: T): T {
  return JSON.parse(JSON.stringify(value, (_key, v) => typeof v === 'bigint' ? v.toString() : v));
}

function jwtSecret() {
  return process.env.JWT_SECRET || 'kids-quiz-dev-secret-change-me';
}

function tokenExpiresIn(): SignOptions['expiresIn'] {
  return (process.env.STUDENT_JWT_EXPIRES_IN || process.env.JWT_EXPIRES_IN || '30d') as SignOptions['expiresIn'];
}

function defaultOwnerUsername() {
  return process.env.ADMIN_USERNAME || 'admin';
}

function isBcryptHash(value?: string | null) {
  return Boolean(value && /^\$2[aby]\$\d{2}\$/.test(value));
}

function toBigIntOrNull(value: unknown) {
  const n = Number(value);
  return n && !Number.isNaN(n) ? BigInt(n) : null;
}

type RewardCatalogItem = {
  id: string;
  title: string;
  cost: number;
  description?: string;
  enabled: boolean;
};

type RewardRedemption = {
  id: string;
  rewardId: string;
  title: string;
  cost: number;
  status: 'PENDING' | 'APPROVED' | 'REJECTED';
  requestedAt: string;
  confirmedAt?: string;
};

const DEFAULT_REWARD_CATALOG: RewardCatalogItem[] = [
  { id: 'screen_15', title: '15 分钟自由屏幕时间', cost: 30, description: '家长确认后兑换一次', enabled: true },
  { id: 'story_pick', title: '睡前故事选择权', cost: 20, description: '今晚由孩子挑一本故事书', enabled: true },
  { id: 'weekend_treat', title: '周末小奖励', cost: 80, description: '由家长决定具体奖励内容', enabled: true },
];

function settingsObject(value: unknown): Record<string, any> {
  return value && typeof value === 'object' && !Array.isArray(value) ? { ...(value as Record<string, any>) } : {};
}

function rewardCatalogFrom(settings: Record<string, any>): RewardCatalogItem[] {
  const rows = Array.isArray(settings.rewardCatalog) ? settings.rewardCatalog : DEFAULT_REWARD_CATALOG;
  return rows.map((item: any, index: number) => ({
    id: String(item?.id || `reward_${index + 1}`),
    title: String(item?.title || '').trim() || `奖励 ${index + 1}`,
    cost: Math.max(1, Math.floor(Number(item?.cost || 1))),
    description: String(item?.description || '').trim(),
    enabled: item?.enabled !== false,
  }));
}

function rewardRedemptionsFrom(settings: Record<string, any>): RewardRedemption[] {
  return Array.isArray(settings.rewardRedemptions) ? settings.rewardRedemptions.map((item: any) => ({
    id: String(item.id),
    rewardId: String(item.rewardId),
    title: String(item.title || ''),
    cost: Math.max(1, Math.floor(Number(item.cost || 1))),
    status: item.status === 'APPROVED' || item.status === 'REJECTED' ? item.status : 'PENDING',
    requestedAt: String(item.requestedAt || new Date().toISOString()),
    confirmedAt: item.confirmedAt ? String(item.confirmedAt) : undefined,
  })) : [];
}

@Injectable()
export class StudentService {
  constructor(private readonly prisma: PrismaService) {}

  async login(dto: { ownerUsername?: string; studentId?: string | number; studentName?: string; pin?: string }) {
    const ownerUsername = String(dto?.ownerUsername ?? defaultOwnerUsername()).trim();
    const owner = await this.prisma.user.findUnique({ where: { username: ownerUsername } });
    if (!owner || owner.status !== 'ENABLED') throw new UnauthorizedException('家庭账号不存在或已停用');

    const studentId = toBigIntOrNull(dto?.studentId);
    const student = studentId
      ? await this.findStudent(owner.id, studentId)
      : await this.findStudentByName(owner.id, dto?.studentName);
    if (!student) throw new UnauthorizedException('学生不存在或已停用');

    if (isBcryptHash(student.pinHash)) {
      const ok = await bcrypt.compare(String(dto?.pin ?? ''), student.pinHash!);
      if (!ok) throw new UnauthorizedException('学生 PIN 错误');
    }

    return this.createSession(student);
  }

  async listPublicStudents(ownerUsername?: string) {
    const username = String(ownerUsername ?? defaultOwnerUsername()).trim();
    const owner = await this.prisma.user.findUnique({ where: { username } });
    if (!owner || owner.status !== 'ENABLED') throw new UnauthorizedException('家庭账号不存在或已停用');

    await this.ensureDefaultStudent(owner.id);
    const students = await this.prisma.student.findMany({
      where: { ownerId: owner.id, status: 'ENABLED' },
      orderBy: { id: 'asc' },
      select: { id: true, name: true, avatarUrl: true, grade: true, pinHash: true },
    });
    return jsonSafe(students.map((student) => ({
      id: student.id,
      name: student.name,
      avatarUrl: student.avatarUrl,
      grade: student.grade,
      pinEnabled: isBcryptHash(student.pinHash),
    })));
  }

  async createSessionForDefaultStudent(ownerId: bigint, studentId?: string | number) {
    const id = toBigIntOrNull(studentId);
    const student = id ? await this.ensureStudent(ownerId, id) : await this.ensureDefaultStudent(ownerId);
    return this.createSession(student);
  }

  async listManagedStudents(ownerId: bigint) {
    await this.ensureDefaultStudent(ownerId);
    const rows = await this.prisma.student.findMany({
      where: { ownerId, status: { not: 'DELETED' } },
      orderBy: { id: 'asc' },
      select: {
        id: true,
        name: true,
        avatarUrl: true,
        grade: true,
        totalStars: true,
        streakDays: true,
        lastPracticeDate: true,
        status: true,
        pinHash: true,
        createdAt: true,
        updatedAt: true,
      },
    });
    return jsonSafe(rows.map((student) => ({
      ...student,
      pinHash: undefined,
      pinEnabled: isBcryptHash(student.pinHash),
    })));
  }

  async createManagedStudent(ownerId: bigint, dto: { name?: string; avatarUrl?: string; grade?: string; pin?: string }) {
    const name = String(dto?.name ?? '').trim();
    if (!name) throw new BadRequestException('学生姓名不能为空');
    const pin = String(dto?.pin ?? '').trim();
    const row = await this.prisma.student.create({
      data: {
        ownerId,
        name,
        avatarUrl: dto.avatarUrl?.trim() || null,
        grade: dto.grade?.trim() || null,
        pinHash: pin ? await bcrypt.hash(pin, 10) : null,
      },
    });
    return this.profile(ownerId, row.id);
  }

  async updateManagedStudent(ownerId: bigint, studentId: number, dto: { name?: string; avatarUrl?: string; grade?: string; status?: string }) {
    const id = toBigIntOrNull(studentId);
    if (!id) throw new BadRequestException('学生不存在或已停用');
    await this.ensureStudent(ownerId, id);
    const status = dto.status === 'DISABLED' ? 'DISABLED' : dto.status === 'ENABLED' ? 'ENABLED' : undefined;
    const row = await this.prisma.student.update({
      where: { id },
      data: {
        name: dto.name?.trim() || undefined,
        avatarUrl: dto.avatarUrl === undefined ? undefined : (dto.avatarUrl?.trim() || null),
        grade: dto.grade === undefined ? undefined : (dto.grade?.trim() || null),
        status,
      },
    });
    return jsonSafe({ ...row, pinHash: undefined, pinEnabled: isBcryptHash(row.pinHash) });
  }

  async updateManagedStudentPin(ownerId: bigint, studentId: number, dto: { pin?: string | null }) {
    const id = toBigIntOrNull(studentId);
    if (!id) throw new BadRequestException('学生不存在或已停用');
    await this.ensureStudent(ownerId, id);
    const pin = String(dto?.pin ?? '').trim();
    const row = await this.prisma.student.update({
      where: { id },
      data: { pinHash: pin ? await bcrypt.hash(pin, 10) : null },
    });
    return jsonSafe({ ...row, pinHash: undefined, pinEnabled: isBcryptHash(row.pinHash) });
  }

  async removeManagedStudent(ownerId: bigint, studentId: number) {
    const id = toBigIntOrNull(studentId);
    if (!id) throw new BadRequestException('学生不存在或已停用');
    await this.ensureStudent(ownerId, id);
    await this.prisma.student.update({
      where: { id },
      data: { status: 'DELETED' },
    });
    return { ok: true };
  }

  async profile(ownerId: bigint, studentId?: bigint) {
    const student = studentId ? await this.ensureStudent(ownerId, studentId) : await this.ensureDefaultStudent(ownerId);
    return jsonSafe(student);
  }

  async updateProfile(ownerId: bigint, dto: { name?: string; avatarUrl?: string; grade?: string }, studentId?: bigint) {
    const student = studentId ? await this.ensureStudent(ownerId, studentId) : await this.ensureDefaultStudent(ownerId);
    const row = await this.prisma.student.update({
      where: { id: student.id },
      data: {
        name: dto.name?.trim() || undefined,
        avatarUrl: dto.avatarUrl === undefined ? undefined : (dto.avatarUrl?.trim() || null),
        grade: dto.grade === undefined ? undefined : (dto.grade?.trim() || null),
      },
    });
    return jsonSafe(row);
  }

  async taskSettings(ownerId: bigint, studentId?: bigint) {
    const student = studentId ? await this.ensureStudent(ownerId, studentId) : await this.ensureDefaultStudent(ownerId);
    const row = await this.prisma.student.findUnique({ where: { id: student.id }, select: { taskSettings: true } });
    const settings = settingsObject(row?.taskSettings);
    const { rewardCatalog: _catalog, rewardRedemptions: _redemptions, ...taskOnly } = settings;
    return { requireWrongFirst: true, targetAccuracy: 90, dailyLimit: 5, paperIds: [], ...taskOnly };
  }

  async updateTaskSettings(ownerId: bigint, dto: unknown, studentId?: bigint) {
    const student = studentId ? await this.ensureStudent(ownerId, studentId) : await this.ensureDefaultStudent(ownerId);
    const current = await this.prisma.student.findUnique({ where: { id: student.id }, select: { taskSettings: true } });
    const settings = settingsObject(current?.taskSettings);
    const rewardData = {
      ...(settings.rewardCatalog ? { rewardCatalog: settings.rewardCatalog } : {}),
      ...(settings.rewardRedemptions ? { rewardRedemptions: settings.rewardRedemptions } : {}),
    };
    const row = await this.prisma.student.update({
      where: { id: student.id },
      data: { taskSettings: { ...settingsObject(dto), ...rewardData } as any },
      select: { taskSettings: true },
    });
    const next = settingsObject(row.taskSettings);
    const { rewardCatalog: _catalog, rewardRedemptions: _redemptions, ...taskOnly } = next;
    return taskOnly;
  }

  async rewards(ownerId: bigint, studentId?: bigint) {
    const student = studentId ? await this.ensureStudent(ownerId, studentId) : await this.ensureDefaultStudent(ownerId);
    const row = await this.prisma.student.findUnique({
      where: { id: student.id },
      select: { totalStars: true, streakDays: true, lastPracticeDate: true, rewardBadges: true, taskSettings: true },
    });
    const settings = settingsObject(row?.taskSettings);
    return {
      stars: row?.totalStars ?? 0,
      streakDays: row?.streakDays ?? 0,
      lastPracticeDate: row?.lastPracticeDate,
      badges: Array.isArray(row?.rewardBadges) ? row?.rewardBadges : [],
      catalog: rewardCatalogFrom(settings),
      redemptions: rewardRedemptionsFrom(settings),
    };
  }

  async updateRewards(ownerId: bigint, dto: { stars?: number; streakDays?: number; lastPracticeDate?: string; badges?: string[] }, studentId?: bigint) {
    const student = studentId ? await this.ensureStudent(ownerId, studentId) : await this.ensureDefaultStudent(ownerId);
    const row = await this.prisma.student.update({
      where: { id: student.id },
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

  async updateRewardCatalog(ownerId: bigint, dto: { catalog?: RewardCatalogItem[] }, studentId?: bigint) {
    const student = studentId ? await this.ensureStudent(ownerId, studentId) : await this.ensureDefaultStudent(ownerId);
    const current = await this.prisma.student.findUnique({ where: { id: student.id }, select: { taskSettings: true } });
    const settings = settingsObject(current?.taskSettings);
    const catalog = (Array.isArray(dto.catalog) ? dto.catalog : []).map((item, index) => ({
      id: String(item.id || `reward_${Date.now()}_${index}`),
      title: String(item.title || '').trim(),
      cost: Math.max(1, Math.floor(Number(item.cost || 1))),
      description: String(item.description || '').trim(),
      enabled: item.enabled !== false,
    })).filter((item) => item.title);
    await this.prisma.student.update({
      where: { id: student.id },
      data: { taskSettings: { ...settings, rewardCatalog: catalog.length ? catalog : DEFAULT_REWARD_CATALOG } as any },
    });
    return this.rewards(ownerId, student.id);
  }

  async requestRewardRedemption(ownerId: bigint, rewardId: string, studentId?: bigint) {
    const student = studentId ? await this.ensureStudent(ownerId, studentId) : await this.ensureDefaultStudent(ownerId);
    const current = await this.prisma.student.findUnique({
      where: { id: student.id },
      select: { taskSettings: true, totalStars: true },
    });
    const settings = settingsObject(current?.taskSettings);
    const catalog = rewardCatalogFrom(settings);
    const reward = catalog.find((item) => item.id === rewardId && item.enabled);
    if (!reward) throw new BadRequestException('奖励不存在或已停用');
    if ((current?.totalStars ?? 0) < reward.cost) throw new BadRequestException('星星不足，暂时不能兑换');
    const redemptions = rewardRedemptionsFrom(settings);
    redemptions.unshift({
      id: `redeem_${Date.now()}_${Math.random().toString(16).slice(2, 8)}`,
      rewardId: reward.id,
      title: reward.title,
      cost: reward.cost,
      status: 'PENDING',
      requestedAt: new Date().toISOString(),
    });
    await this.prisma.student.update({
      where: { id: student.id },
      data: { taskSettings: { ...settings, rewardCatalog: catalog, rewardRedemptions: redemptions.slice(0, 100) } as any },
    });
    return this.rewards(ownerId, student.id);
  }

  async confirmRewardRedemption(ownerId: bigint, redemptionId: string, dto: { status?: string }, studentId?: bigint) {
    const student = studentId ? await this.ensureStudent(ownerId, studentId) : await this.ensureDefaultStudent(ownerId);
    const current = await this.prisma.student.findUnique({
      where: { id: student.id },
      select: { taskSettings: true, totalStars: true },
    });
    const settings = settingsObject(current?.taskSettings);
    const catalog = rewardCatalogFrom(settings);
    const redemptions = rewardRedemptionsFrom(settings);
    const index = redemptions.findIndex((item) => item.id === redemptionId);
    if (index < 0) throw new BadRequestException('兑换申请不存在');
    if (redemptions[index].status !== 'PENDING') throw new BadRequestException('兑换申请已处理');
    const status = dto.status === 'REJECTED' ? 'REJECTED' : 'APPROVED';
    if (status === 'APPROVED' && (current?.totalStars ?? 0) < redemptions[index].cost) throw new BadRequestException('星星余额不足，无法批准兑换');
    redemptions[index] = { ...redemptions[index], status, confirmedAt: new Date().toISOString() };
    await this.prisma.student.update({
      where: { id: student.id },
      data: {
        totalStars: status === 'APPROVED' ? { decrement: redemptions[index].cost } : undefined,
        taskSettings: { ...settings, rewardCatalog: catalog, rewardRedemptions: redemptions } as any,
      },
    });
    return this.rewards(ownerId, student.id);
  }

  private createSession(student: { id: bigint; ownerId: bigint; name: string; avatarUrl?: string | null; grade?: string | null }) {
    const accessToken = jwt.sign(
      { type: 'student', sub: student.id.toString(), ownerId: student.ownerId.toString(), name: student.name },
      jwtSecret(),
      { expiresIn: tokenExpiresIn() },
    );
    return jsonSafe({
      accessToken,
      student: {
        id: student.id,
        ownerId: student.ownerId,
        name: student.name,
        avatarUrl: student.avatarUrl ?? null,
        grade: student.grade ?? null,
      },
    });
  }

  private async findStudent(ownerId: bigint, studentId: bigint) {
    return this.prisma.student.findFirst({
      where: { id: studentId, ownerId, status: { not: 'DELETED' } },
    });
  }

  private async findStudentByName(ownerId: bigint, studentName?: string) {
    const name = String(studentName ?? '').trim();
    if (name) {
      const byName = await this.prisma.student.findFirst({
        where: { ownerId, name, status: { not: 'DELETED' } },
        orderBy: { id: 'asc' },
      });
      if (byName) return byName;
    }
    return this.ensureDefaultStudent(ownerId);
  }

  private async ensureStudent(ownerId: bigint, studentId: bigint) {
    const student = await this.findStudent(ownerId, studentId);
    if (!student) throw new UnauthorizedException('学生不存在或已停用');
    return student;
  }

  private async ensureDefaultStudent(ownerId: bigint) {
    const existing = await this.prisma.student.findFirst({
      where: { ownerId, status: { not: 'DELETED' } },
      orderBy: { id: 'asc' },
    });
    if (existing) return existing;
    return this.prisma.student.create({
      data: { ownerId, name: '小朋友', grade: '二年级' },
    });
  }
}

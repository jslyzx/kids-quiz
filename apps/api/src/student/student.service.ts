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

type EntertainmentSessionState = {
  date: string;
  enabled: boolean;
  allowedGames: string[];
  dailyLimitSeconds: number;
  usedSeconds: number;
  remainingSeconds: number;
  locked: boolean;
  serverNow: string;
};

const ENTERTAINMENT_GAME_KEYS = ['2048', '24', 'sudoku', 'gomoku', 'memory'];
const ENTERTAINMENT_MIN_LIMIT_SECONDS = 60;
const ENTERTAINMENT_MAX_LIMIT_SECONDS = 30 * 60;
const DEFAULT_REWARD_CATALOG: RewardCatalogItem[] = [
  { id: 'screen_15', title: '15 分钟自由屏幕时间', cost: 30, description: '家长确认后兑换一次', enabled: true },
  { id: 'story_pick', title: '睡前故事选择权', cost: 20, description: '今晚由孩子挑一本故事书', enabled: true },
  { id: 'weekend_treat', title: '周末小奖励', cost: 80, description: '由家长决定具体奖励内容', enabled: true },
];

function settingsObject(value: unknown): Record<string, any> {
  return value && typeof value === 'object' && !Array.isArray(value) ? { ...(value as Record<string, any>) } : {};
}

function todayKey() {
  const date = new Date();
  return `${date.getFullYear()}-${date.getMonth() + 1}-${date.getDate()}`;
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

function rewardCatalogFromRows(rows: any[]): RewardCatalogItem[] {
  return rows.map((row) => ({
    id: String(row.rewardKey),
    title: String(row.title || ''),
    cost: Math.max(1, Math.floor(Number(row.cost || 1))),
    description: String(row.description || ''),
    enabled: row.enabled !== false,
  }));
}

function rewardRedemptionsFromRows(rows: any[]): RewardRedemption[] {
  return rows.map((row) => ({
    id: String(row.id),
    rewardId: String(row.rewardKey),
    title: String(row.title || ''),
    cost: Math.max(1, Math.floor(Number(row.cost || 1))),
    status: row.status === 'APPROVED' || row.status === 'REJECTED' ? row.status : 'PENDING',
    requestedAt: row.requestedAt instanceof Date ? row.requestedAt.toISOString() : String(row.requestedAt || new Date().toISOString()),
    confirmedAt: row.confirmedAt ? (row.confirmedAt instanceof Date ? row.confirmedAt.toISOString() : String(row.confirmedAt)) : undefined,
  }));
}

function parseOptionalDate(value: unknown) {
  if (!value) return undefined;
  const date = new Date(String(value));
  return Number.isNaN(date.getTime()) ? undefined : date;
}

function entertainmentStateFrom(settings: Record<string, any>): EntertainmentSessionState {
  const session = settingsObject(settings.entertainmentSession);
  const date = todayKey();
  const normalized = normalizeEntertainmentSettings({ ...settings, entertainmentDailyLimitSeconds: settings.entertainmentDailyLimitSeconds || session.dailyLimitSeconds });
  const enabled = normalized.entertainmentEnabled;
  const allowedGames = normalized.entertainmentAllowedGames;
  const dailyLimitSeconds = normalized.entertainmentDailyLimitSeconds;
  const usedSeconds = session.date === date ? Math.max(0, Math.floor(Number(session.usedSeconds || 0))) : 0;
  const cappedUsed = Math.min(dailyLimitSeconds, usedSeconds);
  return {
    date,
    enabled,
    allowedGames: allowedGames.length ? allowedGames : ENTERTAINMENT_GAME_KEYS,
    dailyLimitSeconds,
    usedSeconds: cappedUsed,
    remainingSeconds: Math.max(0, dailyLimitSeconds - cappedUsed),
    locked: !enabled || cappedUsed >= dailyLimitSeconds,
    serverNow: new Date().toISOString(),
  };
}

function normalizeEntertainmentSettings(settings: Record<string, any>) {
  const allowedGames = Array.isArray(settings.entertainmentAllowedGames)
    ? settings.entertainmentAllowedGames.map(String).filter((key: string) => ENTERTAINMENT_GAME_KEYS.includes(key))
    : ENTERTAINMENT_GAME_KEYS;
  return {
    entertainmentEnabled: settings.entertainmentEnabled !== false,
    entertainmentDailyLimitSeconds: Math.max(
      ENTERTAINMENT_MIN_LIMIT_SECONDS,
      Math.min(ENTERTAINMENT_MAX_LIMIT_SECONDS, Math.floor(Number(settings.entertainmentDailyLimitSeconds || ENTERTAINMENT_MAX_LIMIT_SECONDS))),
    ),
    entertainmentAllowedGames: allowedGames.length ? allowedGames : ENTERTAINMENT_GAME_KEYS,
  };
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
    const { rewardCatalog: _catalog, rewardRedemptions: _redemptions, entertainmentSession: _session, ...taskOnly } = settings;
    return {
      requireWrongFirst: true,
      targetAccuracy: 90,
      dailyLimit: 5,
      paperIds: [],
      ...taskOnly,
      ...normalizeEntertainmentSettings(taskOnly),
    };
  }

  async updateTaskSettings(ownerId: bigint, dto: unknown, studentId?: bigint) {
    const student = studentId ? await this.ensureStudent(ownerId, studentId) : await this.ensureDefaultStudent(ownerId);
    const current = await this.prisma.student.findUnique({ where: { id: student.id }, select: { taskSettings: true } });
    const settings = settingsObject(current?.taskSettings);
    const rewardData = {
      ...(settings.rewardCatalog ? { rewardCatalog: settings.rewardCatalog } : {}),
      ...(settings.rewardRedemptions ? { rewardRedemptions: settings.rewardRedemptions } : {}),
      ...(settings.entertainmentSession ? { entertainmentSession: settings.entertainmentSession } : {}),
    };
    const nextSettings = {
      ...settings,
      ...settingsObject(dto),
      ...rewardData,
    };
    const row = await this.prisma.student.update({
      where: { id: student.id },
      data: { taskSettings: { ...nextSettings, ...normalizeEntertainmentSettings(nextSettings) } as any },
      select: { taskSettings: true },
    });
    const next = settingsObject(row.taskSettings);
    const { rewardCatalog: _catalog, rewardRedemptions: _redemptions, entertainmentSession: _session, ...taskOnly } = next;
    return taskOnly;
  }

  async entertainmentSession(ownerId: bigint, studentId?: bigint) {
    const student = studentId ? await this.ensureStudent(ownerId, studentId) : await this.ensureDefaultStudent(ownerId);
    const row = await this.prisma.student.findUnique({ where: { id: student.id }, select: { taskSettings: true } });
    return entertainmentStateFrom(settingsObject(row?.taskSettings));
  }

  async addEntertainmentUsage(ownerId: bigint, dto: { addSeconds?: number }, studentId?: bigint) {
    const student = studentId ? await this.ensureStudent(ownerId, studentId) : await this.ensureDefaultStudent(ownerId);
    const current = await this.prisma.student.findUnique({ where: { id: student.id }, select: { taskSettings: true } });
    const settings = settingsObject(current?.taskSettings);
    const state = entertainmentStateFrom(settings);
    if (!state.enabled) return state;
    const addSeconds = Math.max(0, Math.min(60, Math.floor(Number(dto.addSeconds || 0))));
    const usedSeconds = Math.min(state.dailyLimitSeconds, state.usedSeconds + addSeconds);
    const nextSettings = {
      ...settings,
      entertainmentSession: {
        date: state.date,
        dailyLimitSeconds: state.dailyLimitSeconds,
        usedSeconds,
        updatedAt: new Date().toISOString(),
      },
    };
    await this.prisma.student.update({
      where: { id: student.id },
      data: { taskSettings: nextSettings as any },
    });
    return entertainmentStateFrom(nextSettings);
  }

  async resetEntertainmentUsage(ownerId: bigint, studentId?: bigint) {
    const student = studentId ? await this.ensureStudent(ownerId, studentId) : await this.ensureDefaultStudent(ownerId);
    const current = await this.prisma.student.findUnique({ where: { id: student.id }, select: { taskSettings: true } });
    const settings = settingsObject(current?.taskSettings);
    const state = entertainmentStateFrom(settings);
    const nextSettings = {
      ...settings,
      entertainmentSession: {
        date: state.date,
        dailyLimitSeconds: state.dailyLimitSeconds,
        usedSeconds: 0,
        updatedAt: new Date().toISOString(),
      },
    };
    await this.prisma.student.update({
      where: { id: student.id },
      data: { taskSettings: nextSettings as any },
    });
    return entertainmentStateFrom(nextSettings);
  }

  async rewards(ownerId: bigint, studentId?: bigint) {
    const student = studentId ? await this.ensureStudent(ownerId, studentId) : await this.ensureDefaultStudent(ownerId);
    const row = await this.prisma.student.findUnique({
      where: { id: student.id },
      select: { totalStars: true, streakDays: true, lastPracticeDate: true, rewardBadges: true, taskSettings: true },
    });
    const settings = settingsObject(row?.taskSettings);
    const catalogRows = await this.ensureRewardCatalogRows(student.id, settings);
    await this.ensureRewardRedemptionRows(student.id, settings, catalogRows);
    const redemptionRows = await this.prisma.rewardRedemption.findMany({
      where: { studentId: student.id },
      orderBy: { requestedAt: 'desc' },
      take: 100,
    });
    return {
      stars: row?.totalStars ?? 0,
      streakDays: row?.streakDays ?? 0,
      lastPracticeDate: row?.lastPracticeDate,
      badges: Array.isArray(row?.rewardBadges) ? row?.rewardBadges : [],
      catalog: rewardCatalogFromRows(catalogRows),
      redemptions: rewardRedemptionsFromRows(redemptionRows),
    };
  }

  async updateRewards(ownerId: bigint, dto: { stars?: number; streakDays?: number; lastPracticeDate?: string; badges?: string[] }, studentId?: bigint) {
    const student = studentId ? await this.ensureStudent(ownerId, studentId) : await this.ensureDefaultStudent(ownerId);
    await this.prisma.student.update({
      where: { id: student.id },
      data: {
        totalStars: Number(dto.stars ?? 0),
        streakDays: Number(dto.streakDays ?? 0),
        lastPracticeDate: dto.lastPracticeDate ? new Date(dto.lastPracticeDate) : undefined,
        rewardBadges: Array.isArray(dto.badges) ? dto.badges : [],
      },
    });
    return this.rewards(ownerId, student.id);
  }

  async updateRewardCatalog(ownerId: bigint, dto: { catalog?: RewardCatalogItem[] }, studentId?: bigint) {
    const student = studentId ? await this.ensureStudent(ownerId, studentId) : await this.ensureDefaultStudent(ownerId);
    const catalog = (Array.isArray(dto.catalog) ? dto.catalog : []).map((item, index) => ({
      id: String(item.id || `reward_${Date.now()}_${index}`),
      title: String(item.title || '').trim(),
      cost: Math.max(1, Math.floor(Number(item.cost || 1))),
      description: String(item.description || '').trim(),
      enabled: item.enabled !== false,
    })).filter((item) => item.title);
    const rows = catalog.length ? catalog : DEFAULT_REWARD_CATALOG;
    const keys = rows.map((item) => item.id);
    await this.prisma.$transaction(async (tx) => {
      await tx.rewardCatalogItem.deleteMany({ where: { studentId: student.id, rewardKey: { notIn: keys } } });
      for (const [index, item] of rows.entries()) {
        await tx.rewardCatalogItem.upsert({
          where: { studentId_rewardKey: { studentId: student.id, rewardKey: item.id } },
          update: {
            title: item.title,
            cost: item.cost,
            description: item.description || null,
            enabled: item.enabled,
            sortOrder: index,
          },
          create: {
            studentId: student.id,
            rewardKey: item.id,
            title: item.title,
            cost: item.cost,
            description: item.description || null,
            enabled: item.enabled,
            sortOrder: index,
          },
        });
      }
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
    await this.ensureRewardCatalogRows(student.id, settings);
    const reward = await this.prisma.rewardCatalogItem.findFirst({
      where: { studentId: student.id, rewardKey: rewardId, enabled: true },
    });
    if (!reward) throw new BadRequestException('奖励不存在或已停用');
    if ((current?.totalStars ?? 0) < reward.cost) throw new BadRequestException('星星不足，暂时不能兑换');
    await this.prisma.rewardRedemption.create({
      data: {
        studentId: student.id,
        catalogItemId: reward.id,
        rewardKey: reward.rewardKey,
        title: reward.title,
        cost: reward.cost,
      },
    });
    return this.rewards(ownerId, student.id);
  }

  async confirmRewardRedemption(ownerId: bigint, redemptionId: string, dto: { status?: string }, studentId?: bigint) {
    const student = studentId ? await this.ensureStudent(ownerId, studentId) : await this.ensureDefaultStudent(ownerId);
    const id = toBigIntOrNull(redemptionId);
    if (!id) throw new BadRequestException('兑换申请不存在');
    const status = dto.status === 'REJECTED' ? 'REJECTED' : 'APPROVED';
    await this.prisma.$transaction(async (tx) => {
      const redemption = await tx.rewardRedemption.findFirst({ where: { id, studentId: student.id } });
      if (!redemption) throw new BadRequestException('兑换申请不存在');
      if (redemption.status !== 'PENDING') throw new BadRequestException('兑换申请已处理');
      if (status === 'APPROVED') {
        const current = await tx.student.findUnique({ where: { id: student.id }, select: { totalStars: true } });
        if ((current?.totalStars ?? 0) < redemption.cost) throw new BadRequestException('星星余额不足，无法批准兑换');
        await tx.student.update({ where: { id: student.id }, data: { totalStars: { decrement: redemption.cost } } });
      }
      await tx.rewardRedemption.update({
        where: { id: redemption.id },
        data: { status, confirmedAt: new Date() },
      });
    });
    return this.rewards(ownerId, student.id);
  }

  private async ensureRewardCatalogRows(studentId: bigint, settings: Record<string, any>) {
    const existing = await this.prisma.rewardCatalogItem.findMany({
      where: { studentId },
      orderBy: [{ sortOrder: 'asc' }, { id: 'asc' }],
    });
    if (existing.length) return existing;

    const catalog = rewardCatalogFrom(settings);
    await this.prisma.rewardCatalogItem.createMany({
      data: catalog.map((item, index) => ({
        studentId,
        rewardKey: item.id,
        title: item.title,
        cost: item.cost,
        description: item.description || null,
        enabled: item.enabled,
        sortOrder: index,
      })),
      skipDuplicates: true,
    });
    return this.prisma.rewardCatalogItem.findMany({
      where: { studentId },
      orderBy: [{ sortOrder: 'asc' }, { id: 'asc' }],
    });
  }

  private async ensureRewardRedemptionRows(studentId: bigint, settings: Record<string, any>, catalogRows: any[]) {
    const existingCount = await this.prisma.rewardRedemption.count({ where: { studentId } });
    if (existingCount) return;

    const legacyRows = rewardRedemptionsFrom(settings);
    if (!legacyRows.length) return;

    const catalogByKey = new Map(catalogRows.map((row) => [String(row.rewardKey), row]));
    await this.prisma.rewardRedemption.createMany({
      data: legacyRows.map((item) => {
        const catalogItem = catalogByKey.get(item.rewardId);
        return {
          studentId,
          catalogItemId: catalogItem?.id,
          rewardKey: item.rewardId,
          title: item.title || catalogItem?.title || item.rewardId,
          cost: item.cost,
          status: item.status,
          requestedAt: parseOptionalDate(item.requestedAt) || new Date(),
          confirmedAt: parseOptionalDate(item.confirmedAt),
        };
      }),
    });
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

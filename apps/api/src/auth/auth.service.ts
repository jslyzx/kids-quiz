import { Injectable, UnauthorizedException } from '@nestjs/common';
import bcrypt from 'bcryptjs';
import jwt, { type SignOptions } from 'jsonwebtoken';
import { PrismaService } from '../prisma/prisma.service';

const DEFAULT_ADMIN_ID = 1n;

type LoginDto = {
  username?: string;
  password?: string;
};

function jwtSecret() {
  return process.env.JWT_SECRET || 'kids-quiz-dev-secret-change-me';
}

function adminUsername() {
  return process.env.ADMIN_USERNAME || 'admin';
}

function adminPassword() {
  return process.env.ADMIN_PASSWORD || 'admin123';
}

function tokenExpiresIn(): SignOptions['expiresIn'] {
  return (process.env.JWT_EXPIRES_IN || '7d') as SignOptions['expiresIn'];
}

function isBcryptHash(value: string) {
  return /^\$2[aby]\$\d{2}\$/.test(value);
}

@Injectable()
export class AuthService {
  constructor(private readonly prisma: PrismaService) {}

  async login(dto: LoginDto) {
    const username = String(dto?.username ?? '').trim();
    const password = String(dto?.password ?? '');
    if (!username || !password) throw new UnauthorizedException('请输入用户名和密码');

    await this.ensureDefaultAdmin();

    const user = await this.prisma.user.findUnique({ where: { username } });
    if (!user || user.status !== 'ENABLED') throw new UnauthorizedException('用户名或密码错误');

    const ok = isBcryptHash(user.passwordHash)
      ? await bcrypt.compare(password, user.passwordHash)
      : false;
    if (!ok) throw new UnauthorizedException('用户名或密码错误');

    const accessToken = jwt.sign(
      { sub: user.id.toString(), username: user.username, role: user.role },
      jwtSecret(),
      { expiresIn: tokenExpiresIn() },
    );

    return {
      accessToken,
      user: {
        id: user.id.toString(),
        username: user.username,
        displayName: user.displayName,
        role: user.role,
      },
    };
  }

  async ensureDefaultAdmin() {
    const username = adminUsername();
    const passwordHash = await bcrypt.hash(adminPassword(), 10);
    const existing = await this.prisma.user.findUnique({ where: { username } });

    if (!existing) {
      await this.prisma.user.upsert({
        where: { id: DEFAULT_ADMIN_ID },
        update: {
          username,
          passwordHash,
          displayName: '管理员',
          role: 'ADMIN',
          status: 'ENABLED',
        },
        create: {
          id: DEFAULT_ADMIN_ID,
          username,
          passwordHash,
          displayName: '管理员',
          role: 'ADMIN',
          status: 'ENABLED',
        },
      });
      return;
    }

    if (!isBcryptHash(existing.passwordHash)) {
      await this.prisma.user.update({
        where: { id: existing.id },
        data: { passwordHash, status: 'ENABLED' },
      });
    }
  }
}

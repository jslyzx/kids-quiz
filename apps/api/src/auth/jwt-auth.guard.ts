import { CanActivate, ExecutionContext, Injectable, UnauthorizedException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import type { Request } from 'express';
import jwt from 'jsonwebtoken';
import { IS_PUBLIC_KEY } from './public.decorator';
import type { AuthUser } from './current-user';

type JwtPayload = {
  sub?: string;
  username?: string;
  role?: string;
};

type AuthenticatedRequest = Request & { user?: AuthUser };

function jwtSecret() {
  return process.env.JWT_SECRET || 'kids-quiz-dev-secret-change-me';
}

@Injectable()
export class JwtAuthGuard implements CanActivate {
  constructor(private readonly reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (isPublic) return true;

    const request = context.switchToHttp().getRequest<AuthenticatedRequest>();
    const header = request.headers.authorization ?? '';
    const match = /^Bearer\s+(.+)$/i.exec(Array.isArray(header) ? header[0] ?? '' : header);
    if (!match) throw new UnauthorizedException('缺少登录令牌');

    try {
      const payload = jwt.verify(match[1], jwtSecret()) as JwtPayload;
      if (!payload.sub || !payload.username || !payload.role) throw new Error('Invalid token payload');
      request.user = {
        id: BigInt(payload.sub),
        username: payload.username,
        role: payload.role,
      };
      return true;
    } catch {
      throw new UnauthorizedException('登录已失效，请重新登录');
    }
  }
}

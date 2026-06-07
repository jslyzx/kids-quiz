import { CanActivate, ExecutionContext, Injectable, UnauthorizedException } from '@nestjs/common';
import type { Request } from 'express';
import jwt from 'jsonwebtoken';
import type { StudentSessionUser } from './current-student.decorator';

type StudentJwtPayload = {
  type?: string;
  sub?: string;
  ownerId?: string;
  name?: string;
};

type StudentRequest = Request & { student?: StudentSessionUser };

function jwtSecret() {
  return process.env.JWT_SECRET || 'kids-quiz-dev-secret-change-me';
}

@Injectable()
export class StudentAuthGuard implements CanActivate {
  canActivate(context: ExecutionContext): boolean {
    const request = context.switchToHttp().getRequest<StudentRequest>();
    const header = request.headers.authorization ?? '';
    const match = /^Bearer\s+(.+)$/i.exec(Array.isArray(header) ? header[0] ?? '' : header);
    if (!match) throw new UnauthorizedException('缺少学生登录令牌');

    try {
      const payload = jwt.verify(match[1], jwtSecret()) as StudentJwtPayload;
      if (payload.type !== 'student' || !payload.sub || !payload.ownerId) throw new Error('Invalid student token payload');
      request.student = {
        studentId: BigInt(payload.sub),
        ownerId: BigInt(payload.ownerId),
        name: payload.name ?? '小朋友',
      };
      return true;
    } catch {
      throw new UnauthorizedException('学生登录已失效，请重新进入练习');
    }
  }
}

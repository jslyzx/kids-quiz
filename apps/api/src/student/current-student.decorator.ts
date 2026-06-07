import { createParamDecorator, type ExecutionContext } from '@nestjs/common';
import type { Request } from 'express';

export type StudentSessionUser = {
  studentId: bigint;
  ownerId: bigint;
  name: string;
};

type StudentRequest = Request & { student?: StudentSessionUser };

export const CurrentStudent = createParamDecorator(
  (_data: unknown, context: ExecutionContext) => {
    const request = context.switchToHttp().getRequest<StudentRequest>();
    return request.student;
  },
);

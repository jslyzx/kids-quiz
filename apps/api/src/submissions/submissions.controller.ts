import { Body, Controller, Get, Param, Post, Query } from '@nestjs/common';
import type { AuthUser } from '../auth/current-user';
import { CurrentUser } from '../auth/current-user.decorator';
import type { SubmitPaperAttemptDto } from './dto';
import { SubmissionsService } from './submissions.service';

@Controller('admin/submissions')
export class SubmissionsController {
  constructor(private readonly service: SubmissionsService) {}

  private studentId(value?: string) {
    const n = Number(value);
    return n && !Number.isNaN(n) ? BigInt(n) : undefined;
  }

  @Post('paper-attempts')
  submitPaperAttempt(@CurrentUser() user: AuthUser, @Body() dto: SubmitPaperAttemptDto) {
    return this.service.submitPaperAttempt(user.id, dto);
  }

  @Get('wrong-answers')
  listWrongAnswers(@CurrentUser() user: AuthUser, @Query('studentId') studentId?: string) {
    return this.service.listWrongAnswers(user.id, this.studentId(studentId));
  }

  @Get('wrong-stats')
  listWrongStats(@CurrentUser() user: AuthUser, @Query('studentId') studentId?: string) {
    return this.service.listWrongStats(user.id, this.studentId(studentId));
  }

  @Get('paper-stats')
  listPaperStats(@CurrentUser() user: AuthUser, @Query('studentId') studentId?: string) {
    return this.service.listPaperStats(user.id, this.studentId(studentId));
  }

  @Get('tag-stats')
  listTagStats(@CurrentUser() user: AuthUser, @Query('studentId') studentId?: string) {
    return this.service.listTagStats(user.id, this.studentId(studentId));
  }

  @Get('recent-attempts')
  listRecentAttempts(@CurrentUser() user: AuthUser, @Query('studentId') studentId?: string) {
    return this.service.listRecentAttempts(user.id, this.studentId(studentId));
  }

  @Get('practice-attempts')
  listPracticeAttempts(@CurrentUser() user: AuthUser, @Query('paperId') paperId?: string, @Query('studentId') studentId?: string) {
    return this.service.listPracticeAttempts(user.id, paperId ? Number(paperId) : undefined, this.studentId(studentId));
  }

  @Get('practice-attempts/:attemptId')
  getPracticeAttempt(@CurrentUser() user: AuthUser, @Param('attemptId') attemptId: string, @Query('studentId') studentId?: string) {
    return this.service.getPracticeAttempt(user.id, Number(attemptId), this.studentId(studentId));
  }

  @Get('paper-attempts/:paperId')
  listPaperAttempts(@CurrentUser() user: AuthUser, @Param('paperId') paperId: string, @Query('studentId') studentId?: string) {
    return this.service.listPaperAttempts(user.id, Number(paperId), this.studentId(studentId));
  }
}

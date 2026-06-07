import { Body, Controller, Get, Param, Post, Query } from '@nestjs/common';
import { Public } from '../auth/public.decorator';
import type { SubmitPaperAttemptDto } from './dto';
import { SubmissionsService } from './submissions.service';

@Controller('admin/submissions')
export class SubmissionsController {
  constructor(private readonly service: SubmissionsService) {}

  @Post('paper-attempts')
  @Public()
  submitPaperAttempt(@Body() dto: SubmitPaperAttemptDto) {
    return this.service.submitPaperAttempt(dto);
  }

  @Get('wrong-answers')
  @Public()
  listWrongAnswers() {
    return this.service.listWrongAnswers();
  }

  @Get('wrong-stats')
  @Public()
  listWrongStats() {
    return this.service.listWrongStats();
  }

  @Get('paper-stats')
  @Public()
  listPaperStats() {
    return this.service.listPaperStats();
  }

  @Get('tag-stats')
  @Public()
  listTagStats() {
    return this.service.listTagStats();
  }

  @Get('recent-attempts')
  @Public()
  listRecentAttempts() {
    return this.service.listRecentAttempts();
  }

  @Get('practice-attempts')
  @Public()
  listPracticeAttempts(@Query('paperId') paperId?: string) {
    return this.service.listPracticeAttempts(paperId ? Number(paperId) : undefined);
  }

  @Get('practice-attempts/:attemptId')
  @Public()
  getPracticeAttempt(@Param('attemptId') attemptId: string) {
    return this.service.getPracticeAttempt(Number(attemptId));
  }

  @Get('paper-attempts/:paperId')
  @Public()
  listPaperAttempts(@Param('paperId') paperId: string) {
    return this.service.listPaperAttempts(Number(paperId));
  }
}

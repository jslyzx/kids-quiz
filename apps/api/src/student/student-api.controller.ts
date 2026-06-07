import { Body, Controller, Get, Param, Post, Put, Query, UseGuards } from '@nestjs/common';
import { Public } from '../auth/public.decorator';
import { PapersService } from '../papers/papers.service';
import { QuestionGroupsService } from '../question-groups/question-groups.service';
import { SubmissionsService } from '../submissions/submissions.service';
import type { SubmitPaperAttemptDto } from '../submissions/dto';
import { CurrentStudent, type StudentSessionUser } from './current-student.decorator';
import { StudentAuthGuard } from './student-auth.guard';
import { StudentService } from './student.service';

@Public()
@UseGuards(StudentAuthGuard)
@Controller('student')
export class StudentApiController {
  constructor(
    private readonly studentService: StudentService,
    private readonly papersService: PapersService,
    private readonly questionGroupsService: QuestionGroupsService,
    private readonly submissionsService: SubmissionsService,
  ) {}

  @Get('profile')
  profile(@CurrentStudent() student: StudentSessionUser) {
    return this.studentService.profile(student.ownerId, student.studentId);
  }

  @Put('profile')
  updateProfile(@CurrentStudent() student: StudentSessionUser, @Body() dto: { name?: string; avatarUrl?: string; grade?: string }) {
    return this.studentService.updateProfile(student.ownerId, dto, student.studentId);
  }

  @Get('task-settings')
  taskSettings(@CurrentStudent() student: StudentSessionUser) {
    return this.studentService.taskSettings(student.ownerId, student.studentId);
  }

  @Get('rewards')
  rewards(@CurrentStudent() student: StudentSessionUser) {
    return this.studentService.rewards(student.ownerId, student.studentId);
  }

  @Post('rewards/redemptions')
  requestRewardRedemption(@CurrentStudent() student: StudentSessionUser, @Body() dto: { rewardId?: string }) {
    return this.studentService.requestRewardRedemption(student.ownerId, String(dto.rewardId || ''), student.studentId);
  }

  @Get('papers')
  listPapers(@CurrentStudent() student: StudentSessionUser) {
    return this.papersService.list(student.ownerId);
  }

  @Get('papers/:id')
  getPaper(@CurrentStudent() student: StudentSessionUser, @Param('id') id: string) {
    return this.papersService.get(student.ownerId, Number(id));
  }

  @Get('question-groups')
  listQuestionGroups(@CurrentStudent() student: StudentSessionUser) {
    return this.questionGroupsService.list(student.ownerId, false);
  }

  @Get('question-groups/:id')
  getQuestionGroup(@CurrentStudent() student: StudentSessionUser, @Param('id') id: string) {
    return this.questionGroupsService.get(student.ownerId, Number(id));
  }

  @Post('submissions/paper-attempts')
  submitPaperAttempt(@CurrentStudent() student: StudentSessionUser, @Body() dto: SubmitPaperAttemptDto) {
    return this.submissionsService.submitPaperAttempt(student.ownerId, dto, student.studentId);
  }

  @Get('submissions/wrong-answers')
  listWrongAnswers(@CurrentStudent() student: StudentSessionUser) {
    return this.submissionsService.listWrongAnswers(student.ownerId, student.studentId);
  }

  @Get('submissions/wrong-stats')
  listWrongStats(@CurrentStudent() student: StudentSessionUser) {
    return this.submissionsService.listWrongStats(student.ownerId, student.studentId);
  }

  @Get('submissions/paper-stats')
  listPaperStats(@CurrentStudent() student: StudentSessionUser) {
    return this.submissionsService.listPaperStats(student.ownerId, student.studentId);
  }

  @Get('submissions/tag-stats')
  listTagStats(@CurrentStudent() student: StudentSessionUser) {
    return this.submissionsService.listTagStats(student.ownerId, student.studentId);
  }

  @Get('submissions/recent-attempts')
  listRecentAttempts(@CurrentStudent() student: StudentSessionUser) {
    return this.submissionsService.listRecentAttempts(student.ownerId, student.studentId);
  }

  @Get('submissions/practice-attempts')
  listPracticeAttempts(@CurrentStudent() student: StudentSessionUser, @Query('paperId') paperId?: string) {
    return this.submissionsService.listPracticeAttempts(student.ownerId, paperId ? Number(paperId) : undefined, student.studentId);
  }

  @Get('submissions/practice-attempts/:attemptId')
  getPracticeAttempt(@CurrentStudent() student: StudentSessionUser, @Param('attemptId') attemptId: string) {
    return this.submissionsService.getPracticeAttempt(student.ownerId, Number(attemptId), student.studentId);
  }

  @Get('submissions/paper-attempts/:paperId')
  listPaperAttempts(@CurrentStudent() student: StudentSessionUser, @Param('paperId') paperId: string) {
    return this.submissionsService.listPaperAttempts(student.ownerId, Number(paperId), student.studentId);
  }
}

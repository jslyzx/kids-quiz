import { Body, Controller, Delete, Get, Param, Post, Put, Query } from '@nestjs/common';
import type { AuthUser } from '../auth/current-user';
import { CurrentUser } from '../auth/current-user.decorator';
import { StudentService } from './student.service';

@Controller('admin/student')
export class StudentController {
  constructor(private readonly service: StudentService) {}

  private studentId(value?: string) {
    const n = Number(value);
    return n && !Number.isNaN(n) ? BigInt(n) : undefined;
  }

  @Get('profile')
  profile(@CurrentUser() user: AuthUser, @Query('studentId') studentId?: string) { return this.service.profile(user.id, this.studentId(studentId)); }

  @Get('students')
  listStudents(@CurrentUser() user: AuthUser) { return this.service.listManagedStudents(user.id); }

  @Post('students')
  createStudent(@CurrentUser() user: AuthUser, @Body() dto: { name?: string; avatarUrl?: string; grade?: string; pin?: string }) {
    return this.service.createManagedStudent(user.id, dto);
  }

  @Put('students/:id')
  updateStudent(@CurrentUser() user: AuthUser, @Param('id') id: string, @Body() dto: { name?: string; avatarUrl?: string; grade?: string; status?: string }) {
    return this.service.updateManagedStudent(user.id, Number(id), dto);
  }

  @Put('students/:id/pin')
  updateStudentPin(@CurrentUser() user: AuthUser, @Param('id') id: string, @Body() dto: { pin?: string | null }) {
    return this.service.updateManagedStudentPin(user.id, Number(id), dto);
  }

  @Delete('students/:id')
  removeStudent(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.service.removeManagedStudent(user.id, Number(id));
  }

  @Post('session')
  createSession(@CurrentUser() user: AuthUser, @Body() dto: { studentId?: string | number }) {
    return this.service.createSessionForDefaultStudent(user.id, dto?.studentId);
  }

  @Put('profile')
  updateProfile(@CurrentUser() user: AuthUser, @Body() dto: { name?: string; avatarUrl?: string; grade?: string }, @Query('studentId') studentId?: string) {
    return this.service.updateProfile(user.id, dto, this.studentId(studentId));
  }

  @Get('task-settings')
  taskSettings(@CurrentUser() user: AuthUser, @Query('studentId') studentId?: string) { return this.service.taskSettings(user.id, this.studentId(studentId)); }

  @Put('task-settings')
  updateTaskSettings(@CurrentUser() user: AuthUser, @Body() dto: unknown, @Query('studentId') studentId?: string) { return this.service.updateTaskSettings(user.id, dto, this.studentId(studentId)); }

  @Get('rewards')
  rewards(@CurrentUser() user: AuthUser, @Query('studentId') studentId?: string) { return this.service.rewards(user.id, this.studentId(studentId)); }

  @Put('rewards')
  updateRewards(@CurrentUser() user: AuthUser, @Body() dto: { stars?: number; streakDays?: number; lastPracticeDate?: string; badges?: string[] }, @Query('studentId') studentId?: string) {
    return this.service.updateRewards(user.id, dto, this.studentId(studentId));
  }

  @Put('rewards/catalog')
  updateRewardCatalog(@CurrentUser() user: AuthUser, @Body() dto: { catalog?: any[] }, @Query('studentId') studentId?: string) {
    return this.service.updateRewardCatalog(user.id, dto, this.studentId(studentId));
  }

  @Post('rewards/redemptions/:id/confirm')
  confirmRewardRedemption(@CurrentUser() user: AuthUser, @Param('id') id: string, @Body() dto: { status?: string }, @Query('studentId') studentId?: string) {
    return this.service.confirmRewardRedemption(user.id, id, dto, this.studentId(studentId));
  }
}

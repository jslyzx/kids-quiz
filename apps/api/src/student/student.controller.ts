import { Body, Controller, Get, Put } from '@nestjs/common';
import { Public } from '../auth/public.decorator';
import { StudentService } from './student.service';

@Controller('admin/student')
export class StudentController {
  constructor(private readonly service: StudentService) {}

  @Get('profile')
  @Public()
  profile() { return this.service.profile(); }

  @Put('profile')
  @Public()
  updateProfile(@Body() dto: { name?: string; avatarUrl?: string; grade?: string }) {
    return this.service.updateProfile(dto);
  }

  @Get('task-settings')
  @Public()
  taskSettings() { return this.service.taskSettings(); }

  @Put('task-settings')
  updateTaskSettings(@Body() dto: unknown) { return this.service.updateTaskSettings(dto); }

  @Get('rewards')
  @Public()
  rewards() { return this.service.rewards(); }

  @Put('rewards')
  @Public()
  updateRewards(@Body() dto: { stars?: number; streakDays?: number; lastPracticeDate?: string; badges?: string[] }) {
    return this.service.updateRewards(dto);
  }
}

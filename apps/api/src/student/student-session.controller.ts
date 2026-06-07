import { Body, Controller, Get, Post, Query } from '@nestjs/common';
import { Public } from '../auth/public.decorator';
import { StudentService } from './student.service';

@Public()
@Controller('student')
export class StudentSessionController {
  constructor(private readonly service: StudentService) {}

  @Get('students')
  listStudents(@Query('ownerUsername') ownerUsername?: string) {
    return this.service.listPublicStudents(ownerUsername);
  }

  @Post('login')
  login(@Body() body: { ownerUsername?: string; studentId?: string | number; studentName?: string; pin?: string }) {
    return this.service.login(body);
  }
}

import { Module } from '@nestjs/common';
import { PapersService } from '../papers/papers.service';
import { PrismaModule } from '../prisma/prisma.module';
import { QuestionGroupsService } from '../question-groups/question-groups.service';
import { SubmissionsService } from '../submissions/submissions.service';
import { StudentApiController } from './student-api.controller';
import { StudentController } from './student.controller';
import { StudentSessionController } from './student-session.controller';
import { StudentService } from './student.service';

@Module({
  imports: [PrismaModule],
  controllers: [StudentController, StudentSessionController, StudentApiController],
  providers: [StudentService, PapersService, QuestionGroupsService, SubmissionsService],
})
export class StudentModule {}

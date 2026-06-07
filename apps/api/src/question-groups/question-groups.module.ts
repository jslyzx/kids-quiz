import { Module } from '@nestjs/common';
import { PrismaModule } from '../prisma/prisma.module';
import { QuestionGroupsController } from './question-groups.controller';
import { QuestionGroupsService } from './question-groups.service';

@Module({
  imports: [PrismaModule],
  controllers: [QuestionGroupsController],
  providers: [QuestionGroupsService],
})
export class QuestionGroupsModule {}

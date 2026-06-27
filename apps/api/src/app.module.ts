import { Module } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { AppController } from './app.controller';
import { AuthModule } from './auth/auth.module';
import { ImportBatchesModule } from './import-batches/import-batches.module';
import { JwtAuthGuard } from './auth/jwt-auth.guard';
import { OcrModule } from './ocr/ocr.module';
import { PapersModule } from './papers/papers.module';
import { QuestionGroupsModule } from './question-groups/question-groups.module';
import { SubmissionsModule } from './submissions/submissions.module';
import { StudentModule } from './student/student.module';
import { UploadsModule } from './uploads/uploads.module';
import { PrismaModule } from './prisma/prisma.module';

@Module({
  imports: [PrismaModule, AuthModule, ImportBatchesModule, QuestionGroupsModule, PapersModule, SubmissionsModule, StudentModule, UploadsModule, OcrModule],
  controllers: [AppController],
  providers: [{ provide: APP_GUARD, useClass: JwtAuthGuard }],
})
export class AppModule {}

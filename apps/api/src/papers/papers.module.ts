import { Module } from '@nestjs/common';
import { PrismaModule } from '../prisma/prisma.module';
import { PapersController } from './papers.controller';
import { PapersService } from './papers.service';

@Module({
  imports: [PrismaModule],
  controllers: [PapersController],
  providers: [PapersService],
})
export class PapersModule {}

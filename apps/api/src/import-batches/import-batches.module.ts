import { Module } from '@nestjs/common';
import { PrismaModule } from '../prisma/prisma.module';
import { ImportBatchesController } from './import-batches.controller';
import { ImportBatchesService } from './import-batches.service';

@Module({
  imports: [PrismaModule],
  controllers: [ImportBatchesController],
  providers: [ImportBatchesService],
})
export class ImportBatchesModule {}

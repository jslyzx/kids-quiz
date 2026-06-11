import { Body, Controller, Get, Param, Patch, Post } from '@nestjs/common';
import type { AuthUser } from '../auth/current-user';
import { CurrentUser } from '../auth/current-user.decorator';
import type { CreateImportBatchDto, FinishImportBatchDto } from './dto';
import { ImportBatchesService } from './import-batches.service';

@Controller('admin/import-batches')
export class ImportBatchesController {
  constructor(private readonly service: ImportBatchesService) {}

  @Get()
  list(@CurrentUser() user: AuthUser) {
    return this.service.list(user.id);
  }

  @Post()
  create(@CurrentUser() user: AuthUser, @Body() dto: CreateImportBatchDto) {
    return this.service.create(user.id, dto);
  }

  @Patch(':id/finish')
  finish(@CurrentUser() user: AuthUser, @Param('id') id: string, @Body() dto: FinishImportBatchDto) {
    return this.service.finish(user.id, Number(id), dto);
  }
}

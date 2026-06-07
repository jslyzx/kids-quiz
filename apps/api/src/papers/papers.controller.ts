import { Body, Controller, Delete, Get, Param, Post, Put } from '@nestjs/common';
import { Public } from '../auth/public.decorator';
import { PapersService } from './papers.service';
import type { AddPaperQuestionGroupDto, CreatePaperDto, ReorderPaperItemsDto, SmartGeneratePaperDto, UpdatePaperDto } from './dto';

@Controller('admin/papers')
export class PapersController {
  constructor(private readonly service: PapersService) {}

  @Get()
  @Public()
  list() { return this.service.list(); }

  @Get(':id')
  @Public()
  get(@Param('id') id: string) { return this.service.get(Number(id)); }

  @Post()
  create(@Body() dto: CreatePaperDto) { return this.service.create(dto); }

  @Post('smart-generate')
  smartGenerate(@Body() dto: SmartGeneratePaperDto) { return this.service.smartGenerate(dto); }

  @Put(':id')
  update(@Param('id') id: string, @Body() dto: UpdatePaperDto) { return this.service.update(Number(id), dto); }

  @Post(':id/question-groups')
  addQuestionGroup(@Param('id') id: string, @Body() dto: AddPaperQuestionGroupDto) {
    return this.service.addQuestionGroup(Number(id), dto);
  }

  @Delete(':id/items/:itemId')
  removeItem(@Param('id') id: string, @Param('itemId') itemId: string) {
    return this.service.removeItem(Number(id), Number(itemId));
  }

  @Put(':id/items/reorder')
  reorderItems(@Param('id') id: string, @Body() dto: ReorderPaperItemsDto) {
    return this.service.reorderItems(Number(id), dto);
  }

  @Delete(':id')
  remove(@Param('id') id: string) { return this.service.remove(Number(id)); }
}

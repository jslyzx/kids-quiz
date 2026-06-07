import { Body, Controller, Delete, Get, Param, Post, Put } from '@nestjs/common';
import type { AuthUser } from '../auth/current-user';
import { CurrentUser } from '../auth/current-user.decorator';
import { PapersService } from './papers.service';
import type { AddPaperQuestionGroupDto, CreatePaperDto, ReorderPaperItemsDto, SmartGeneratePaperDto, UpdatePaperDto } from './dto';

@Controller('admin/papers')
export class PapersController {
  constructor(private readonly service: PapersService) {}

  @Get()
  list(@CurrentUser() user: AuthUser) { return this.service.list(user.id); }

  @Get(':id')
  get(@CurrentUser() user: AuthUser, @Param('id') id: string) { return this.service.get(user.id, Number(id)); }

  @Post()
  create(@CurrentUser() user: AuthUser, @Body() dto: CreatePaperDto) { return this.service.create(user.id, dto); }

  @Post('smart-generate')
  smartGenerate(@CurrentUser() user: AuthUser, @Body() dto: SmartGeneratePaperDto) { return this.service.smartGenerate(user.id, dto); }

  @Put(':id')
  update(@CurrentUser() user: AuthUser, @Param('id') id: string, @Body() dto: UpdatePaperDto) { return this.service.update(user.id, Number(id), dto); }

  @Post(':id/question-groups')
  addQuestionGroup(@CurrentUser() user: AuthUser, @Param('id') id: string, @Body() dto: AddPaperQuestionGroupDto) {
    return this.service.addQuestionGroup(user.id, Number(id), dto);
  }

  @Delete(':id/items/:itemId')
  removeItem(@CurrentUser() user: AuthUser, @Param('id') id: string, @Param('itemId') itemId: string) {
    return this.service.removeItem(user.id, Number(id), Number(itemId));
  }

  @Put(':id/items/reorder')
  reorderItems(@CurrentUser() user: AuthUser, @Param('id') id: string, @Body() dto: ReorderPaperItemsDto) {
    return this.service.reorderItems(user.id, Number(id), dto);
  }

  @Delete(':id')
  remove(@CurrentUser() user: AuthUser, @Param('id') id: string) { return this.service.remove(user.id, Number(id)); }
}

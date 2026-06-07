import { Body, Controller, Delete, Get, Param, Patch, Post, Put, Query } from '@nestjs/common';
import type { AuthUser } from '../auth/current-user';
import { CurrentUser } from '../auth/current-user.decorator';
import { QuestionGroupsService } from './question-groups.service';
import type { SaveQuestionGroupDto } from './dto';

@Controller('admin/question-groups')
export class QuestionGroupsController {
  constructor(private readonly service: QuestionGroupsService) {}

  @Post()
  create(@CurrentUser() user: AuthUser, @Body() dto: SaveQuestionGroupDto) {
    return this.service.createFromDraft(user.id, dto);
  }

  @Put(':id')
  update(@CurrentUser() user: AuthUser, @Param('id') id: string, @Body() dto: SaveQuestionGroupDto) {
    return this.service.updateFromDraft(user.id, Number(id), dto);
  }

  @Get()
  list(@CurrentUser() user: AuthUser, @Query('includeDisabled') includeDisabled?: string) {
    return this.service.list(user.id, includeDisabled === '1' || includeDisabled === 'true');
  }

  @Get('export/all')
  exportAll(@CurrentUser() user: AuthUser) {
    return this.service.exportAll(user.id);
  }

  @Get(':id')
  get(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.service.get(user.id, Number(id));
  }

  @Patch('bulk/status')
  bulkUpdateStatus(@CurrentUser() user: AuthUser, @Body() body: { ids?: Array<string | number>; status?: string }) {
    return this.service.bulkUpdateStatus(user.id, body?.ids ?? [], body?.status);
  }

  @Patch('bulk/tags')
  bulkAddTags(@CurrentUser() user: AuthUser, @Body() body: { ids?: Array<string | number>; tags?: string[] }) {
    return this.service.bulkAddTags(user.id, body?.ids ?? [], body?.tags ?? []);
  }

  @Patch('bulk/tags/remove')
  bulkRemoveTags(@CurrentUser() user: AuthUser, @Body() body: { ids?: Array<string | number>; tags?: string[] }) {
    return this.service.bulkRemoveTags(user.id, body?.ids ?? [], body?.tags ?? []);
  }

  @Patch('bulk/defaults')
  bulkApplyDefaults(@CurrentUser() user: AuthUser, @Body() body: { ids?: Array<string | number>; gradeLevel?: string; addMissingTags?: boolean }) {
    return this.service.bulkApplyDefaults(user.id, body?.ids ?? [], {
      gradeLevel: body?.gradeLevel,
      addMissingTags: body?.addMissingTags,
    });
  }

  @Patch('bulk/normalize-legacy')
  bulkNormalizeLegacy(@CurrentUser() user: AuthUser, @Body() body: { ids?: Array<string | number> }) {
    return this.service.bulkNormalizeLegacy(user.id, body?.ids ?? []);
  }

  @Patch(':id/status')
  updateStatus(@CurrentUser() user: AuthUser, @Param('id') id: string, @Body() body: { status?: string }) {
    return this.service.updateStatus(user.id, Number(id), body?.status);
  }

  @Delete(':id')
  remove(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.service.remove(user.id, Number(id));
  }
}

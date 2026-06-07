import { Body, Controller, Delete, Get, Param, Patch, Post, Put, Query } from '@nestjs/common';
import { Public } from '../auth/public.decorator';
import { QuestionGroupsService } from './question-groups.service';
import type { SaveQuestionGroupDto } from './dto';

@Controller('admin/question-groups')
export class QuestionGroupsController {
  constructor(private readonly service: QuestionGroupsService) {}

  @Post()
  create(@Body() dto: SaveQuestionGroupDto) {
    return this.service.createFromDraft(dto);
  }

  @Put(':id')
  update(@Param('id') id: string, @Body() dto: SaveQuestionGroupDto) {
    return this.service.updateFromDraft(Number(id), dto);
  }

  @Get()
  @Public()
  list(@Query('includeDisabled') includeDisabled?: string) {
    return this.service.list(includeDisabled === '1' || includeDisabled === 'true');
  }

  @Get('export/all')
  exportAll() {
    return this.service.exportAll();
  }

  @Get(':id')
  @Public()
  get(@Param('id') id: string) {
    return this.service.get(Number(id));
  }

  @Patch('bulk/status')
  bulkUpdateStatus(@Body() body: { ids?: Array<string | number>; status?: string }) {
    return this.service.bulkUpdateStatus(body?.ids ?? [], body?.status);
  }

  @Patch('bulk/tags')
  bulkAddTags(@Body() body: { ids?: Array<string | number>; tags?: string[] }) {
    return this.service.bulkAddTags(body?.ids ?? [], body?.tags ?? []);
  }

  @Patch('bulk/tags/remove')
  bulkRemoveTags(@Body() body: { ids?: Array<string | number>; tags?: string[] }) {
    return this.service.bulkRemoveTags(body?.ids ?? [], body?.tags ?? []);
  }

  @Patch('bulk/defaults')
  bulkApplyDefaults(@Body() body: { ids?: Array<string | number>; gradeLevel?: string; addMissingTags?: boolean }) {
    return this.service.bulkApplyDefaults(body?.ids ?? [], {
      gradeLevel: body?.gradeLevel,
      addMissingTags: body?.addMissingTags,
    });
  }

  @Patch('bulk/normalize-legacy')
  bulkNormalizeLegacy(@Body() body: { ids?: Array<string | number> }) {
    return this.service.bulkNormalizeLegacy(body?.ids ?? []);
  }

  @Patch(':id/status')
  updateStatus(@Param('id') id: string, @Body() body: { status?: string }) {
    return this.service.updateStatus(Number(id), body?.status);
  }

  @Delete(':id')
  remove(@Param('id') id: string) {
    return this.service.remove(Number(id));
  }
}

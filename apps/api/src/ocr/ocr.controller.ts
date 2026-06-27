import { Body, Controller, Get, Param, Post, Query } from '@nestjs/common';
import { BaiduOcrService } from './baidu-ocr.service';
import { PaddleOcrService } from './paddle-ocr.service';
import { paddleJsonlToDrafts } from './paddle-to-draft';
import { ocrWordsResultToDrafts } from './ocr-to-draft';
import type { PaperCutRequestDto, PaddleSubmitDto } from './ocr.types';

@Controller('admin/ocr')
export class OcrController {
  constructor(
    private readonly baidu: BaiduOcrService,
    private readonly paddle: PaddleOcrService,
  ) {}

  /** 探测各 OCR provider 是否已配置 */
  @Get('status')
  status() {
    const providers = {
      baidu: { configured: this.baidu.isConfigured() },
      paddle: { configured: this.paddle.isConfigured() },
    };
    // 主 provider：优先 paddle（用户当前有额度），其次 baidu
    const activeProvider = providers.paddle.configured ? 'paddle' : providers.baidu.configured ? 'baidu' : null;
    return {
      providers,
      activeProvider,
      configured: Boolean(activeProvider),
    };
  }

  // ============ 百度 paper_cut_edu（同步） ============

  @Post('paper-cut')
  async paperCut(@Body() body: PaperCutRequestDto) {
    const wordsResult = await this.baidu.paperCut(body ?? {});
    const drafts = ocrWordsResultToDrafts(wordsResult);
    return { drafts, count: drafts.length, provider: 'baidu' };
  }

  // ============ PaddleOCR-VL（异步 job） ============

  /** 提交 paddle job，返回 jobId（前端可轮询 status） */
  @Post('paddle/submit')
  async paddleSubmit(@Body() body: PaddleSubmitDto) {
    const jobId = await this.paddle.submitJob(body ?? {});
    return { jobId, provider: 'paddle' };
  }

  /** 查询 paddle job 状态；完成时附带解析后的草稿 */
  @Get('paddle/status/:jobId')
  async paddleStatus(@Param('jobId') jobId: string) {
    const status = await this.paddle.getJobStatus(jobId);
    const state = status?.data?.state ?? 'pending';
    const progress = status?.data?.extractProgress;
    const result: any = {
      jobId,
      state,
      provider: 'paddle',
      progress: progress ? { total: progress.totalPages, done: progress.extractedPages } : undefined,
    };
    if (state === 'done') {
      const jsonUrl = status?.data?.resultUrl?.jsonUrl;
      if (jsonUrl) {
        const jsonl = await this.paddle.fetchJobResult(jsonUrl);
        result.drafts = paddleJsonlToDrafts(jsonl);
        result.count = result.drafts.length;
      }
    }
    if (state === 'failed') {
      result.error = status?.data?.errorMsg || '识别失败';
    }
    return result;
  }

  /** 同步封装：提交 + 轮询 + 解析（适合单张图片简单场景，超时由 query 控制） */
  @Post('paddle/recognize')
  async paddleRecognize(@Body() body: PaddleSubmitDto, @Query('timeout') timeout?: string) {
    const timeoutMs = Math.min(300_000, Math.max(30_000, Number(timeout) || 120_000));
    const jsonl = await this.paddle.recognize(body ?? {}, timeoutMs);
    const drafts = paddleJsonlToDrafts(jsonl);
    return { drafts, count: drafts.length, provider: 'paddle', raw: jsonl };
  }
}

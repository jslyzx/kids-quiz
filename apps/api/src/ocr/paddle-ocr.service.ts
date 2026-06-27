import { BadRequestException, Injectable, Logger, ServiceUnavailableException } from '@nestjs/common';
import { PaddleJobStatusResponse, PaddleJobSubmitResponse, PaddleJsonlLine, PaddleSubmitDto } from './ocr.types';

/**
 * PaddleOCR-VL（AI Studio）服务
 *
 * API 端点：https://paddleocr.aistudio-app.com/api/v2/ocr/jobs
 * 鉴权：单一 bearer token（环境变量 PADDLEOCR_TOKEN）
 * 模型：PaddleOCR-VL-1.6（文档解析 VLM）
 *
 * 调用模式：异步 job
 *   1. POST 提交 → jobId
 *   2. GET /jobs/:jobId 轮询 → state === 'done'
 *   3. GET resultUrl.jsonUrl → JSONL（每页一行，含 markdown 文本）
 */
@Injectable()
export class PaddleOcrService {
  private readonly logger = new Logger(PaddleOcrService.name);
  private readonly jobUrl = 'https://paddleocr.aistudio-app.com/api/v2/ocr/jobs';
  private readonly model = 'PaddleOCR-VL-1.6';

  private get token() {
    return (process.env.PADDLEOCR_TOKEN ?? '').trim();
  }

  isConfigured() {
    return Boolean(this.token);
  }

  private authHeaders() {
    return { Authorization: `bearer ${this.token}` };
  }

  /** 尝试从响应文本里解析出 AI Studio 的业务错误 {code, msg} */
  private tryParseBizError(text: string): { code: number; msg: string } | null {
    if (!text) return null;
    try {
      const parsed = JSON.parse(text);
      if (typeof parsed?.code === 'number' && parsed.code !== 0) {
        return { code: parsed.code, msg: String(parsed.msg ?? parsed.message ?? '未知错误') };
      }
    } catch {
      // 非 JSON，忽略
    }
    return null;
  }

  /** 判断是否是「队列已满」这类可重试的临时错误 */
  private isRetryableBizError(biz: { code: number; msg: string } | null): boolean {
    if (!biz) return false;
    // 10010 队列已满 / 10011 限流，都是临时错误
    return biz.code === 10010 || biz.code === 10011 || /队列已满|稍后重试|限流|频繁/i.test(biz.msg);
  }

  /**
   * 提交 OCR job（带队列满重试）
   * @returns jobId
   */
  async submitJob(dto: PaddleSubmitDto): Promise<string> {
    if (!this.isConfigured()) {
      throw new ServiceUnavailableException('尚未配置 PaddleOCR token，请在 .env 中设置 PADDLEOCR_TOKEN');
    }

    const MAX_RETRIES = 4;
    const RETRY_INTERVAL = 6_000;
    for (let attempt = 1; attempt <= MAX_RETRIES; attempt += 1) {
      try {
        return await this.submitJobOnce(dto);
      } catch (err) {
        // 只有「队列已满/限流」才重试
        const msg = err instanceof Error ? err.message : String(err);
        const retryable = /队列已满|10010|10011|稍后重试|限流|频繁/i.test(msg);
        if (!retryable || attempt === MAX_RETRIES) throw err;
        this.logger.warn(`PaddleOCR submit 第 ${attempt} 次失败（${msg}），${RETRY_INTERVAL / 1000}s 后重试…`);
        await new Promise((r) => setTimeout(r, RETRY_INTERVAL));
      }
    }
    // unreachable
    throw new ServiceUnavailableException('PaddleOCR 提交失败');
  }

  /** 单次提交（不含重试） */
  private async submitJobOnce(dto: PaddleSubmitDto): Promise<string> {

    let resp: Response;
    if (dto.url) {
      // URL 模式：JSON body
      resp = await fetch(this.jobUrl, {
        method: 'POST',
        headers: { ...this.authHeaders(), 'Content-Type': 'application/json' },
        body: JSON.stringify({
          fileUrl: dto.url,
          model: this.model,
          optionalPayload: {
            useDocOrientationClassify: false,
            useDocUnwarping: false,
            useChartRecognition: false,
          },
        }),
      });
    } else {
      // 本地文件模式：multipart（图片字节直接发过去）
      const { buffer, mime } = this.extractBuffer(dto);
      const boundary = `----paddleocr${Date.now()}${Math.random().toString(16).slice(2)}`;
      const fileName = dto.fileName || `upload.${mime === 'image/png' ? 'png' : 'jpg'}`;

      // 手工拼 multipart body（避免引入 form-data 依赖）
      const head = `--${boundary}\r\nContent-Disposition: form-data; name="file"; filename="${fileName}"\r\nContent-Type: ${mime}\r\n\r\n`;
      const tail1 = `\r\n--${boundary}\r\nContent-Disposition: form-data; name="model"\r\n\r\n${this.model}`;
      const tail2 = `\r\n--${boundary}\r\nContent-Disposition: form-data; name="optionalPayload"\r\n\r\n${JSON.stringify({ useDocOrientationClassify: false, useDocUnwarping: false, useChartRecognition: false })}`;
      const tail3 = `\r\n--${boundary}--\r\n`;
      const body = Buffer.concat([
        Buffer.from(head, 'utf8'),
        buffer,
        Buffer.from(tail1 + tail2 + tail3, 'utf8'),
      ]);

      resp = await fetch(this.jobUrl, {
        method: 'POST',
        headers: { ...this.authHeaders(), 'Content-Type': `multipart/form-data; boundary=${boundary}` },
        body,
      });
    }

    if (!resp.ok) {
      const text = await resp.text().catch(() => '');
      this.logger.error(`PaddleOCR submit 失败 status=${resp.status} body=${text.slice(0, 300)}`);
      // 尝试解析业务错误，把具体信息透传给前端
      const biz = this.tryParseBizError(text);
      throw new ServiceUnavailableException(
        biz ? `PaddleOCR 提交失败：${biz.msg}（code ${biz.code}）` : `PaddleOCR 提交失败（HTTP ${resp.status}），请稍后重试`,
      );
    }

    const data = (await resp.json()) as PaddleJobSubmitResponse;
    // 即使 HTTP 200，业务层也可能返回 code != 0（例如队列满）
    if (data?.code && data.code !== 0 && !data?.data?.jobId) {
      const msg = data?.msg || '未知业务错误';
      this.logger.error(`PaddleOCR submit 业务错误 code=${data.code} msg=${msg}`);
      throw new ServiceUnavailableException(`PaddleOCR 提交失败：${msg}（code ${data.code}）`);
    }
    const jobId = data?.data?.jobId;
    if (!jobId) {
      throw new ServiceUnavailableException(`PaddleOCR 未返回 jobId：${data?.msg ?? '未知错误'}`);
    }
    this.logger.log(`PaddleOCR job 已提交：${jobId}${dto.fileName ? ` (${dto.fileName})` : ''}`);
    return jobId;
  }

  /**
   * 查询 job 状态
   * @returns 状态响应（含 state、progress、resultUrl）
   */
  async getJobStatus(jobId: string): Promise<PaddleJobStatusResponse> {
    if (!this.isConfigured()) {
      throw new ServiceUnavailableException('尚未配置 PaddleOCR token');
    }
    const resp = await fetch(`${this.jobUrl}/${encodeURIComponent(jobId)}`, {
      headers: this.authHeaders(),
    });
    if (!resp.ok) {
      throw new ServiceUnavailableException(`PaddleOCR 状态查询失败（HTTP ${resp.status}）`);
    }
    return (await resp.json()) as PaddleJobStatusResponse;
  }

  /**
   * 取 job 结果 JSONL，解析为行数组
   */
  async fetchJobResult(jsonUrl: string): Promise<PaddleJsonlLine[]> {
    const resp = await fetch(jsonUrl);
    if (!resp.ok) {
      throw new ServiceUnavailableException(`PaddleOCR 结果下载失败（HTTP ${resp.status}）`);
    }
    const text = await resp.text();
    const lines = text.split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
    const results: PaddleJsonlLine[] = [];
    for (const line of lines) {
      try {
        results.push(JSON.parse(line) as PaddleJsonlLine);
      } catch {
        this.logger.warn(`PaddleOCR JSONL 行解析失败，跳过：${line.slice(0, 80)}`);
      }
    }
    return results;
  }

  /**
   * 同步封装：提交 + 轮询（最多 timeoutMs）+ 取结果
   * @returns JSONL 行数组
   */
  async recognize(dto: PaddleSubmitDto, timeoutMs = 120_000): Promise<PaddleJsonlLine[]> {
    const jobId = await this.submitJob(dto);
    const deadline = Date.now() + timeoutMs;
    const pollInterval = 5_000;

    while (Date.now() < deadline) {
      const status = await this.getJobStatus(jobId);
      const state = status?.data?.state;
      if (state === 'done') {
        const jsonUrl = status?.data?.resultUrl?.jsonUrl;
        if (!jsonUrl) throw new BadRequestException('PaddleOCR job 完成但未返回结果 URL');
        this.logger.log(`PaddleOCR job ${jobId} 完成，开始下载结果`);
        return this.fetchJobResult(jsonUrl);
      }
      if (state === 'failed') {
        const msg = status?.data?.errorMsg || '未知错误';
        throw new BadRequestException(`PaddleOCR 识别失败：${msg}`);
      }
      // pending / running：等待后重试
      await new Promise((resolve) => setTimeout(resolve, pollInterval));
    }
    throw new ServiceUnavailableException(`PaddleOCR job ${jobId} 超时（${Math.round(timeoutMs / 1000)}s），可稍后用 jobId 查询`);
  }

  /** 从 dto 提取图片 buffer 和 mime */
  private extractBuffer(dto: PaddleSubmitDto): { buffer: Buffer; mime: string } {
    const MIME_MAP: Record<string, string> = {
      png: 'image/png',
      jpg: 'image/jpeg',
      jpeg: 'image/jpeg',
      webp: 'image/webp',
      bmp: 'image/bmp',
    };
    let base64 = '';
    let mime = '';
    if (dto.dataUrl) {
      const match = /^data:([^;]+);base64,(.+)$/i.exec(dto.dataUrl);
      if (!match) throw new BadRequestException('dataUrl 格式不正确');
      mime = match[1].toLowerCase();
      base64 = match[2];
    } else if (dto.base64) {
      base64 = dto.base64;
      mime = 'image/jpeg';
    } else {
      throw new BadRequestException('缺少图片内容，请提供 base64、dataUrl 或 url');
    }
    if (!/^image\/(png|jpe?g|webp|bmp)$/.test(mime)) {
      // 容错：从文件名推断
      const ext = (dto.fileName ?? '').split('.').pop()?.toLowerCase() ?? '';
      if (MIME_MAP[ext]) mime = MIME_MAP[ext];
    }
    const buffer = Buffer.from(base64, 'base64');
    if (!buffer.length) throw new BadRequestException('图片内容为空');
    if (buffer.byteLength > 10 * 1024 * 1024) throw new BadRequestException('图片不能超过 10MB');
    return { buffer, mime };
  }
}

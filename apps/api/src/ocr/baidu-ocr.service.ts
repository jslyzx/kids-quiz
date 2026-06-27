import { BadRequestException, Injectable, Logger, ServiceUnavailableException } from '@nestjs/common';
import { BaiduPaperCutResponse, BaiduTokenResponse, PaperCutRequestDto } from './ocr.types';

/**
 * 百度 OCR 服务：
 *  - access_token 获取与内存缓存（30 天有效期，提前 5 分钟刷新）
 *  - 调用「试卷切题识别」paper_cut_edu
 *
 * 配置：环境变量 BAIDU_OCR_API_KEY / BAIDU_OCR_SECRET_KEY
 */
@Injectable()
export class BaiduOcrService {
  private readonly logger = new Logger(BaiduOcrService.name);
  /** 缓存的 token + 过期时间戳（ms） */
  private cachedToken: { token: string; expiresAt: number } | null = null;

  private get apiKey() {
    return (process.env.BAIDU_OCR_API_KEY ?? '').trim();
  }
  private get secretKey() {
    return (process.env.BAIDU_OCR_SECRET_KEY ?? '').trim();
  }

  /** 是否已配置密钥 */
  isConfigured() {
    return Boolean(this.apiKey && this.secretKey);
  }

  /** 获取 access_token（带缓存） */
  private async getAccessToken(): Promise<string> {
    if (!this.isConfigured()) {
      throw new ServiceUnavailableException('尚未配置百度 OCR 密钥，请在 .env 中设置 BAIDU_OCR_API_KEY 与 BAIDU_OCR_SECRET_KEY');
    }
    const now = Date.now();
    if (this.cachedToken && this.cachedToken.expiresAt - 5 * 60_000 > now) {
      return this.cachedToken.token;
    }

    const url = new URL('https://aip.baidubce.com/oauth/2.0/token');
    url.searchParams.set('grant_type', 'client_credentials');
    url.searchParams.set('client_id', this.apiKey);
    url.searchParams.set('client_secret', this.secretKey);

    let data: BaiduTokenResponse;
    try {
      const resp = await fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json' } });
      data = (await resp.json()) as BaiduTokenResponse;
    } catch (err) {
      this.logger.error(`获取百度 access_token 失败：${(err as Error).message}`);
      throw new ServiceUnavailableException('无法连接百度智能云鉴权服务');
    }

    if (!data.access_token) {
      const msg = data.error_description || data.error || '未知错误';
      throw new ServiceUnavailableException(`百度 access_token 获取失败：${msg}（请确认 API Key / Secret Key 是否正确）`);
    }

    const expiresInSec = Number(data.expires_in ?? 2592000);
    this.cachedToken = { token: data.access_token, expiresAt: now + expiresInSec * 1000 };
    this.logger.log(`百度 access_token 已刷新，有效期 ${Math.round(expiresInSec / 3600)} 小时`);
    return data.access_token;
  }

  /**
   * 调用「试卷切题识别」
   * @returns 百度原始响应 words_result[]
   */
  async paperCut(dto: PaperCutRequestDto): Promise<Array<{ qus_result?: any[] }>> {
    const token = await this.getAccessToken();

    // 组装请求体：优先 url，其次 base64
    let body: Record<string, string>;
    if (dto.url) {
      body = { url: dto.url, detect_direction: 'true' };
      if (dto.pdfPage) body.pdf_file_page = String(dto.pdfPage);
    } else {
      const base64 = this.extractBase64(dto);
      body = { image: base64, detect_direction: 'true' };
    }

    const apiUrl = new URL('https://aip.baidubce.com/rest/2.0/ocr/v1/paper_cut_edu');
    apiUrl.searchParams.set('access_token', token);

    let data: BaiduPaperCutResponse;
    try {
      const resp = await fetch(apiUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams(body).toString(),
      });
      data = (await resp.json()) as BaiduPaperCutResponse;
    } catch (err) {
      this.logger.error(`百度 paper_cut_edu 调用失败：${(err as Error).message}`);
      throw new ServiceUnavailableException('无法连接百度 OCR 识别服务，请稍后重试');
    }

    if (data.error_code) {
      // 常见：111/110 无权限/失效；18 QPS 超限；17 日配额耗尽
      this.logger.error(`百度 OCR 错误 code=${data.error_code} msg=${data.error_msg}`);
      throw new BadRequestException(`百度 OCR 识别失败：[${data.error_code}] ${data.error_msg}`);
    }

    if (!Array.isArray(data.words_result)) {
      throw new BadRequestException('OCR 未返回识别结果，请更换更清晰的图片重试');
    }

    return data.words_result;
  }

  /** 从 dataUrl / base64 中提取纯 base64 字符串 */
  private extractBase64(dto: PaperCutRequestDto): string {
    if (dto.base64) return dto.base64;
    if (dto.dataUrl) {
      const match = /^data:[^;]+;base64,(.+)$/i.exec(dto.dataUrl);
      if (match) return match[1];
    }
    throw new BadRequestException('缺少图片内容，请提供 base64、dataUrl 或 url');
  }
}

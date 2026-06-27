import { request } from './client';

/** OCR 服务状态（多 provider） */
export type OcrStatus = {
  providers: {
    baidu: { configured: boolean };
    paddle: { configured: boolean };
  };
  activeProvider: 'baidu' | 'paddle' | null;
  configured: boolean;
};

/** 单次识别请求体（百度 paper_cut） */
export type PaperCutRequest = {
  base64?: string;
  dataUrl?: string;
  url?: string;
  pdfPage?: string;
};

/** 单次识别响应 */
export type PaperCutResponse = {
  drafts: any[];
  count: number;
  provider: 'baidu';
};

/** PaddleOCR 提交请求体 */
export type PaddleSubmitRequest = {
  base64?: string;
  dataUrl?: string;
  url?: string;
  fileName?: string;
};

/** PaddleOCR 提交响应 */
export type PaddleSubmitResponse = {
  jobId: string;
  provider: 'paddle';
};

/** PaddleOCR job 状态 */
export type PaddleJobStatus = {
  jobId: string;
  state: 'pending' | 'running' | 'done' | 'failed';
  provider: 'paddle';
  progress?: { total: number; done: number };
  drafts?: any[];
  count?: number;
  error?: string;
};

/** PaddleOCR 同步识别响应 */
export type PaddleRecognizeResponse = {
  drafts: any[];
  count: number;
  provider: 'paddle';
};

export async function getOcrStatus() {
  return request<OcrStatus>('/admin/ocr/status');
}

/** 百度 paper_cut 同步识别 */
export async function paperCut(body: PaperCutRequest) {
  return request<PaperCutResponse>('/admin/ocr/paper-cut', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
}

/** PaddleOCR 提交 job（异步） */
export async function paddleSubmit(body: PaddleSubmitRequest) {
  return request<PaddleSubmitResponse>('/admin/ocr/paddle/submit', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
}

/** PaddleOCR 查询 job 状态 */
export async function paddleStatus(jobId: string) {
  return request<PaddleJobStatus>(`/admin/ocr/paddle/status/${encodeURIComponent(jobId)}`);
}

/** PaddleOCR 同步识别（提交 + 轮询，超时由后端控制） */
export async function paddleRecognize(body: PaddleSubmitRequest, timeoutMs = 120_000) {
  return request<PaddleRecognizeResponse>(`/admin/ocr/paddle/recognize?timeout=${Math.round(timeoutMs / 1000)}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
}

function fileToDataUrl(file: File) {
  return new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result ?? ''));
    reader.onerror = () => reject(reader.error ?? new Error('读取图片失败'));
    reader.readAsDataURL(file);
  });
}

/** 把多个 File 依次转 data URL */
export async function filesToDataUrls(files: File[]): Promise<Array<{ file: File; dataUrl: string }>> {
  const out: Array<{ file: File; dataUrl: string }> = [];
  for (const file of files) {
    const dataUrl = await fileToDataUrl(file);
    out.push({ file, dataUrl });
  }
  return out;
}

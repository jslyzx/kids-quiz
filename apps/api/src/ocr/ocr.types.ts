/**
 * 百度智能云「试卷切题识别」API 类型定义
 *
 * API 文档：
 *   - 鉴权（获取 access_token）：https://ai.baidu.com/ai-doc/REFERENCE/Ck3dwjhhu
 *   - 试卷切题识别 paper_cut_edu：https://ai.baidu.com/ai-doc/OCR/akbayg3he
 *
 * 每日免费额度：5000 页/天（QPS 2）。
 */

/** 题目类型（百度 paper_cut_edu 返回的 qus_type） */
export const BAIDU_QUS_TYPE = {
  CHOICE: 0, // 选择题
  JUDGE: 1, // 判断题
  FILL: 2, // 填空题
  QA: 3, // 问答题/解答题
} as const;

/** 题目元素文本（百度返回结构） */
export type BaiduElemText = {
  /** 题干文本（可能含 #题号占位#） */
  stem_text?: string;
  /** 选项文本数组（选择/判断） */
  option_text?: string[];
  /** 参考答案文本 */
  answer_text?: string;
};

/** 单道题的识别结果 */
export type BaiduQusItem = {
  /** 题型：0 选择 / 1 判断 / 2 填空 / 3 问答 */
  qus_type?: number;
  /** 元素文本 */
  elem_text?: BaiduElemText;
  /** 子题列表（复合题） */
  sub_qus_result?: BaiduQusItem[];
  /** 切分后的元素（部分情况） */
  elem_result?: Array<{ elem_type?: number; elem_text?: BaiduElemText }>;
};

/** 百度 paper_cut_edu 响应体 */
export type BaiduPaperCutResponse = {
  error_code?: number;
  error_msg?: string;
  /** 题目识别结果数组 */
  words_result?: Array<{ qus_result?: BaiduQusItem[] }>;
  /** 识别页数（PDF 时 >1） */
  pdf_result?: unknown;
  log_id?: number;
  /** 已用量、余量 */
  words_result_num?: number;
};

/** 请求体 */
export type PaperCutRequestDto = {
  /** base64 图片（不含 data: 前缀） */
  base64?: string;
  /** 完整 data URL（data:image/...;base64,...） */
  dataUrl?: string;
  /** 已上传图片的 URL（二选一） */
  url?: string;
  /** PDF 的页码（仅 url+pdf 有效），如 "1-3" */
  pdfPage?: string;
};

/** access_token 响应 */
export type BaiduTokenResponse = {
  access_token?: string;
  expires_in?: number;
  error?: string;
  error_description?: string;
};

// ============================================================
// PaddleOCR-VL（AI Studio）类型定义
// ============================================================

/** PaddleOCR-VL 异步 job 提交响应 */
export type PaddleJobSubmitResponse = {
  code?: number;
  msg?: string;
  data?: {
    jobId?: string;
    [key: string]: unknown;
  };
};

/** PaddleOCR-VL job 状态响应 */
export type PaddleJobStatusResponse = {
  code?: number;
  msg?: string;
  data?: {
    state?: 'pending' | 'running' | 'done' | 'failed';
    errorMsg?: string;
    extractProgress?: {
      totalPages?: number;
      extractedPages?: number;
      startTime?: string;
      endTime?: string;
    };
    resultUrl?: {
      jsonUrl?: string;
      mdUrl?: string;
      [key: string]: unknown;
    };
    [key: string]: unknown;
  };
};

/** JSONL 里单行（每页一条）的结构 */
export type PaddleJsonlLine = {
  result?: {
    layoutParsingResults?: Array<{
      markdown?: {
        text?: string;
        images?: Record<string, string>;
      };
      // 旧版本字段名兼容
      markdown_texts?: string;
      markdown_images?: Record<string, string>;
      parsingResList?: Array<{
        label?: string;
        text?: string;
        bbox?: number[];
      }>;
    }>;
    [key: string]: unknown;
  };
  [key: string]: unknown;
};

/** 提交 paddle job 的请求体 */
export type PaddleSubmitDto = {
  /** base64 图片（不含 data: 前缀） */
  base64?: string;
  /** 完整 data URL */
  dataUrl?: string;
  /** 图片/PDF 的 URL */
  url?: string;
  /** 文件名（仅用于日志） */
  fileName?: string;
};


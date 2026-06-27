/**
 * OCR 文本处理共享工具
 * 百度 paper_cut_edu 与 PaddleOCR-VL 两个 provider 共用。
 *
 * 产出形状匹配 QuestionJsonImportPage.normalizeImportedItem 的「OCR 友好草稿」约定：
 *   { type: 'question', title, question: { question_type, stem, options?, answer?, explanation? } }
 * 前端会再跑一遍 normalizeImportedItem / validateQuestion 做完整校验与归一化。
 */

/** 清理 OCR 文本：去多余空白、全角空格、首尾标点空格 */
export function cleanText(value: unknown): string {
  return String(value ?? '')
    .replace(/\u3000/g, ' ')
    .replace(/[ \t]+/g, ' ')
    .replace(/\r\n/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

/** 把全角字母 Ａ-Ｚ / ａ-ｚ 转为半角 */
export function toHalfWidthLetter(ch: string): string {
  const code = ch.charCodeAt(0);
  if (code >= 0xff21 && code <= 0xff3a) return String.fromCharCode(code - 0xfee0); // Ａ-Ｚ
  if (code >= 0xff41 && code <= 0xff5a) return String.fromCharCode(code - 0xfee0); // ａ-ｚ
  return ch;
}

/** 拆分选项文本。输入形如 ["A.xxx","B.yyy"] 或 ["A、xxx","B、yyy"] */
export function parseOptions(optionTexts: Array<string | undefined> | undefined) {
  if (!Array.isArray(optionTexts) || !optionTexts.length) return [];
  return optionTexts.map((raw, index) => {
    const text = cleanText(raw);
    if (!text) return null;
    // 匹配 "A.xxx" / "A、xxx" / "A) xxx" / "A:xxx" / "（A）xxx"
    const match = text.match(/^[(（]?\s*([A-Za-zＡ-Ｚａ-ｚ])\s*[.、):：）)]\s*(.+)$/);
    if (match) return { key: toHalfWidthLetter(match[1]).toUpperCase(), text: match[2].trim() };
    return { key: String.fromCharCode(65 + index), text };
  }).filter((option): option is { key: string; text: string } => Boolean(option && option.text));
}

/** 从答案文本中提取选项字母（如 "B" / "AB" / "A,C"） */
export function extractChoiceKeys(answerText: string): string[] {
  const cleaned = cleanText(answerText);
  if (!cleaned) return [];
  // 纯字母组合："A" / "AB" / "A,B,C" / "A、B"
  const letters = cleaned.match(/[A-Za-z]/g);
  if (letters && letters.length && /^[A-Za-z,，、\s]+$/.test(cleaned)) {
    return Array.from(new Set(letters.map((l) => l.toUpperCase())));
  }
  return [];
}

/** 判断题答案：T/对/正确/√ → T；F/错/错误/× → F */
export function parseJudgeAnswer(answerText: string): string | null {
  const cleaned = cleanText(answerText);
  if (!cleaned) return null;
  if (/^(t|y|对|是|正确|√|✓|对的|对的)$/i.test(cleaned)) return 'T';
  if (/^(f|n|错|否|错误|×|✗|错的|错的)$/i.test(cleaned)) return 'F';
  // 单个字母
  const letter = cleaned.match(/^[A-Za-z]$/);
  if (letter) {
    const upper = letter[0].toUpperCase();
    if (upper === 'T' || upper === 'A') return 'T';
    if (upper === 'F' || upper === 'B') return 'F';
  }
  return null;
}

/** 把题干中的下划线/横线/圆圈占位转换为 {{blank:n}} */
export function injectBlankPlaceholders(stem: string, blankCount: number): string {
  let text = cleanText(stem);
  // 已有的 {{blank:n}} 直接复用
  const existing = (text.match(/\{\{blank(?::\d+)?\}\}/g) || []).length;
  const need = Math.max(0, blankCount - existing);
  if (need > 0) {
    // 替换连续下划线/横线/圆圈为占位
    let replaced = 0;
    text = text.replace(/_{2,}|○+|〇+|__+/g, (match) => {
      if (replaced >= need) return match;
      replaced += 1;
      return `{{blank:${existing + replaced}}}`;
    });
    // 若替换不足，追加到末尾
    while (replaced < need) {
      replaced += 1;
      text += ` {{blank:${existing + replaced}}}`;
    }
  }
  return text;
}

/** 生成标题：取题干前 N 字，去掉 blank/math 占位 */
export function makeTitle(stem: string, max = 40): string {
  const text = String(stem ?? '')
    .replace(/\{\{blank(?::[^}]+)?\}\}/g, '____')
    .replace(/\{\{math:(.+?)\}\}/g, '$1')
    .replace(/\s+/g, ' ')
    .trim();
  return (text.length > max ? text.slice(0, max) + '…' : text) || '未命名题目';
}

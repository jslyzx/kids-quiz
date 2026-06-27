import { PaddleJsonlLine } from './ocr.types';
import { cleanText, extractChoiceKeys, injectBlankPlaceholders, makeTitle, parseJudgeAnswer, parseOptions, toHalfWidthLetter } from './ocr-helpers';

/**
 * 把 PaddleOCR-VL 的 markdown 输出解析为题目草稿列表。
 *
 * PaddleOCR-VL 输出整页 markdown（无题目语义），本解析器负责：
 *   1. 清理 LaTeX 公式（$$ 30\times2= $$ → 30×2=）
 *   2. 按行扫描，用 `#`/`##` 标题检测题型分区
 *   3. 识别「计算题块」：连续多行算式 → 拆为 calculation_group
 *   4. 用 `^\s*(\d+)\s*[.、．)]` 切分题目边界
 *   5. 每个题目块内：提取选项、判断题型、提取答案
 *
 * 注意：OCR 结果不会 100% 规整，解析出的草稿全部走前端 validateQuestion + 人工校对。
 */

type QuestionTypeHint = 'choice' | 'fill' | 'judge' | 'qa' | 'calc' | null;

// ============================================================
// LaTeX / 公式预处理
// ============================================================

/** LaTeX 运算符映射回普通文本符号 */
const LATEX_OP_MAP: Array<[RegExp, string]> = [
  [/\\times/g, '×'],
  [/\\div/g, '÷'],
  [/\\cdot/g, '·'],
  [/\\pm/g, '±'],
  [/\\mp/g, '∓'],
  [/\\le/g, '≤'],
  [/\\ge/g, '≥'],
  [/\\ne/g, '≠'],
  [/\\approx/g, '≈'],
  [/\\sqrt\s*\{([^}]*)\}/g, '√($1)'],
  [/\\frac\s*\{([^}]*)\}\s*\{([^}]*)\}/g, '($1)/($2)'],
  [/\\\^?\{?\\circ\}?/g, '°'], // ^\circ → °
  [/\\,/g, ''],
  [/\\;/g, ''],
  [/\\ /g, ''],
  [/\\\(/g, ''],
  [/\\\)/g, ''],
];

/** 把 LaTeX 公式标记 $...$ 和 $...$ 清理成纯文本算式 */
function stripLatex(text: string): string {
  let out = text;
  // 先处理块级 $...$
  out = out.replace(/\$\$([^$]*)\$\$/g, (_m, inner) => cleanLatexInner(inner));
  // 再处理行内 $...$
  out = out.replace(/\$([^$\n]+)\$/g, (_m, inner) => cleanLatexInner(inner));
  // OCR 常把减号 - 识别成破折号 —，以及把 × 识别成字母 x：统一还原
  out = out.replace(/—/g, '-').replace(/–/g, '-');
  return out;
}

/** 试卷表头关键词：这些行是「姓名/班级/学号/得分」等表头，不是题目 */
const HEADER_KEYWORDS = /^(姓名|班级|学号|学校|考场|座号|得分|总分|评卷人|日期|年级|科目|分数)\s*[：:_]/;

/** 判断一行是否是试卷表头（应忽略，不生成题目） */
function isPaperHeader(line: string): boolean {
  return HEADER_KEYWORDS.test(line.trim());
}

/** 清理 LaTeX 内部：运算符转普通符号，去掉多余空格 */
function cleanLatexInner(inner: string): string {
  let s = String(inner ?? '');
  for (const [re, replacement] of LATEX_OP_MAP) {
    s = s.replace(re, replacement);
  }
  // 去掉剩余的反斜杠命令（如 \quad \text 等）保留参数
  s = s.replace(/\\(?:quad|text|mathrm|mathbf|left|right|,|;)\b/g, ' ');
  s = s.replace(/[{}]/g, '');
  s = s.replace(/\s+/g, ' ').trim();
  return s;
}

// ============================================================
// 计算题识别
// ============================================================

/**
 * 判断一行是否是「算式行」：含 = 且左边是数字/运算符组合。
 * 例如 "30×2=" "64÷2=" "500-200=" "☆353+258=" 都算。
 */
function isCalculationLine(line: string): boolean {
  const s = line.trim();
  if (!s) return false;
  // 过短或明显是普通文字（含汉字超过 4 个）不算算式
  const cjkCount = (s.match(/[\u4e00-\u9fff]/g) || []).length;
  if (cjkCount > 4) return false;
  // 必须含 = 且以数字/☆/括号开头，中间含运算符
  if (!/=/.test(s)) return false;
  if (!/^[☆★(（\d]/.test(s)) return false;
  // 含运算符 ×÷+-×÷ 或 LaTeX 清理后的
  if (!/[×÷+\-]/.test(s) && !/\*/.test(s) && !/\//.test(s)) return false;
  return true;
}

/** 从算式行提取 { stem, answer }。answer 为空字符串表示未给出答案。 */
function parseCalculationItem(line: string): { stem: string; answer: string } | null {
  const s = line.trim();
  if (!isCalculationLine(s)) return null;
  // 匹配 "左边=右边" 或 "左边=" （没给答案）
  const m = s.match(/^(.+?)\s*=\s*(.*)$/);
  if (!m) return { stem: s, answer: '' };
  const stem = m[1].trim();
  const answer = m[2].trim();
  return { stem, answer };
}

// ============================================================
// 题型分区与块分割
// ============================================================

/** 题型分区标题识别 */
function detectTypeHint(heading: string): QuestionTypeHint {
  const text = heading.replace(/^#+\s*/, '');
  if (/选择|单选|多选/.test(text)) return 'choice';
  if (/填空/.test(text)) return 'fill';
  if (/判断/.test(text)) return 'judge';
  if (/计算|算一算|口算|竖式|脱式|估算/.test(text)) return 'calc';
  if (/问答|解答|简答|应用|证明/.test(text)) return 'qa';
  return null;
}

/**
 * 从一行文本里把内联选项拆出来。
 * 例如 "A.4 B.7 C.9 D.15" → ["A.4","B.7","C.9","D.15"]
 */
function splitInlineOptions(line: string): string[] {
  const broken = line.replace(/(?<![A-Za-zＡ-Ｚ])([A-DＡ-Ｄ])(\s*[.、．):：）)])/g, '\n$1$2');
  return broken.split('\n').map((s) => s.trim()).filter(Boolean);
}

/** 判断某行是否是选项行 */
function isOptionLine(line: string): boolean {
  return /^[(（]?\s*[A-DＡ-Ｄ]\s*[.、．):：）)]/.test(line.trim());
}

/** 判断某行是否是答案行 */
function extractAnswerFromLine(line: string): { number?: number; answer: string } | null {
  const withNum = line.match(/^(?:参考)?答案[:：]\s*(\d+)\s*[.、．]:[：]?\s*([^\n]*)$/);
  if (withNum) return { number: Number(withNum[1]), answer: cleanText(withNum[2]) };
  const noNum = line.match(/^(?:参考)?答案[:：]\s*([^\n]+)$/);
  if (noNum) return { answer: cleanText(noNum[1]) };
  return null;
}

/** 从题干块里分离出「题干行」「选项行」「答案行」 */
function segmentBlock(lines: string[]): {
  stemLines: string[];
  optionLines: string[];
  answerText: string;
  inlineAnswer: string | null;
  calcLines: string[];
} {
  const stemLines: string[] = [];
  const optionLines: string[] = [];
  const calcLines: string[] = [];
  let answerText = '';
  let inlineAnswer: string | null = null;

  for (const rawLine of lines) {
    const line = rawLine.trim();
    if (!line) continue;

    const ans = extractAnswerFromLine(line);
    if (ans) {
      if (ans.answer) answerText = answerText ? `${answerText} ${ans.answer}` : ans.answer;
      continue;
    }
    // 括号内的答案：题干末尾 "( B )" / "（对）"（仅当没有选项行、且不是子题 (1)(2) 编号时）
    const inlineMatch = line.match(/[（(]\s*([A-DＡ-Ｚ对错正误TFtf√×✓✗])\s*[)）]\s*$/);
    const hasSubNum = /^\(?[（(]?\s*\d+\s*[)）]\s*[^\n]*[（(]\s*[A-DＡ-Ｚ对错正误TFtf√×✓✗]\s*[)）]\s*$/.test(line);
    if (inlineMatch && optionLines.length === 0 && !isOptionLine(line) && !hasSubNum) {
      inlineAnswer = inlineMatch[1];
      stemLines.push(line.replace(/[（(]\s*[A-DＡ-Ｚ对错正误TFtf√×✓✗]\s*[)）]\s*$/, '（  ）'));
      continue;
    }

    if (isOptionLine(line)) {
      const inlineCount = (line.match(/[A-DＡ-Ｄ]\s*[.、．):：）)]/g) || []).length;
      if (inlineCount > 1) {
        optionLines.push(...splitInlineOptions(line));
      } else {
        optionLines.push(line);
      }
      continue;
    }

    // 算式行单独收集
    if (isCalculationLine(line)) {
      calcLines.push(line);
      continue;
    }

    stemLines.push(line);
  }

  return { stemLines, optionLines, answerText, inlineAnswer, calcLines };
}

/** 把单个题目块转换为 question 草稿 */
function parseQuestionBlock(
  stemLines: string[],
  optionLines: string[],
  answerText: string,
  inlineAnswer: string | null,
  typeHint: QuestionTypeHint,
  index: number,
): any | null {
  const stem = cleanText(stemLines.join('\n'));
  const options = parseOptions(optionLines);
  if (!stem && !options.length && !answerText) return null;

  // 1) 有选项 → 选择题
  if (options.length >= 2 || typeHint === 'choice') {
    const keys = extractChoiceKeys(answerText) || extractChoiceKeys(inlineAnswer ?? '');
    return {
      question_type: 'single_choice',
      stem: stem || `（第 ${index + 1} 题）`,
      options,
      answer: keys.length ? keys : (options[0]?.key ?? 'A'),
      ...(answerText ? { explanation: `参考答案：${answerText}` } : {}),
    };
  }

  // 2) 判断题：题干里有 （ ）空括号 或 答案是对/错（排除有子题编号的情况）
  const hasSubQuestionNum = /\(?\s*\d+\s*[)）][\s\S]*[（(]\s*\d+\s*[)）]/.test(stem);
  const judgeAnswer = parseJudgeAnswer(answerText) || parseJudgeAnswer(inlineAnswer ?? '');
  // 只在末尾有单个空括号、且没有子题编号时才判为判断题
  const hasSingleJudgeBracket = /[（(]\s{0,3}[)）]\s*$/.test(stem) && !hasSubQuestionNum;
  if (typeHint === 'judge' || ((judgeAnswer || hasSingleJudgeBracket) && !typeHint)) {
    return {
      question_type: 'true_false',
      stem: stem.replace(/[（(]\s{0,3}[)）]/g, '（  ）') || `（第 ${index + 1} 题）`,
      answer: judgeAnswer ?? 'T',
      ...(answerText ? { explanation: `参考答案：${answerText}` } : {}),
    };
  }

  // 3) 填空题：题干里有 ____/（）/○，或答案是数值/短文本
  //    含子题编号 (1)(2)(3) 的一律是填空
  const hasBlank = /_{2,}|○{2,}|〇{2,}/.test(stem);
  const hasBracketBlank = /[（(]\s{0,3}[)）]/.test(stem);
  const answers = answerText
    .split(/[；;\n，,]/)
    .map((s) => cleanText(s).replace(/^(答案[:：]?|空\s*\d+[:：])\s*/i, ''))
    .filter(Boolean);
  if (typeHint === 'fill' || hasBlank || hasBracketBlank || answers.length >= 1) {
    let stemNormalized = stem;
    // 半角括号 () 和全角空括号 （） 都转 {{blank:n}}
    const blankCount = Math.max(
      1,
      answers.length,
      hasBlank ? (stem.match(/_{2,}|○{2,}|〇{2,}/g) || []).length : 0,
      hasBracketBlank ? (stem.match(/[（(]\s{0,3}[)）]/g) || []).length : 0,
    );
    // 先把 () 和 （） 替换为 ____ 再走 injectBlankPlaceholders
    if (hasBracketBlank) {
      stemNormalized = stemNormalized.replace(/[（(]\s{0,3}[)）]/g, '____');
    }
    stemNormalized = injectBlankPlaceholders(stemNormalized, blankCount);
    return {
      question_type: 'fill_blank',
      stem: stemNormalized || `（第 ${index + 1} 题）`,
      answer: answers.length ? answers : [answerText || '（请填写答案）'],
      ...(answerText ? { explanation: `参考答案：${answerText}` } : {}),
    };
  }

  // 4) 问答/计算：当作主观填空，待人工调整
  return {
    question_type: 'fill_blank',
    stem: injectBlankPlaceholders(stem || `（第 ${index + 1} 题）`, 1),
    answer: [answerText || '（请填写参考答案）'],
    ...(answerText ? { explanation: `参考答案：${answerText}` } : {}),
  };
}

// ============================================================
// 主解析流程
// ============================================================

/**
 * 解析单页 markdown 为草稿列表。
 * 输出两种 draft：
 *   - { type: 'question', title, question }：常规单题
 *   - { type: 'calculation_group', title, items: [{stem, answer}] }：口算/计算题组
 */
export function markdownToDrafts(markdown: string): any[] {
  if (!markdown || !markdown.trim()) return [];

  // 1) 先做 LaTeX 清理
  const cleaned = stripLatex(markdown);
  const lines = cleaned.split(/\r?\n/);

  const drafts: any[] = [];
  let currentTypeHint: QuestionTypeHint = null;

  // 当前正在收集的「常规题块」
  let curBlockLines: string[] | null = null;
  // 当前正在收集的「算式行」
  let curCalcLines: string[] = [];

  /** 把当前常规题块收尾成一个 draft */
  function flushBlock() {
    if (!curBlockLines || curBlockLines.length === 0) {
      curBlockLines = null;
      return;
    }
    const { stemLines, optionLines, answerText, inlineAnswer, calcLines } = segmentBlock(curBlockLines);
    // 块内若混入了算式行（且有 2 个以上），单独作为计算组
    if (calcLines.length >= 2) {
      const items = calcLines.map(parseCalculationItem).filter(Boolean) as Array<{ stem: string; answer: string }>;
      if (items.length) {
        drafts.push({
          type: 'calculation_group',
          title: stemLines.length ? makeTitle(stemLines.join(' ')) : '计算题',
          items,
        });
      }
    }
    const question = parseQuestionBlock(stemLines, optionLines, answerText, inlineAnswer, currentTypeHint, drafts.length);
    if (question) {
      drafts.push({
        type: 'question',
        title: makeTitle(question.stem) || `题目 ${drafts.length + 1}`,
        question,
      });
    }
    curBlockLines = null;
  }

  /** 待用的计算组标题（来自计算题前的说明文字） */
  let pendingCalcTitle: string | null = null;

  /** 把当前算式行收集收尾成一个 calculation_group draft */
  function flushCalc() {
    if (curCalcLines.length === 0) return;
    const items = curCalcLines.map(parseCalculationItem).filter(Boolean) as Array<{ stem: string; answer: string }>;
    if (items.length >= 1) {
      const title = pendingCalcTitle || (drafts.some((d) => d.type === 'calculation_group') ? '计算题' : '口算题');
      drafts.push({ type: 'calculation_group', title, items });
    }
    curCalcLines = [];
    pendingCalcTitle = null;
  }

  const numberRegex = /^(\d{1,3})\s*[.、．)）:：]\s*(.+)$/;

  for (const rawLine of lines) {
    const line = rawLine.replace(/\s+$/, '').trim();
    if (!line) {
      // 空行：不强制断开（题块可能跨空行）
      continue;
    }

    // 标题行 → 更新题型提示，并断开当前块
    const heading = line.match(/^(#{1,6})\s+(.+)$/);
    if (heading) {
      flushBlock();
      flushCalc();
      const hint = detectTypeHint(heading[2]);
      if (hint) currentTypeHint = hint;
      continue;
    }

    // 试卷表头（姓名/班级/学号等）→ 直接忽略，断开当前块
    if (isPaperHeader(line)) {
      flushBlock();
      flushCalc();
      continue;
    }

    const numMatch = line.match(numberRegex);
    const looksLikeQuestion = (() => {
      if (!numMatch) return false;
      const num = numMatch[1];
      const rest = numMatch[2];
      if (num.length >= 4) return false;
      const sep = line.slice(num.length, num.length + 1);
      const afterSep = line.slice(num.length + 1);
      if ((sep === '.' || sep === '．' || sep === ',') && /^\d/.test(rest) && !/^\s/.test(afterSep)) return false;
      return true;
    })();

    if (looksLikeQuestion && numMatch) {
      // 新题号 → 断开当前块和算式收集
      flushBlock();
      // 题号行本身可能是「计算题大题」的开始（如 "1. 直接写出得数"），之后跟着算式
      // 这里把题号后的内容作为新块的第一行
      flushCalc(); // 算式跨大题界限就断开
      curBlockLines = [numMatch[2]];
    } else {
      // 非题号行：判断是算式还是普通文本
      if (isCalculationLine(line)) {
        // 如果当前有简短的说明块（说明这是一组计算题的题头）
        if (curBlockLines && curBlockLines.length <= 2 && currentTypeHint === 'calc') {
          flushCalc();
          pendingCalcTitle = cleanText(curBlockLines.join(' ')).slice(0, 30) || '计算题';
          curBlockLines = null;
          curCalcLines.push(line);
        } else {
          curCalcLines.push(line);
        }
      } else {
        // 普通文本行
        // 如果正在收集算式，且这一行是新的说明（含较多汉字），先 flush 算式
        if (curCalcLines.length > 0 && /[\u4e00-\u9fff]/.test(line)) {
          flushCalc();
        }
        if (!curBlockLines) curBlockLines = [];
        curBlockLines.push(line);
      }
    }
  }
  flushBlock();
  flushCalc();

  return drafts;
}

/**
 * 把 PaddleOCR JSONL 结果（多页）合并为草稿列表
 */
export function paddleJsonlToDrafts(jsonlLines: PaddleJsonlLine[]): any[] {
  const allMarkdown: string[] = [];
  for (const line of jsonlLines) {
    const pages = line?.result?.layoutParsingResults ?? [];
    for (const page of pages) {
      const md = page?.markdown?.text ?? (page as any)?.markdown_texts ?? '';
      if (md) allMarkdown.push(md);
    }
  }
  if (!allMarkdown.length) return [];
  return markdownToDrafts(allMarkdown.join('\n\n'));
}

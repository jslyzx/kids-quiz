/**
 * 算式求值器：把 "30×2="、"657+68+197="、"☆353+258=" 这类口算/计算题题干
 * 求出答案。仅支持四则运算（+ - × ÷）和括号，不含任何变量或函数。
 *
 * 安全性：用白名单字符校验 + 手写 tokenizer/parser，绝不调用 eval。
 */

/** 清理题干：去掉 ☆★ 验算标记、= 及其后内容、全角符号、空白 */
function normalizeStem(stem: string): string {
  let s = String(stem ?? '')
    .replace(/[☆★]\s*/g, '')        // 去掉验算标记
    .replace(/[（(]/g, '(')
    .replace(/[）)]/g, ')')
    .replace(/[×xｘ]/gi, '*')        // 乘号 × 和字母 x → *
    .replace(/[÷]/g, '/')            // 除号 ÷ → /
    .replace(/[＋]/g, '+')
    .replace(/[－−—–]/g, '-')        // 各种减号/破折号 → -
    .replace(/[=＝]/g, '=')          // 等号统一
    .replace(/\s+/g, '');            // 去空白

  // 截到第一个 =（只算等号左边）
  const eqIdx = s.indexOf('=');
  if (eqIdx >= 0) s = s.slice(0, eqIdx);
  return s;
}

const ALLOWED_CHARS = /^[0-9+\-*/().\s]+$/;

type Token = { type: 'num'; value: number } | { type: 'op'; value: string } | { type: 'lp' } | { type: 'rp' };

/** 词法分析：把字符串切成 token 流 */
function tokenize(expr: string): Token[] | null {
  const tokens: Token[] = [];
  let i = 0;
  while (i < expr.length) {
    const ch = expr[i];
    if (ch === ' ' || ch === '\t') { i += 1; continue; }
    if (ch === '(') { tokens.push({ type: 'lp' }); i += 1; continue; }
    if (ch === ')') { tokens.push({ type: 'rp' }); i += 1; continue; }
    if (ch === '+' || ch === '-' || ch === '*' || ch === '/') {
      tokens.push({ type: 'op', value: ch }); i += 1; continue;
    }
    // 数字（含小数）
    if (/[0-9.]/.test(ch)) {
      let numStr = '';
      while (i < expr.length && /[0-9.]/.test(expr[i])) { numStr += expr[i]; i += 1; }
      const num = Number(numStr);
      if (Number.isNaN(num)) return null;
      tokens.push({ type: 'num', value: num });
      continue;
    }
    // 未知字符
    return null;
  }
  return tokens;
}

/** 递归下降解析器。文法：
 *   expr   := term (('+'|'-') term)*
 *   term   := factor (('*'|'/') factor)*
 *   factor := number | '(' expr ')' | '-' factor   (一元负号)
 */
class Parser {
  private pos = 0;
  constructor(private tokens: Token[]) {}

  private peek(): Token | undefined { return this.tokens[this.pos]; }
  private next(): Token | undefined { return this.tokens[this.pos++]; }

  parseExpr(): number | null {
    let left = this.parseTerm();
    if (left === null) return null;
    while (true) {
      const tok = this.peek();
      if (tok && tok.type === 'op' && (tok.value === '+' || tok.value === '-')) {
        this.next();
        const right = this.parseTerm();
        if (right === null) return null;
        left = tok.value === '+' ? left + right : left - right;
      } else break;
    }
    return left;
  }

  private parseTerm(): number | null {
    let left = this.parseFactor();
    if (left === null) return null;
    while (true) {
      const tok = this.peek();
      if (tok && tok.type === 'op' && (tok.value === '*' || tok.value === '/')) {
        this.next();
        const right = this.parseFactor();
        if (right === null) return null;
        if (tok.value === '/') {
          if (right === 0) return null; // 除零
          // 小学除法：能整除显示整数，否则保留 2 位小数
          const quotient: number = left / right;
          left = Math.abs(quotient - Math.round(quotient)) < 1e-9 ? Math.round(quotient) : Number(quotient.toFixed(2));
        } else {
          left = left * right;
        }
      } else break;
    }
    return left;
  }

  private parseFactor(): number | null {
    const tok = this.peek();
    if (!tok) return null;
    if (tok.type === 'num') { this.next(); return tok.value; }
    if (tok.type === 'lp') {
      this.next();
      const val = this.parseExpr();
      if (val === null) return null;
      const rp = this.next();
      if (!rp || rp.type !== 'rp') return null; // 缺右括号
      return val;
    }
    if (tok.type === 'op' && tok.value === '-') {
      // 一元负号：-5
      this.next();
      const val = this.parseFactor();
      return val === null ? null : -val;
    }
    return null;
  }

  fullyParsed(): boolean { return this.pos === this.tokens.length; }
}

/** 格式化结果：整数去小数点，负数保留 */
function formatResult(value: number): string {
  if (Number.isNaN(value)) return '';
  // 整数
  if (Number.isInteger(value)) return String(value);
  // 最多 2 位小数，去尾零
  return String(Number(value.toFixed(2)));
}

/**
 * 求一个算式题干的答案。
 * @param stem 形如 "30×2="、"657+68+197="、"☆353+258="
 * @returns 答案字符串（如 "60"），无法计算返回空字符串 ""
 */
export function solveExpression(stem: string): string {
  const normalized = normalizeStem(stem);
  if (!normalized) return '';
  // 白名单校验（防止任何意料外的字符）
  if (!ALLOWED_CHARS.test(normalized)) return '';
  const tokens = tokenize(normalized);
  if (!tokens || tokens.length === 0) return '';
  const parser = new Parser(tokens);
  const result = parser.parseExpr();
  if (result === null || !Number.isFinite(result) || !parser.fullyParsed()) return '';
  return formatResult(result);
}

/**
 * 批量为计算题组的 items 填充答案。
 * @param items [{ stem, answer }]
 * @returns 已填充答案的新数组 + 统计信息
 */
export function fillCalculationAnswers(items: Array<{ stem: string; answer?: string | number }>): {
  items: Array<{ stem: string; answer: string }>;
  solved: number;
  failed: number;
  failedStems: string[];
} {
  let solved = 0;
  let failed = 0;
  const failedStems: string[] = [];
  const result = items.map((item) => {
    const ans = solveExpression(item.stem);
    if (ans) {
      solved += 1;
      return { stem: item.stem, answer: ans };
    }
    failed += 1;
    failedStems.push(item.stem);
    return { stem: item.stem, answer: String(item.answer ?? '') };
  });
  return { items: result, solved, failed, failedStems };
}

import type { ColumnArithmeticContent, ColumnArithmeticRow, QuestionDraft } from '@kids-quiz/shared-types';

export type AnswerLookup = (slotKey: string) => unknown;

function normalize(value: unknown) {
  return String(value ?? '').trim();
}

function slotKeysFromRows(rows: ColumnArithmeticRow[]) {
  return rows.flatMap((row) => row.cells).flatMap((cell) => cell?.slot ? [cell.slot] : []);
}

export function getColumnArithmetic(question: QuestionDraft): ColumnArithmeticContent | null {
  const config = question.content?.columnArithmetic;
  if (!config || typeof config !== 'object') return null;
  const rows = (config as ColumnArithmeticContent).rows;
  if (!Array.isArray(rows) || !rows.length) return null;
  return config as ColumnArithmeticContent;
}

export function getColumnArithmeticSlotKeys(question: QuestionDraft) {
  const config = getColumnArithmetic(question);
  if (!config) return [];
  return Array.from(new Set([
    ...slotKeysFromRows(config.carryRows ?? []),
    ...slotKeysFromRows(config.rows ?? []),
    ...((config.validation?.operands ?? []).flat()),
    ...(config.validation?.result ?? []),
  ].filter((key) => question.answer_slots.some((slot) => slot.slot_key === key))));
}

function tokenValue(token: string, lookup: AnswerLookup) {
  const value = normalize(lookup(token));
  return value || token;
}

function digitsToNumber(tokens: string[] | undefined, lookup: AnswerLookup) {
  const text = (tokens ?? []).map((token) => tokenValue(token, lookup)).join('');
  if (!/^\d+$/.test(text)) return null;
  return Number(text);
}

function operationFromConfig(config: ColumnArithmeticContent) {
  if (config.operation) return config.operation;
  const operator = config.rows.find((row) => row.operator)?.operator;
  if (operator === '-') return 'subtraction';
  if (operator === 'x' || operator === '×' || operator === '*') return 'multiplication';
  return 'addition';
}

function deriveValidation(config: ColumnArithmeticContent) {
  const operands = config.rows
    .filter((row) => row.role !== 'result' && row.role !== 'carry' && row.role !== 'borrow')
    .map((row) => row.cells.map((cell) => cell?.slot ?? cell?.text ?? '').filter(Boolean));
  const resultRow = config.rows.find((row) => row.role === 'result') ?? config.rows[config.rows.length - 1];
  const result = resultRow?.cells.map((cell) => cell?.slot ?? cell?.text ?? '').filter(Boolean) ?? [];
  return { operands, result };
}

export function evaluateColumnArithmetic(question: QuestionDraft, lookup: AnswerLookup) {
  const config = getColumnArithmetic(question);
  if (!config) return { ok: false, reason: '题目缺少 columnArithmetic 配置' };

  const slotKeys = getColumnArithmeticSlotKeys(question);
  const values = slotKeys.map((key) => normalize(lookup(key)));
  if (values.some((value) => !value)) return { ok: false, reason: '还有方框没有填写' };

  const allowedDigits = Array.isArray(config.allowedDigits) ? config.allowedDigits.map(String) : [];
  if (allowedDigits.length) {
    const invalid = values.filter((value) => !allowedDigits.includes(value));
    if (invalid.length) return { ok: false, reason: `只能填写这些数字：${allowedDigits.join('、')}` };
  }

  if (config.uniqueDigits) {
    const unique = new Set(values);
    if (unique.size !== values.length) return { ok: false, reason: '每个数字只能使用一次' };
  }

  const validation = config.validation ?? deriveValidation(config);
  const operands = (validation.operands ?? []).map((tokens) => digitsToNumber(tokens, lookup));
  const result = digitsToNumber(validation.result, lookup);
  if (!operands.length || operands.some((value) => value === null) || result === null) {
    return { ok: false, reason: '竖式里有无法组成数字的位置' };
  }

  const operandValues = operands.filter((value): value is number => value !== null);
  const [first = 0, ...rest] = operandValues;
  const calculated = operationFromConfig(config) === 'subtraction'
    ? rest.reduce((total, value) => total - value, first)
    : operationFromConfig(config) === 'multiplication'
      ? rest.reduce((total, value) => total * value, first)
      : operandValues.reduce((total, value) => total + value, 0);

  return {
    ok: calculated === result,
    reason: calculated === result ? '竖式成立' : '竖式计算结果不成立',
  };
}

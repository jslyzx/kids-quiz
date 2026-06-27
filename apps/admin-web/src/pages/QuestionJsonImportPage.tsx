import { useEffect, useMemo, useState } from 'react';
import { CalculationGroupPreview, CompositePreview, QuestionPreview } from '@kids-quiz/question-render';
import { exportQuestionBank, saveQuestionGroup } from '../api/questionGroups';
import { addPaperQuestionGroup, createPaper } from '../api/papers';
import { createImportBatch, finishImportBatch } from '../api/importBatches';
import { collectMojibakeSnippets } from '../utils/textQuality';
import { mapWithConcurrency } from '../utils/concurrency';
import { useDebouncedValue } from '../utils/useDebouncedValue';
import { useToast } from '../components/ToastProvider';
import { consumeOcrPrefill } from '../components/editors/OcrEntryPanel';
import { fillCalculationAnswers } from '../utils/solveExpression';

const SAMPLE_JSON = `[
  {
    "type": "question",
    "title": "在括号里填合适的数",
    "gradeLevel": "二年级",
    "difficulty": 1,
    "tags": ["数学", "填空题"],
    "question": {
      "question_type": "fill_blank",
      "stem": "1200里面有{{blank:1}}个百，8个千是{{blank:2}}。",
      "answer_slots": [
        { "slot_key": "blank_1", "slot_type": "number", "correct_answer": ["12"] },
        { "slot_key": "blank_2", "slot_type": "number", "correct_answer": ["8000"] }
      ],
      "explanation": "1200里面有12个百，8个千是8000。"
    }
  }
]`;

type ImportItem = {
  index: number;
  original: unknown;
  draft: any;
  errors: string[];
  warnings: string[];
  duplicateGroupIds?: string[];
};

const allowedTypes = new Set(['question', 'calculation_group', 'composite_group']);
const allowedQuestionTypes = new Set(['fill_blank', 'single_choice', 'multiple_choice', 'true_false', 'ordering', 'matching', 'sentence_build', 'word_problem']);

function asArray(value: unknown) {
  return Array.isArray(value) ? value : [value];
}

function downloadJson(filename: string, data: unknown) {
  const blob = new Blob([typeof data === 'string' ? data : JSON.stringify(data, null, 2)], { type: 'application/json;charset=utf-8' });
  downloadBlob(filename, blob);
}

function downloadBlob(filename: string, blob: Blob) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

const EXCEL_TEMPLATE_ROWS = [
  {
    title: '两位数加法填空',
    gradeLevel: '二年级',
    difficulty: 1,
    tags: '数学|填空题',
    question_type: 'fill_blank',
    stem: '36 + 27 = {{blank:1}}',
    answer: '63',
    options: '',
    explanation: '个位 6+7=13，十位进 1。',
  },
  {
    title: '选择正确结果',
    gradeLevel: '二年级',
    difficulty: 1,
    tags: '数学|选择题',
    question_type: 'single_choice',
    stem: '8 x 6 = ?',
    answer: 'B',
    options: 'A=42|B=48|C=54|D=56',
    explanation: '8 个 6 相加是 48。',
  },
];

function normalizeHeader(value: unknown) {
  return String(value ?? '').trim().toLowerCase().replace(/[\s_-]+/g, '');
}

function normalizeRow(row: Record<string, unknown>) {
  const normalized: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(row)) normalized[normalizeHeader(key)] = value;
  return normalized;
}

function readCell(row: Record<string, unknown>, keys: string[]) {
  for (const key of keys) {
    const value = row[normalizeHeader(key)];
    if (value !== undefined && String(value).trim() !== '') return value;
  }
  return '';
}

function splitList(value: unknown) {
  return String(value ?? '')
    .split(/\r?\n|[|,;，；、]/)
    .map((item) => item.trim())
    .filter(Boolean);
}

function parseOptions(value: unknown) {
  return splitList(value).map((item, index) => {
    const match = item.match(/^([^=:：]+)\s*[=:：]\s*(.+)$/);
    if (match) return { key: match[1].trim(), text: match[2].trim() };
    return { key: String.fromCharCode(65 + index), text: item };
  });
}

function excelRowToDraft(source: Record<string, unknown>) {
  const row = normalizeRow(source);
  const questionType = String(readCell(row, ['question_type', 'questionType', '题型']) || 'fill_blank').trim();
  const stem = String(readCell(row, ['stem', '题干', 'question']) ?? '').trim();
  const title = String(readCell(row, ['title', '标题']) || compactText(stem) || 'Excel 导入题目').trim();
  const answers = [
    ...Array.from({ length: 10 }, (_item, index) => readCell(row, [`answer_${index + 1}`, `answer${index + 1}`, `答案${index + 1}`])),
    readCell(row, ['answer', 'answers', '答案']),
  ].flatMap(splitList);
  const options = parseOptions(readCell(row, ['options', '选项']));
  const explanation = String(readCell(row, ['explanation', '解析']) ?? '').trim();

  const draft: any = {
    type: 'question',
    title,
    gradeLevel: String(readCell(row, ['gradeLevel', 'grade', '年级']) ?? '').trim(),
    difficulty: normalizeDifficultyValue(readCell(row, ['difficulty', '难度'])),
    tags: splitList(readCell(row, ['tags', '标签'])),
    question: {
      question_type: questionType,
      stem,
      answer_slots: [{
        slot_key: 'answer',
        slot_type: questionType === 'ordering' ? 'order' : questionType === 'matching' ? 'match' : 'choice',
        correct_answer: answers,
      }],
    },
  };

  if (questionType === 'fill_blank') {
    const keys = blankKeys(normalizeText(stem));
    draft.question.answer_slots = (answers.length ? answers : ['']).map((answer, index) => ({
      slot_key: keys[index] ?? `blank_${index + 1}`,
      slot_type: /^-?\d+(\.\d+)?$/.test(String(answer)) ? 'number' : 'text',
      correct_answer: [answer],
    }));
  }

  if (questionType === 'single_choice' || questionType === 'multiple_choice') {
    draft.question.content = { options };
  }

  if (explanation) {
    draft.question.explanation = explanation;
    draft.question.content = { ...(draft.question.content ?? {}), explanationHtml: explanation, explanationFormat: 'html' };
  }

  return normalizeImportedItem(draft);
}

function parseDelimitedText(text: string) {
  const delimiter = text.includes('\t') ? '\t' : ',';
  const rows: string[][] = [];
  let cell = '';
  let row: string[] = [];
  let quoted = false;

  for (let index = 0; index < text.length; index += 1) {
    const char = text[index];
    const next = text[index + 1];
    if (char === '"' && quoted && next === '"') {
      cell += '"';
      index += 1;
    } else if (char === '"') {
      quoted = !quoted;
    } else if (char === delimiter && !quoted) {
      row.push(cell);
      cell = '';
    } else if ((char === '\n' || char === '\r') && !quoted) {
      if (char === '\r' && next === '\n') index += 1;
      row.push(cell);
      if (row.some((item) => item.trim())) rows.push(row);
      row = [];
      cell = '';
    } else {
      cell += char;
    }
  }
  row.push(cell);
  if (row.some((item) => item.trim())) rows.push(row);

  const [headers = [], ...body] = rows;
  return body.map((values) => Object.fromEntries(headers.map((header, index) => [header, values[index] ?? ''])));
}

async function readExcelFile(file: File) {
  const XLSX = await import('xlsx');
  const workbook = XLSX.read(await file.arrayBuffer(), { type: 'array' });
  const sheetName = workbook.SheetNames[0];
  if (!sheetName) return [];
  const rows = XLSX.utils.sheet_to_json<Record<string, unknown>>(workbook.Sheets[sheetName], { defval: '' });
  return rows.map(excelRowToDraft);
}

function withImportReviewTag(draft: any) {
  const tags = Array.from(new Set([...(Array.isArray(draft?.tags) ? draft.tags.map(String) : []), '待验收']));
  return { ...draft, tags };
}

function normalizeText(value: string) {
  return value
    .replace(/\\\((.+?)\\\)/gs, (_all, expr) => `{{math:${String(expr).trim()}}}`)
    .replace(/\\\[(.+?)\\\]/gs, (_all, expr) => `{{math:${String(expr).trim()}}}`)
    .replace(/\{_(\d+)\}/g, (_all, no) => `{{blank:${Number(no) + 1}}}`)
    .replace(/\{\{blank_(\d+)\}\}/g, (_all, no) => `{{blank:${Number(no) + 1}}}`)
    .replace(/\{\{blank:(\d+)\}\}/g, (_all, no) => `{{blank:${Math.max(1, Number(no))}}}`);
}

function normalizeSlotKey(value: unknown) {
  const text = String(value ?? '');
  const match = text.match(/^blank_(\d+)$/);
  if (!match) return text;
  return `blank_${Math.max(1, Number(match[1]))}`;
}

function normalizeDifficultyValue(value: unknown) {
  if (typeof value === 'number' && Number.isFinite(value)) return Math.min(5, Math.max(1, value));
  const text = String(value ?? '').trim().toLowerCase();
  const map: Record<string, number> = {
    easy: 1,
    medium: 2,
    hard: 3,
    简单: 1,
    容易: 1,
    中等: 2,
    普通: 2,
    困难: 3,
    难: 3,
  };
  const numeric = Number(text);
  if (Number.isFinite(numeric) && numeric > 0) return Math.min(5, Math.max(1, numeric));
  return map[text] ?? 1;
}

function walkNormalize(value: unknown): unknown {
  if (typeof value === 'string') return normalizeText(value);
  if (Array.isArray(value)) return value.map(walkNormalize);
  if (!value || typeof value !== 'object') return value;
  const input = value as Record<string, unknown>;
  const output: Record<string, unknown> = {};
  for (const [key, val] of Object.entries(input)) {
    if (key === 'slot_key') output[key] = normalizeSlotKey(val);
    else output[key] = walkNormalize(val);
  }
  return output;
}

function blankKeys(stem: string) {
  return Array.from(String(stem ?? '').matchAll(/\{\{blank(?::(\d+))?\}\}/g)).map((match, index) => `blank_${match[1] || index + 1}`);
}

function questionBlankKeys(question: any) {
  const values = [String(question?.stem ?? '')];
  const tableFill = question?.content?.tableFill;
  if (tableFill && typeof tableFill === 'object') {
    if (Array.isArray(tableFill.headers)) values.push(...tableFill.headers.map(String));
    if (Array.isArray(tableFill.rows)) values.push(...tableFill.rows.flat().map(String));
  }
  return Array.from(new Set(values.flatMap((value) => blankKeys(value))));
}

function columnArithmeticSlotKeys(question: any) {
  const config = question?.content?.columnArithmetic;
  if (!config || typeof config !== 'object') return [];
  const rows = [...(Array.isArray(config.carryRows) ? config.carryRows : []), ...(Array.isArray(config.rows) ? config.rows : [])];
  const cellKeys = rows.flatMap((row: any) => Array.isArray(row?.cells) ? row.cells : []).flatMap((cell: any) => cell?.slot ? [String(cell.slot)] : []);
  const validationKeys = [
    ...(Array.isArray(config.validation?.operands) ? config.validation.operands.flat().map(String) : []),
    ...(Array.isArray(config.validation?.result) ? config.validation.result.map(String) : []),
  ];
  const slotKeySet = new Set((question?.answer_slots ?? []).map((slot: any) => String(slot?.slot_key ?? '')));
  return Array.from(new Set([...cellKeys, ...validationKeys].filter((key) => slotKeySet.has(key))));
}

function looksLikePlainTextTable(question: any) {
  const stem = String(question?.stem ?? '');
  if (question?.question_type !== 'fill_blank' || question?.content?.tableFill) return false;
  const hasTableKeyword = /统计表|课程表|分类表|数量表|表格|数量\(个\)|水果\s+/.test(stem);
  const hasAlignedSpaces = /\n[^\n]*\S\s{2,}\S[^\n]*\n[^\n]*(?:\{\{blank(?::\d+)?\}\}|\s{2,}\S)/.test(stem);
  const blankCount = questionBlankKeys(question).length;
  return blankCount >= 2 && (hasTableKeyword || hasAlignedSpaces);
}

function splitTableLine(line: string) {
  return String(line ?? '').trim().split(/\s{2,}/).map((cell) => cell.trim()).filter(Boolean);
}

function autoConvertPlainTextTable(question: any) {
  if (!looksLikePlainTextTable(question)) return;
  const lines = String(question.stem ?? '').split(/\r?\n/);
  let best: { start: number; end: number; headers: string[]; rows: string[][] } | null = null;

  for (let start = 0; start < lines.length - 1; start += 1) {
    const headers = splitTableLine(lines[start]);
    if (headers.length < 2) continue;
    const rows: string[][] = [];
    let end = start + 1;
    while (end < lines.length) {
      const row = splitTableLine(lines[end]);
      if (row.length !== headers.length) break;
      rows.push(row);
      end += 1;
    }
    const hasBlank = rows.some((row) => row.some((cell) => /\{\{blank(?::\d+)?\}\}/.test(cell)));
    if (rows.length && hasBlank) {
      best = { start, end, headers, rows };
      break;
    }
  }

  if (!best) return;
  const before = lines.slice(0, best.start).join('\n').trim();
  const after = lines.slice(best.end).join('\n').trim();
  question.stem = [before, after].filter(Boolean).join('\n\n') || '完成表格。';
  question.content = {
    ...(question.content ?? {}),
    tableFill: {
      headers: best.headers,
      rows: best.rows,
    },
  };
}

function normalizePoemText(value: string) {
  return String(value ?? '').replace(/[\s\p{P}]/gu, '');
}

function splitPoemByPunctuation(fullText: string) {
  const matches = String(fullText ?? '').match(/[^，。！？；,.!?;]+[，。！？；,.!?;]?/g) ?? [];
  return matches.map((line) => line.trim()).filter(Boolean);
}

function buildPoemLines(poem: any) {
  if (Array.isArray(poem?.lines) && poem.lines.length) return poem.lines.map(String);
  const fullText = String(poem?.fullText ?? poem?.content ?? '').trim();
  const lineLengths = Array.isArray(poem?.lineLengths) ? poem.lineLengths.map(Number).filter(Boolean) : [];
  const punctuation = Array.isArray(poem?.punctuation) ? poem.punctuation.map(String) : [];
  if (fullText && lineLengths.length) {
    const pure = Array.from(normalizePoemText(fullText));
    let cursor = 0;
    return lineLengths.map((length: number, index: number) => {
      const text = pure.slice(cursor, cursor + length).join('');
      cursor += length;
      return `${text}${punctuation[index] ?? ''}`;
    }).filter(Boolean);
  }
  return splitPoemByPunctuation(fullText);
}

function compactText(value: unknown, max = 44) {
  const text = String(value ?? '')
    .replace(/\{\{blank(?::[^}]+)?\}\}/g, '____')
    .replace(/\{\{math:(.+?)\}\}/g, '$1')
    .replace(/\s+/g, ' ')
    .trim();
  return text.length > max ? text.slice(0, max) + '…' : text;
}

function canonical(value: unknown) {
  return String(value ?? '').replace(/\s+/g, '').trim();
}

function stableJson(value: unknown) {
  return JSON.stringify(value ?? null, (_key, val) => {
    if (Array.isArray(val)) return val.map((item) => typeof item === 'object' ? item : String(item)).sort((a, b) => JSON.stringify(a).localeCompare(JSON.stringify(b)));
    return val;
  });
}

function questionSignature(question: any, dbMode = false) {
  const stem = canonical(question?.stem);
  const slots = dbMode ? (question?.answerSlots ?? []) : (question?.answer_slots ?? []);
  const answers = (Array.isArray(slots) ? slots : []).map((slot: any) => ({
    key: normalizeSlotKey(dbMode ? slot.slotKey : slot.slot_key),
    answer: dbMode ? slot.correctAnswer : slot.correct_answer,
  }));
  const type = String(dbMode ? question?.questionType : question?.question_type ?? '').toLowerCase();
  return `${type || ''}|${stem}|${stableJson(answers)}`;
}

function draftSignature(draft: any) {
  if (!draft || typeof draft !== 'object') return '';
  if (draft.type === 'calculation_group') {
    return `calc|${stableJson((draft.items ?? []).map((item: any) => [canonical(item.stem), canonical(item.answer)]))}`;
  }
  if (draft.type === 'composite_group') {
    return `composite|${canonical(draft.commonStem)}|${stableJson((draft.children ?? []).map((child: any) => questionSignature(child)))}`;
  }
  return `question|${questionSignature(draft.question)}`;
}

function dbGroupSignature(group: any) {
  const questions = group?.questions ?? [];
  if (group?.groupType === 'MENTAL_MATH') {
    return `calc|${stableJson(questions.map((q: any) => [canonical(q.stem), canonical(q.answerSlots?.[0]?.correctAnswer?.[0] ?? '')]))}`;
  }
  if (group?.groupType === 'COMPOSITE') {
    return `composite|${canonical(group.commonStem)}|${stableJson(questions.map((q: any) => questionSignature(q, true)))}`;
  }
  return `question|${questionSignature(questions[0], true)}`;
}

const importTypeAliases: Record<string, string> = {
  FILL_BLANK: 'fill_blank',
  FILL_BLANK_GROUP: 'fill_blank',
  FILL_BLANKS: 'fill_blank',
  COMPARE: 'compare',
  SINGLE_CHOICE: 'single_choice',
  MULTIPLE_CHOICE: 'multiple_choice',
  TRUE_FALSE: 'true_false',
  ORDERING: 'ordering',
  MATCHING: 'matching',
  SENTENCE_BUILD: 'sentence_build',
  SENTENCE: 'sentence_build',
  WORD_PROBLEM: 'word_problem',
  ORAL_ARITHMETIC: 'calculation_group',
  MENTAL_MATH: 'calculation_group',
  CALCULATION_GROUP: 'calculation_group',
  COMPOSITE: 'composite_group',
  COMPOSITE_GROUP: 'composite_group',
  POEM_CHAR_PICKER: 'poem_char_picker',
};

const slotTypeAliases: Record<string, string> = {
  TEXT: 'text',
  NUMBER: 'number',
  EXPRESSION: 'expression',
  CHOICE: 'choice',
  MATCH: 'match',
  ORDER: 'order',
  COMPARE_SYMBOL: 'compare_symbol',
};

function canonicalImportType(value: unknown) {
  const raw = String(value ?? '').trim();
  if (!raw) return '';
  return importTypeAliases[raw] ?? importTypeAliases[raw.toUpperCase()] ?? raw.toLowerCase();
}

function canonicalSlotType(value: unknown, fallback = 'text') {
  const raw = String(value ?? fallback).trim();
  return slotTypeAliases[raw] ?? slotTypeAliases[raw.toUpperCase()] ?? raw.toLowerCase();
}

function normalizeOptionList(value: unknown) {
  return asArray(value).map((option: any, index) => {
    if (typeof option === 'string') return { key: String.fromCharCode(65 + index), text: option };
    return {
      key: String(option?.key ?? option?.label ?? option?.optionKey ?? String.fromCharCode(65 + index)).trim(),
      text: String(option?.text ?? option?.content ?? option?.value ?? '').trim(),
    };
  }).filter((option) => option.key || option.text);
}

function normalizeMaterialList(value: unknown) {
  return asArray(value).flatMap((material: any) => {
    if (!material) return [];
    if (typeof material === 'string') return [{ type: 'text', text: material }];
    const type = String(material.type ?? (material.url || material.src ? 'image' : 'text')).toLowerCase();
    return [{
      type: type === 'image' ? 'image' : type === 'table' ? 'table' : 'text',
      title: material.title,
      text: material.text,
      url: material.url ?? material.src ?? (type === 'image' ? material.text : undefined),
      table: material.table,
    }];
  });
}

function normalizeOcrQuestion(q: any, inheritedType: unknown) {
  if (!q || typeof q !== 'object') return q;
  const rawType = canonicalImportType(q.question_type ?? q.questionType ?? q.type ?? inheritedType);
  if (rawType && !allowedTypes.has(rawType)) q.question_type = rawType === 'compare' || rawType === 'poem_char_picker' ? 'fill_blank' : rawType;
  if (q.answerSlots && !q.answer_slots) {
    q.answer_slots = q.answerSlots.map((slot: any, index: number) => ({
      slot_key: normalizeSlotKey(slot.slot_key ?? slot.slotKey ?? `blank_${index + 1}`),
      slot_type: canonicalSlotType(slot.slot_type ?? slot.slotType, rawType === 'matching' ? 'match' : rawType === 'ordering' || rawType === 'sentence_build' ? 'order' : rawType?.includes?.('choice') || rawType === 'true_false' ? 'choice' : 'text'),
      correct_answer: Array.isArray(slot.correct_answer ?? slot.correctAnswer) ? (slot.correct_answer ?? slot.correctAnswer) : asArray(slot.correct_answer ?? slot.correctAnswer),
      answer_rule: slot.answer_rule ?? slot.answerRule,
    }));
  }
  if (q.explanationHtml && !q.explanation) q.explanation = q.explanationHtml;
  if (q.options && !q.content?.options) q.content = { ...(q.content ?? {}), options: normalizeOptionList(q.options) };
  if (q.items && !q.content?.items) q.content = { ...(q.content ?? {}), items: normalizeOptionList(q.items).map((item) => ({ key: item.key, label: item.key, value: item.text })) };
  if ((q.leftItems || q.rightItems) && (!q.content?.left || !q.content?.right)) {
    q.content = {
      ...(q.content ?? {}),
      left: normalizeOptionList(q.leftItems).map((item) => ({ key: item.key, text: item.text })),
      right: normalizeOptionList(q.rightItems).map((item) => ({ key: item.key, text: item.text })),
    };
  }
  const materials = normalizeMaterialList(q.materials ?? q.material ?? q.content?.materials);
  if (materials.length) q.content = { ...(q.content ?? {}), materials };
  if (rawType === 'compare') {
    if (!blankKeys(String(q.stem ?? '')).length) q.stem = String(q.stem ?? '').replace(/[○〇]/, '{{blank:1}}');
    if (!blankKeys(String(q.stem ?? '')).length) q.stem = `${String(q.stem ?? '').trim()} {{blank:1}}`;
    const keys = blankKeys(q.stem);
    q.answer_slots = (Array.isArray(q.answer_slots) && q.answer_slots.length ? q.answer_slots : [{ correct_answer: asArray(q.answer) }]).map((slot: any, index: number) => ({
      ...slot,
      slot_key: keys[index] ?? normalizeSlotKey(slot.slot_key ?? slot.slotKey ?? `blank_${index + 1}`),
      slot_type: 'compare_symbol',
      correct_answer: Array.isArray(slot.correct_answer ?? slot.correctAnswer) ? (slot.correct_answer ?? slot.correctAnswer) : asArray(slot.correct_answer ?? slot.correctAnswer ?? q.answer),
      answer_rule: slot.answer_rule ?? slot.answerRule ?? { allowed_values: ['>', '<', '='], display_shape: 'circle' },
    }));
  }
  if (q.question_type === 'true_false' && !q.content?.options) {
    q.content = { ...(q.content ?? {}), options: [{ key: 'T', text: '正确' }, { key: 'F', text: '错误' }] };
  }
  return q;
}

function normalizeOcrFriendlyItem(item: any) {
  const itemType = canonicalImportType(item.type ?? item.groupType ?? item.group_type ?? item.question_type);
  if (item.grade && !item.gradeLevel) item.gradeLevel = item.grade;
  const questions = Array.isArray(item.questions) ? item.questions : Array.isArray(item.children) ? item.children : [];

  if (itemType === 'calculation_group') {
    item.type = 'calculation_group';
    item.columns = Number(item.columns ?? item.content?.columns ?? 4) || 4;
    if (!Array.isArray(item.items)) {
      item.items = questions.map((q: any) => ({
        stem: String(q?.stem ?? ''),
        answer: String(q?.answer ?? q?.answerSlots?.[0]?.correctAnswer?.[0] ?? q?.answer_slots?.[0]?.correct_answer?.[0] ?? ''),
      }));
    }
    return item;
  }

  if (itemType === 'composite_group' || questions.length > 1) {
    item.type = 'composite_group';
    item.commonStem = item.commonStem ?? item.common_stem ?? item.material?.text ?? '';
    const materials = normalizeMaterialList(item.materials ?? item.material);
    if (materials.length) item.materials = materials;
    item.children = questions.map((q: any) => normalizeOcrQuestion(q, q?.type ?? itemType));
    return item;
  }

  if (itemType && !allowedTypes.has(itemType)) {
    item.type = 'question';
    item.question = normalizeOcrQuestion(item.question ?? questions[0] ?? item, itemType);
    return item;
  }

  if (item.question) item.question = normalizeOcrQuestion(item.question, item.question?.type ?? item.question_type);
  return item;
}

function normalizeImportedItem(raw: unknown) {
  const item = walkNormalize(raw) as any;
  if (!item || typeof item !== 'object') return item;
  normalizeOcrFriendlyItem(item);
  const normalizeQuestion = (q: any) => {
    if (!q || typeof q !== 'object') return;
    if (!q.answer_slots && q.answer !== undefined) {
      const answers = Array.isArray(q.answer) ? q.answer : [q.answer];
      if (q.question_type === 'fill_blank') {
        const keys = blankKeys(q.stem);
        q.answer_slots = answers.map((answer: unknown, index: number) => ({
          slot_key: keys[index] ?? `blank_${index + 1}`,
          slot_type: /^-?\d+(\.\d+)?$/.test(String(answer ?? '').trim()) ? 'number' : 'text',
          correct_answer: [String(answer ?? '')],
        }));
      }
      if (q.question_type === 'single_choice' || q.question_type === 'multiple_choice') {
        q.answer_slots = [{
          slot_key: 'answer',
          slot_type: 'choice',
          correct_answer: answers.map((answer: unknown) => String(answer ?? '').trim()).filter(Boolean),
        }];
      }
    }
    if ((q.question_type === 'single_choice' || q.question_type === 'multiple_choice') && Array.isArray(q.options)) {
      q.content = {
        ...(q.content ?? {}),
        options: q.options.map((option: any, index: number) => ({
          key: String(option.key ?? option.label ?? String.fromCharCode(65 + index)).trim(),
          text: String(option.text ?? option.content ?? ''),
        })),
      };
    }
    if (q.explanation && !q.content?.explanationHtml) {
      q.content = { ...(q.content ?? {}), explanationHtml: String(q.explanation), explanationFormat: 'html' };
    }
    autoConvertPlainTextTable(q);
    const poem = q.content?.poem;
    if (poem?.mode === 'char_picker' || q.content?.interaction === 'poem_char_fill') {
      const lines = buildPoemLines(poem);
      const answerText = normalizePoemText(String(poem?.fullText ?? poem?.content ?? lines.join('')));
      q.question_type = 'fill_blank';
      q.stem = q.stem || poem?.title || '古诗填空';
      q.content = {
        ...(q.content ?? {}),
        interaction: 'poem_char_fill',
        poem: {
          title: poem?.title,
          author: poem?.author,
          dynasty: poem?.dynasty,
          genre: poem?.genre,
          lines,
        },
        charPool: Array.isArray(poem?.pickChars) && poem.pickChars.length ? poem.pickChars.map(String) : Array.from(answerText),
      };
      q.answer_slots = [{ slot_key: 'poem', slot_type: 'text', correct_answer: [answerText] }];
    }
    if (q.question_type === 'fill_blank' && Array.isArray(q.answer_slots)) {
      const keys = questionBlankKeys(q);
      q.answer_slots = q.answer_slots.map((slot: any, index: number) => ({
        ...slot,
        slot_key: q.content?.interaction === 'poem_char_fill' ? (slot.slot_key || 'poem') : (keys[index] ?? normalizeSlotKey(slot.slot_key)),
      }));
    }
    if (Array.isArray(q.answer_slots)) {
      q.answer_slots = q.answer_slots.map((slot: any) => ({ ...slot, slot_key: normalizeSlotKey(slot.slot_key) }));
    }
  };
  if (item.type === 'question' && item.question) {
    const q = item.question;
    if (!item.title?.trim()) item.title = compactText(q.stem) || '未命名题目';
    item.difficulty = normalizeDifficultyValue(item.difficulty);
    item.tags = Array.isArray(item.tags) ? item.tags.map(String).filter(Boolean) : [];
    normalizeQuestion(q);
  }
  if (item.type === 'question' && !item.question && item.question_type) {
    const { type, title, gradeLevel, difficulty, tags, ...question } = item;
    item.question = question;
    item.title = title || compactText(question.stem) || '未命名题目';
    item.gradeLevel = gradeLevel;
    item.difficulty = normalizeDifficultyValue(difficulty);
    item.tags = Array.isArray(tags) ? tags.map(String).filter(Boolean) : [];
    normalizeQuestion(item.question);
  }
  if (item.type === 'calculation_group') {
    if (!item.title?.trim()) item.title = '口算题组';
    item.columns = Number(item.columns || 4);
    item.difficulty = normalizeDifficultyValue(item.difficulty);
    item.tags = Array.isArray(item.tags) ? item.tags.map(String).filter(Boolean) : [];
  }
  if (item.type === 'composite_group') {
    if (!item.title?.trim()) item.title = '复合题';
    const children = Array.isArray(item.children) ? item.children : [];
    const childTags = children.flatMap((child: any) => Array.isArray(child?.tags) ? child.tags.map(String) : []);
    const childGrades = children.map((child: any) => String(child?.gradeLevel ?? '').trim()).filter(Boolean);
    const childDifficulties = children.map((child: any) => normalizeDifficultyValue(child?.difficulty)).filter(Boolean);
    item.gradeLevel = String(item.gradeLevel ?? '').trim() || childGrades[0] || '';
    item.difficulty = normalizeDifficultyValue(item.difficulty ?? (childDifficulties.length ? Math.round(childDifficulties.reduce((sum: number, value: number) => sum + value, 0) / childDifficulties.length) : 1));
    item.tags = Array.from(new Set([...(Array.isArray(item.tags) ? item.tags.map(String) : []), ...childTags].filter(Boolean)));
    if (typeof item.materials === 'string') {
      const materialText = item.materials.trim();
      if (materialText) {
        item.commonStem = [item.commonStem, materialText].map((part) => String(part ?? '').trim()).filter(Boolean).join('\n');
        item.materials = [{ type: 'text', title: '题目说明', text: item.commonStem }];
      } else {
        item.materials = [];
      }
    }
    if (Array.isArray(item.children)) item.children.forEach(normalizeQuestion);
  }
  return item;
}

function validateQuestion(question: any) {
  const errors: string[] = [];
  const warnings: string[] = [];
  if (!question || typeof question !== 'object') return { errors: ['缺少 question 对象'], warnings };
  if (!allowedQuestionTypes.has(question.question_type)) errors.push(`不支持的 question_type：${question.question_type || '空'}`);
  if (!String(question.stem ?? '').trim()) errors.push('题干 stem 为空');
  if (!Array.isArray(question.answer_slots) || !question.answer_slots.length) errors.push('缺少 answer_slots');

  const slots = Array.isArray(question.answer_slots) ? question.answer_slots : [];
  const keys = questionBlankKeys(question);
  const isPoemPicker = question.content?.interaction === 'poem_char_fill';
  const isColumnArithmetic = question.content?.interaction === 'column_arithmetic' || Boolean(question.content?.columnArithmetic);
  const columnSlotKeys = columnArithmeticSlotKeys(question);
  const slotKeys = slots.map((slot: any) => normalizeSlotKey(slot.slot_key));
  const duplicateKeys = slotKeys.filter((key: string, index: number) => key && slotKeys.indexOf(key) !== index);
  if (duplicateKeys.length) errors.push(`answer_slots 存在重复 slot_key：${Array.from(new Set(duplicateKeys)).join('、')}`);
  if (question.question_type === 'fill_blank' && !isPoemPicker && !isColumnArithmetic) {
    if (!keys.length) errors.push('填空题题干里没有 {{blank:1}} 这类空位');
    const missing = keys.filter((key) => !slotKeys.includes(key));
    if (missing.length) errors.push(`这些空位没有答案：${missing.join('、')}`);
    const extra = slotKeys.filter((key: string) => key && !keys.includes(key));
    if (extra.length) warnings.push(`这些答案位未出现在题干中：${Array.from(new Set(extra)).join('、')}`);
    if (looksLikePlainTextTable(question)) warnings.push('检测到疑似表格填空题，建议改用 content.tableFill，表格里的空位会更稳定地展示和答题');
  }
  if (question.content?.tableFill) {
    const table = question.content.tableFill;
    const headers = Array.isArray(table.headers) ? table.headers : [];
    const rows = Array.isArray(table.rows) ? table.rows : [];
    if (!headers.length) warnings.push('表格填空题建议提供 content.tableFill.headers');
    if (!rows.length) errors.push('表格填空题缺少 content.tableFill.rows');
    const width = headers.length || (Array.isArray(rows[0]) ? rows[0].length : 0);
    const badRows = rows.filter((row: unknown) => !Array.isArray(row) || (width > 0 && row.length !== width));
    if (badRows.length) warnings.push('表格填空题存在列数不一致的行，可能影响展示');
  }
  if (isPoemPicker) {
    const poem = question.content?.poem ?? {};
    const lines = Array.isArray(poem.lines) ? poem.lines : [];
    const pool = Array.isArray(question.content?.charPool) ? question.content.charPool : [];
    const answer = String(slots[0]?.correct_answer?.[0] ?? '');
    if (!lines.length) errors.push('古诗选字题缺少 poem.lines');
    if (!pool.length) errors.push('古诗选字题缺少 charPool / pickChars');
    if (!answer) errors.push('古诗选字题缺少标准答案');
    const slotKey = normalizeSlotKey(slots[0]?.slot_key);
    if (slotKey !== 'poem') warnings.push('古诗选字题建议使用 slot_key: poem');
  }
  if (isColumnArithmetic) {
    const config = question.content?.columnArithmetic ?? {};
    const rows = Array.isArray(config.rows) ? config.rows : [];
    if (!rows.length) errors.push('竖式题缺少 content.columnArithmetic.rows');
    if (!columnSlotKeys.length) errors.push('竖式题缺少可填写方框 slot');
    const missing = columnSlotKeys.filter((key) => !slotKeys.includes(key));
    if (missing.length) errors.push(`竖式方框缺少 answer_slots：${missing.join('、')}`);
    const extra = slotKeys.filter((key: string) => key && !columnSlotKeys.includes(key));
    if (extra.length) warnings.push(`这些 answer_slots 未出现在竖式方框中：${Array.from(new Set(extra)).join('、')}`);
    if (!config.validation && !rows.some((row: any) => row?.role === 'result')) warnings.push('竖式题建议提供 validation 或 role=result 的结果行，便于稳定判分');
  }
  for (const slot of slots) {
    if (!slot.slot_key) errors.push('answer_slots 中存在空 slot_key');
    if (!slot.slot_type) errors.push(`空位 ${slot.slot_key || '-'} 缺少 slot_type`);
    const answer = slot.correct_answer;
    if (!isColumnArithmetic && (!Array.isArray(answer) || !answer.some((item) => String(item ?? '').trim()))) {
      errors.push(`空位 ${slot.slot_key || '-'} 缺少 correct_answer`);
    }
  }
  if (question.question_type === 'single_choice' || question.question_type === 'multiple_choice') {
    const options = Array.isArray(question.content?.options) ? question.content.options : [];
    if (options.length < 2) errors.push('选择题至少需要 2 个选项');
    const optionKeys = options.map((option: any) => String(option?.key ?? '').trim()).filter(Boolean);
    const duplicateOptionKeys = optionKeys.filter((key: string, index: number) => optionKeys.indexOf(key) !== index);
    if (duplicateOptionKeys.length) errors.push(`选项 key 重复：${Array.from(new Set(duplicateOptionKeys)).join('、')}`);
    const answer = slots[0]?.correct_answer;
    const answerKeys: string[] = Array.isArray(answer) ? answer.map(String).filter(Boolean) : [];
    if (question.question_type === 'single_choice' && answerKeys.length !== 1) errors.push('单选题必须且只能有 1 个答案');
    if (question.question_type === 'multiple_choice' && answerKeys.length < 1) errors.push('多选题至少需要 1 个答案');
    const invalidAnswers = answerKeys.filter((key) => !optionKeys.includes(key));
    if (invalidAnswers.length) errors.push(`答案不在选项 key 中：${invalidAnswers.join('、')}`);
  }
  if (question.question_type === 'ordering') {
    const items = Array.isArray(question.content?.items) ? question.content.items : [];
    if (items.length < 2) errors.push('排序题至少需要 2 个排序项');
    const itemKeys = items.map((item: any) => String(item?.key ?? '').trim()).filter(Boolean);
    const answerKeys: string[] = Array.isArray(slots[0]?.correct_answer) ? slots[0].correct_answer.map(String).filter(Boolean) : [];
    if (answerKeys.length !== itemKeys.length) errors.push('排序题答案数量必须和排序项数量一致');
    const invalid = answerKeys.filter((key) => !itemKeys.includes(key));
    if (invalid.length) errors.push(`排序题答案包含不存在的 key：${invalid.join('、')}`);
    if (!['>', '<'].includes(String(question.content?.separator ?? '>'))) warnings.push('排序题 separator 建议使用 > 或 <');
  }
  if (question.question_type === 'matching') {
    const left = Array.isArray(question.content?.left) ? question.content.left : [];
    const right = Array.isArray(question.content?.right) ? question.content.right : [];
    if (!left.length || !right.length) errors.push('连线题左右两栏都不能为空');
    const leftKeys = left.map((item: any) => String(item?.key ?? '').trim()).filter(Boolean);
    const rightKeys = right.map((item: any) => String(item?.key ?? '').trim()).filter(Boolean);
    const matches = Array.isArray(slots[0]?.correct_answer) ? slots[0].correct_answer : [];
    if (!matches.length) errors.push('连线题缺少 correct_answer 连线关系');
    const invalidMatches = matches.filter((match: any) => !leftKeys.includes(String(match?.left ?? '')) || !rightKeys.includes(String(match?.right ?? '')));
    if (invalidMatches.length) errors.push('连线题答案中存在无法匹配到左右栏 key 的连线');
  }
  if (question.question_type === 'sentence_build') {
    const tokens = Array.isArray(question.content?.tokens) ? question.content.tokens : [];
    if (tokens.length < 2) errors.push('连词成句至少需要 2 个词块（含标点）');
    const tokenKeys = tokens.map((t: any) => String(t?.key ?? '').trim()).filter(Boolean);
    if (new Set(tokenKeys).size !== tokenKeys.length) errors.push('连词成句 content.tokens 的 key 不能重复');
    const emptyText = tokens.filter((t: any) => !String(t?.text ?? '').trim());
    if (emptyText.length) errors.push('连词成句存在空文本的词块');
    const answerKeys: string[] = Array.isArray(slots[0]?.correct_answer) ? slots[0].correct_answer.map(String).filter(Boolean) : [];
    if (answerKeys.length !== tokenKeys.length) errors.push('连词成句答案数量必须和词块数量一致');
    const invalid = answerKeys.filter((key) => !tokenKeys.includes(key));
    if (invalid.length) errors.push(`连词成句答案包含不存在的 key：${invalid.join('、')}`);
  }
  if (String(question.stem ?? '').includes('\\(') || String(question.stem ?? '').includes('\\[')) warnings.push('题干里还有旧公式包裹，已尝试转换');
  return { errors, warnings };
}

function validateDraft(draft: any): { errors: string[]; warnings: string[] } {
  const errors: string[] = [];
  const warnings: string[] = [];
  if (!draft || typeof draft !== 'object') return { errors: ['不是合法对象'], warnings };
  if (!allowedTypes.has(draft.type)) errors.push(`不支持的 type：${draft.type || '空'}`);
  if (!String(draft.title ?? '').trim()) warnings.push('标题为空，导入时会使用题干自动生成标题');
  if (draft.difficulty && (Number(draft.difficulty) < 1 || Number(draft.difficulty) > 5)) warnings.push('难度建议在 1-5 之间');
  const mojibakeSnippets = collectMojibakeSnippets(draft);
  if (mojibakeSnippets.length) {
    warnings.push(`疑似中文乱码：${mojibakeSnippets.join(' / ')}。请检查文件编码、OCR 输出或复制来源`);
  }

  if (draft.type === 'question') {
    const result = validateQuestion(draft.question);
    errors.push(...result.errors);
    warnings.push(...result.warnings);
  }
  if (draft.type === 'calculation_group') {
    if (!Array.isArray(draft.items) || !draft.items.length) errors.push('口算题组缺少 items');
    for (const [index, item] of (draft.items ?? []).entries()) {
      if (!String(item?.stem ?? '').trim()) errors.push(`第 ${index + 1} 道口算缺少 stem`);
      if (!String(item?.answer ?? '').trim()) errors.push(`第 ${index + 1} 道口算缺少 answer`);
    }
  }
  if (draft.type === 'composite_group') {
    if (!Array.isArray(draft.children) || !draft.children.length) errors.push('复合题缺少 children');
    for (const [index, child] of (draft.children ?? []).entries()) {
      const result = validateQuestion(child);
      errors.push(...result.errors.map((text) => `第 ${index + 1} 小题：${text}`));
      warnings.push(...result.warnings.map((text) => `第 ${index + 1} 小题：${text}`));
    }
  }
  return { errors: Array.from(new Set(errors)), warnings: Array.from(new Set(warnings)) };
}

function lineColumnFromPosition(text: string, position: number) {
  const before = text.slice(0, Math.max(0, position));
  const lines = before.split(/\r?\n/);
  return { line: lines.length, column: (lines[lines.length - 1]?.length ?? 0) + 1 };
}

function formatParseError(error: unknown, sourceText: string) {
  const message = error instanceof Error ? error.message : String(error);
  const lineColumnMatch = message.match(/line\s+(\d+)\s+column\s+(\d+)/i);
  if (lineColumnMatch) return `${message}（第 ${lineColumnMatch[1]} 行第 ${lineColumnMatch[2]} 列附近）`;
  const positionMatch = message.match(/position\s+(\d+)/i);
  if (!positionMatch) return message;
  const { line, column } = lineColumnFromPosition(sourceText, Number(positionMatch[1]));
  return `${message}（第 ${line} 行第 ${column} 列附近）`;
}

function parseImportText(text: string): { items: ImportItem[]; parseError: string } {
  if (!text.trim()) return { items: [], parseError: '' };
  try {
    const json = JSON.parse(text);
    const items = asArray(json).map((raw, index) => {
      const draft = normalizeImportedItem(raw);
      const result = validateDraft(draft);
      return { index, original: raw, draft, errors: result.errors, warnings: result.warnings };
    });
    return { items, parseError: '' };
  } catch (error) {
    return { items: [], parseError: formatParseError(error, text) };
  }
}

function replaceItemInJsonText(text: string, index: number, nextItem: unknown) {
  const json = JSON.parse(text);
  if (Array.isArray(json)) {
    if (index < 0 || index >= json.length) throw new Error('题目序号超出范围');
    const next = [...json];
    next[index] = nextItem;
    return JSON.stringify(next, null, 2);
  }
  if (index !== 0) throw new Error('当前 JSON 不是数组，无法替换第 2 道之后的题目');
  return JSON.stringify(nextItem, null, 2);
}

function typeLabel(item: any) {
  if (item?.type === 'calculation_group') return '口算题组';
  if (item?.type === 'composite_group') return '复合题';
  const q = item?.question?.question_type;
  const map: Record<string, string> = {
    fill_blank: '填空题',
    single_choice: '单选题',
    multiple_choice: '多选题',
    ordering: '排序题',
    matching: '连线题',
    sentence_build: '连词成句',
  };
  return map[q] || q || '未知题型';
}

function ImportPreview({ draft }: { draft: any }) {
  if (draft.type === 'calculation_group') {
    return <section className="preview-paper"><h2>{draft.title}</h2><CalculationGroupPreview items={draft.items ?? []} columns={draft.columns ?? 4} /></section>;
  }
  if (draft.type === 'composite_group') {
    return <CompositePreview title={draft.title} commonStem={draft.commonStem} table={draft.table} materials={draft.materials} children={draft.children ?? []} />;
  }
  if (draft.type === 'question') {
    return <section className="preview-paper"><h2>{draft.title}</h2><QuestionPreview question={draft.question} /></section>;
  }
  return <div className="empty-state"><p className="empty-state-title">暂不能预览</p></div>;
}

export function QuestionJsonImportPage({ onBack, onOpenPaper, onStartPaper, onOpenAudit, onOpenImportBatches }: { onBack: () => void; onOpenPaper: (paperId: string) => void; onStartPaper: (paperId: string) => void; onOpenAudit?: () => void; onOpenImportBatches?: () => void }) {
  const { toast } = useToast();
  const [prefillNotice, setPrefillNotice] = useState<string>('');
  const [text, setText] = useState(() => {
    const prefill = consumeOcrPrefill();
    if (prefill && prefill.length) {
      setPrefillNotice(`已从拍照识别载入 ${prefill.length} 道题，请逐题校对后再保存`);
      return JSON.stringify(prefill, null, 2);
    }
    return SAMPLE_JSON;
  });
  useEffect(() => {
    if (prefillNotice) {
      toast.info(prefillNotice);
      setSourceType('ocr');
      setSourceName('拍照识别');
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  const [selectedIndex, setSelectedIndex] = useState(0);
  const [message, setMessage] = useState('');
  const [saving, setSaving] = useState(false);
  // 导入进度
  const [importProgress, setImportProgress] = useState<{ done: number; total: number } | null>(null);
  const [creatingPaper, setCreatingPaper] = useState(false);
  const [savedIds, setSavedIds] = useState<string[]>([]);
  const [paperId, setPaperId] = useState('');
  const [failures, setFailures] = useState<string[]>([]);
  // 失败的具体题目，支持「仅重试失败项」
  const [failedValidItems, setFailedValidItems] = useState<Array<{ index: number; draft: any; errors: string[]; warnings: string[]; duplicateGroupIds?: string[] }>>([]);
  const [itemEditText, setItemEditText] = useState('');
  const [existingMap, setExistingMap] = useState<Map<string, string[]>>(() => new Map());
  const [skipDuplicates, setSkipDuplicates] = useState(true);
  const [duplicateLoading, setDuplicateLoading] = useState(false);
  const [showNeedsAttentionOnly, setShowNeedsAttentionOnly] = useState(false);
  const [sourceType, setSourceType] = useState('json');
  const [sourceName, setSourceName] = useState('手动粘贴 JSON');
  const [latestBatchId, setLatestBatchId] = useState('');
  const [latestBatchTitle, setLatestBatchTitle] = useState('');
  const [latestBatchStatus, setLatestBatchStatus] = useState<'COMPLETED' | 'FAILED' | ''>('');
  const [latestBatchStats, setLatestBatchStats] = useState<Record<string, unknown> | null>(null);
  // 对大段 JSON 输入做防抖解析，避免每次按键都 JSON.parse + 逐条校验导致卡顿
  const debouncedText = useDebouncedValue(text, 300);
  const parsedBase = useMemo(() => parseImportText(debouncedText), [debouncedText]);
  const parsed = useMemo(() => ({
    ...parsedBase,
    items: parsedBase.items.map((item) => {
      const duplicateGroupIds = existingMap.get(draftSignature(item.draft)) ?? [];
      return duplicateGroupIds.length
        ? { ...item, duplicateGroupIds, warnings: [...item.warnings, `可能重复：题库中已有题组 ${duplicateGroupIds.join('、')}`] }
        : item;
    }),
  }), [parsedBase, existingMap]);
  const importItems = skipDuplicates ? parsed.items.filter((item) => !item.duplicateGroupIds?.length) : parsed.items;
  const validItems = importItems.filter((item) => !item.errors.length);
  const invalidItems = parsed.items.filter((item) => item.errors.length);
  const selected = parsed.items[selectedIndex] ?? parsed.items[0];
  const duplicateCount = parsed.items.filter((item) => item.duplicateGroupIds?.length).length;
  const warningCount = parsed.items.filter((item) => item.warnings.length).length;
  const attentionItems = parsed.items.filter((item) => item.errors.length || item.warnings.length || item.duplicateGroupIds?.length);
  const visibleItems = showNeedsAttentionOnly ? attentionItems : parsed.items;

  useEffect(() => {
    setItemEditText(selected ? JSON.stringify(selected.draft, null, 2) : '');
  }, [selectedIndex, selected?.draft]);

  const refreshDuplicateMap = async () => {
    setDuplicateLoading(true);
    try {
      const bank = await exportQuestionBank();
      const next = new Map<string, string[]>();
      for (const group of bank.groups ?? []) {
        const signature = dbGroupSignature(group);
        if (!signature) continue;
        const ids = next.get(signature) ?? [];
        ids.push(String(group.id));
        next.set(signature, ids);
      }
      setExistingMap(next);
      setMessage(`已刷新去重索引：${bank.count ?? bank.groups?.length ?? 0} 个题组`);
    } catch (error) {
      setMessage(`刷新去重索引失败：${error instanceof Error ? error.message : String(error)}`);
    } finally {
      setDuplicateLoading(false);
    }
  };

  useEffect(() => { void refreshDuplicateMap(); }, []);

  const stats = useMemo(() => {
    const map = new Map<string, number>();
    for (const item of parsed.items) map.set(typeLabel(item.draft), (map.get(typeLabel(item.draft)) ?? 0) + 1);
    return Array.from(map.entries()).map(([label, count]) => `${label} ${count}`).join(' / ') || '暂无题目';
  }, [parsed.items]);

  const resetImportOutcome = () => {
    setSavedIds([]);
    setPaperId('');
    setFailures([]);
    setLatestBatchId('');
    setLatestBatchTitle('');
    setLatestBatchStatus('');
    setLatestBatchStats(null);
  };

  const onFile = async (file?: File | null) => {
    if (!file) return;
    const lowerName = file.name.toLowerCase();
    try {
      if (lowerName.endsWith('.xlsx') || lowerName.endsWith('.xls')) {
        const drafts = await readExcelFile(file);
        setText(JSON.stringify(drafts, null, 2));
        setSourceType('excel');
        setSourceName(file.name);
        setMessage(drafts.length ? `已读取 Excel 文件：${file.name}，转换 ${drafts.length} 道题` : `未从 ${file.name} 读取到题目，请检查第一个工作表和表头`);
      } else if (lowerName.endsWith('.csv') || lowerName.endsWith('.tsv')) {
        const drafts = parseDelimitedText(await file.text()).map(excelRowToDraft);
        setText(JSON.stringify(drafts, null, 2));
        setSourceType(lowerName.endsWith('.tsv') ? 'tsv' : 'csv');
        setSourceName(file.name);
        setMessage(drafts.length ? `已读取表格文件：${file.name}，转换 ${drafts.length} 道题` : `未从 ${file.name} 读取到题目，请检查表头和分隔符`);
      } else {
        setText(await file.text());
        setSourceType('json');
        setSourceName(file.name);
        setMessage(`已读取文件：${file.name}`);
      }
      setSelectedIndex(0);
      resetImportOutcome();
      setShowNeedsAttentionOnly(false);
    } catch (error) {
      setMessage(`文件读取失败：${error instanceof Error ? error.message : String(error)}`);
    }
  };

  const copyNormalizedJson = async () => {
    const normalized = parsed.items.map((item) => item.draft);
    await navigator.clipboard.writeText(JSON.stringify(normalized, null, 2));
    setMessage(`已复制规范化 JSON：${normalized.length} 道题`);
  };

  const downloadTemplate = () => {
    downloadJson(`kids-quiz-import-template-${new Date().toISOString().slice(0, 10)}.json`, SAMPLE_JSON);
    setMessage('已下载导入模板');
  };

  const downloadExcelTemplate = async () => {
    const XLSX = await import('xlsx');
    const workbook = XLSX.utils.book_new();
    const sheet = XLSX.utils.json_to_sheet(EXCEL_TEMPLATE_ROWS);
    XLSX.utils.book_append_sheet(workbook, sheet, 'questions');
    const data = XLSX.write(workbook, { bookType: 'xlsx', type: 'array' });
    downloadBlob(
      `kids-quiz-excel-template-${new Date().toISOString().slice(0, 10)}.xlsx`,
      new Blob([data], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' }),
    );
    setMessage('已下载 Excel 导入模板');
  };

  const restoreSample = () => {
    setText(SAMPLE_JSON);
    setSourceType('json');
    setSourceName('示例 JSON');
    setSelectedIndex(0);
    resetImportOutcome();
    setMessage('已恢复示例 JSON');
  };

  const applyCurrentItemEdit = () => {
    if (!selected) { setMessage('请先选择一道题。'); return; }
    try {
      const nextItem = JSON.parse(itemEditText);
      const nextText = replaceItemInJsonText(text, selected.index, nextItem);
      setText(nextText);
      setSourceType('json');
      setSourceName('手动编辑 JSON');
      setSelectedIndex(selected.index);
      resetImportOutcome();
      setShowNeedsAttentionOnly(false);
      setMessage(`已更新第 ${selected.index + 1} 道题，请查看校验结果。`);
    } catch (error) {
      setMessage(`当前题 JSON 解析失败：${error instanceof Error ? error.message : String(error)}`);
    }
  };

  const applyNormalizedCurrentItem = () => {
    if (!selected) { setMessage('请先选择一道题。'); return; }
    try {
      const nextText = replaceItemInJsonText(text, selected.index, selected.draft);
      setText(nextText);
      setSourceType('json');
      setSourceName('规范化后的 JSON');
      setSelectedIndex(selected.index);
      resetImportOutcome();
      setShowNeedsAttentionOnly(false);
      setMessage(`已把第 ${selected.index + 1} 道题写回为规范格式。`);
    } catch (error) {
      setMessage(`规范化写回失败：${error instanceof Error ? error.message : String(error)}`);
    }
  };

  /** 为当前选中的计算题组一键生成答案 */
  const fillAnswersForCurrent = () => {
    if (!selected) { toast.warning('请先选择一道题'); return; }
    const draft = selected.draft;
    if (draft?.type !== 'calculation_group' || !Array.isArray(draft.items)) {
      toast.warning('只有口算/计算题组才能自动生成答案');
      return;
    }
    const { items, solved, failed, failedStems } = fillCalculationAnswers(draft.items);
    const nextDraft = { ...draft, items };
    const nextText = replaceItemInJsonText(text, selected.index, nextDraft);
    setText(nextText);
    setSourceType('ocr');
    setSourceName('自动生成答案');
    setSelectedIndex(selected.index);
    resetImportOutcome();
    if (failed === 0) {
      toast.success(`已为 ${solved} 道计算题生成答案`);
    } else if (solved === 0) {
      toast.danger(`没有能自动求值的算式（${failed} 道失败）`);
    } else {
      toast.warning(`成功 ${solved} 道，${failed} 道无法自动求值（需手动填写）`);
      setMessage(`无法自动求值的题干：${failedStems.slice(0, 5).join('、')}${failedStems.length > 5 ? ' …' : ''}`);
    }
  };

  /** 为当前 JSON 里所有计算题组一键生成答案 */
  const fillAllCalculationAnswers = () => {
    try {
      const json = JSON.parse(text);
      const arr = Array.isArray(json) ? json : [json];
      let totalSolved = 0;
      let totalFailed = 0;
      let groupCount = 0;
      const next = arr.map((item: any) => {
        if (item?.type === 'calculation_group' && Array.isArray(item.items)) {
          const { items, solved, failed } = fillCalculationAnswers(item.items);
          totalSolved += solved;
          totalFailed += failed;
          groupCount += 1;
          return { ...item, items };
        }
        return item;
      });
      if (groupCount === 0) { toast.warning('当前没有计算题组'); return; }
      const nextText = JSON.stringify(Array.isArray(json) ? next : next[0], null, 2);
      setText(nextText);
      setSourceType('ocr');
      setSourceName('自动生成答案');
      setSelectedIndex(-1);
      resetImportOutcome();
      if (totalFailed === 0) toast.success(`已为 ${groupCount} 组共 ${totalSolved} 道计算题生成答案`);
      else toast.warning(`成功 ${totalSolved} 道，${totalFailed} 道需手动填写`);
    } catch (error) {
      toast.danger(`生成失败：${error instanceof Error ? error.message : String(error)}`);
    }
  };

  const importValid = async () => {
    if (!validItems.length) { setMessage(skipDuplicates && duplicateCount ? '没有可导入的新题：有效题都被判定为重复。你可以关闭“跳过重复题”后再导入。' : '没有可导入的题目，请先修正 JSON。'); return; }
    setSaving(true);
    setImportProgress({ done: 0, total: validItems.length });
    const ids: string[] = [];
    const failed: string[] = [];
    const failedItems: typeof validItems = [];
    try {
      const batchTitle = `JSON 导入 ${new Date().toLocaleString()}`;
      const batch = await createImportBatch({
        title: batchTitle,
        sourceType,
        sourceName,
      });
      const importBatchId = String(batch.id);
      setLatestBatchId(importBatchId);
      setLatestBatchTitle(batchTitle);
      // 并发导入（最多 5 个同时），实时更新进度
      const { ok, failed: failedRaw } = await mapWithConcurrency(
        validItems,
        5,
        async (item) => saveQuestionGroup(withImportReviewTag({ ...item.draft, importBatchId })),
        (done, total) => {
          setImportProgress({ done, total });
          // 同步更新已保存 id 列表（顺序可能乱，但只用于计数和跳转，无妨）
        },
      );
      ok.forEach(({ result }) => ids.push(String(result.id)));
      // 收集失败项，便于「仅重试失败项」
      failedRaw.forEach(({ item, error }) => {
        failed.push(`第 ${item.index + 1} 道「${item.draft?.title || '未命名'}」：${error instanceof Error ? error.message : String(error)}`);
        failedItems.push(item);
      });
      setSavedIds([...ids]);
      setFailures(failed);
      setFailedValidItems(failedItems);
      const skippedDuplicateCount = skipDuplicates ? duplicateCount : 0;
      const batchStatus = failed.length ? 'FAILED' : 'COMPLETED';
      const batchStats = {
        total: validItems.length,
        saved: ids.length,
        failed: failed.length,
        invalid: invalidItems.length,
        duplicateSkipped: skippedDuplicateCount,
        groupIds: ids,
      };
      setLatestBatchStatus(batchStatus);
      setLatestBatchStats(batchStats);
      await finishImportBatch(importBatchId, {
        status: batchStatus,
        stats: batchStats,
        notes: failed.length ? failed.slice(0, 5).join('\n') : undefined,
      });
      setMessage(`导入完成：成功 ${ids.length} 道，保存失败 ${failed.length} 道，跳过 ${invalidItems.length} 道校验失败题目，跳过 ${skippedDuplicateCount} 道重复题。`);
      if (ids.length) void refreshDuplicateMap();
      if (failed.length) toast.warning(`导入完成，${failed.length} 道失败，可点「仅重试失败项」`);
      else toast.success(`导入完成，成功 ${ids.length} 道`);
    } finally {
      setSaving(false);
      setImportProgress(null);
    }
  };

  /* 仅重试上次失败的题目：把失败项的 JSON 写回 textarea，让用户检视后再次导入 */
  const retryFailed = () => {
    if (!failedValidItems.length) {
      toast.info('没有可重试的失败项');
      return;
    }
    const jsonText = JSON.stringify(failedValidItems.map((item) => item.draft), null, 2);
    setText(jsonText);
    setSelectedIndex(0);
    setFailedValidItems([]);
    setFailures([]);
    resetImportOutcome();
    toast.info(`已把 ${failedValidItems.length} 道失败题载入编辑区，可检查后再次导入`);
  };

  const focusFirstAttentionItem = () => {
    const item = attentionItems[0];
    if (!item) {
      setMessage('当前没有需要处理的题目。');
      return;
    }
    setSelectedIndex(item.index);
    setShowNeedsAttentionOnly(true);
    setMessage(`已定位第 ${item.index + 1} 道需处理题。`);
  };

  const createCheckPaper = async () => {
    if (!savedIds.length) { setMessage('请先导入题目，再生成验收试卷。'); return; }
    setCreatingPaper(true);
    try {
      const paper = await createPaper({
        title: `JSON导入验收试卷 ${new Date().toLocaleString()}`,
        description: `由 JSON 导入页自动生成，包含 ${savedIds.length} 个题组，用于逐题检查显示效果。`,
      });
      for (const groupId of savedIds) {
        await addPaperQuestionGroup(String(paper.id), groupId);
      }
      setPaperId(String(paper.id));
      if (latestBatchId) {
        const nextStats = { ...(latestBatchStats ?? {}), reviewPaperId: String(paper.id), groupIds: savedIds };
        setLatestBatchStats(nextStats);
        await finishImportBatch(latestBatchId, {
          status: latestBatchStatus || (failures.length ? 'FAILED' : 'COMPLETED'),
          stats: nextStats,
        });
      }
      setMessage(`已生成验收试卷：${paper.id}，共加入 ${savedIds.length} 个题组。`);
    } catch (error) {
      setMessage(`生成验收试卷失败：${error instanceof Error ? error.message : String(error)}`);
    } finally {
      setCreatingPaper(false);
    }
  };

  return <div className="question-editor-page animate-fadeIn">
    <header className="page-header" style={{ marginBottom: 'var(--space-5)' }}>
      <div className="page-header-left">
        <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-3)' }}>
          <button className="btn btn-ghost btn-sm" onClick={onBack} aria-label="返回题库">←</button>
          <h1 className="page-title">导入题目 JSON</h1>
        </div>
        <p className="page-subtitle">粘贴 JSON 或上传 Excel 表格，先校验预览，再批量导入题库。</p>
      </div>
      <div className="page-actions">
        <label className="btn btn-outline btn-sm" style={{ cursor: 'pointer' }}>
          上传 JSON/Excel
          <input type="file" accept=".json,.xlsx,.xls,.csv,.tsv,application/json,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,application/vnd.ms-excel,text/csv,text/tab-separated-values" style={{ display: 'none' }} onChange={(e) => void onFile(e.target.files?.[0])} />
        </label>
        {onOpenImportBatches && <button className="btn btn-outline btn-sm" onClick={onOpenImportBatches}>最近导入批次</button>}
        <button className="btn btn-outline btn-sm" onClick={() => void downloadExcelTemplate()}>下载 Excel 模板</button>
        <button className="btn btn-outline btn-sm" onClick={downloadTemplate}>下载 JSON 模板</button>
        <button className="btn btn-soft btn-sm" onClick={restoreSample}>恢复示例</button>
        <button className="btn btn-soft btn-sm" disabled={duplicateLoading} onClick={() => void refreshDuplicateMap()}>{duplicateLoading ? '刷新中...' : '刷新去重'}</button>
        <button className="btn btn-success btn-sm" onClick={fillAllCalculationAnswers} title="为所有口算/计算题组自动求值答案">🧮 全部生成答案</button>
        <button className="btn btn-primary btn-sm" disabled={saving || !validItems.length} onClick={() => void importValid()}>
          {saving ? '导入中...' : `导入 ${validItems.length} 道有效题`}
        </button>
      </div>
    </header>

    {message && <div className="message-banner success" style={{ marginBottom: 'var(--space-4)' }}>{message}</div>}
    {latestBatchId && latestBatchStats && <div className="message-banner info" style={{ marginBottom: 'var(--space-4)', alignItems: 'flex-start' }}>
      <b>{latestBatchTitle || `导入批次 ${latestBatchId}`}</b>
      <span>
        批次 ID：{latestBatchId}，状态：{latestBatchStatus === 'FAILED' ? '有失败' : '已完成'}，
        成功 {Number(latestBatchStats.saved ?? 0)}，失败 {Number(latestBatchStats.failed ?? 0)}，
        跳过校验失败 {Number(latestBatchStats.invalid ?? 0)}，跳过重复 {Number(latestBatchStats.duplicateSkipped ?? 0)}。
      </span>
      <div style={{ display: 'flex', gap: 'var(--space-2)', flexWrap: 'wrap' }}>
        {onOpenImportBatches && <button className="btn btn-outline btn-sm" onClick={onOpenImportBatches}>查看批次列表</button>}
        {onOpenAudit && <button className="btn btn-secondary btn-sm" onClick={onOpenAudit}>去体检中心</button>}
      </div>
    </div>}
    {savedIds.length > 0 && <div className="message-banner info" style={{ marginBottom: 'var(--space-4)', flexWrap: 'wrap' }}>
      <span>已导入题组 ID：{savedIds.join('、')}</span>
      <button className="btn btn-outline btn-sm" disabled={creatingPaper} onClick={() => void createCheckPaper()}>{creatingPaper ? '生成中...' : '生成验收试卷'}</button>
      {onOpenAudit && <button className="btn btn-secondary btn-sm" onClick={onOpenAudit}>去体检中心</button>}
      {paperId && <>
        <button className="btn btn-soft btn-sm" onClick={() => onOpenPaper(paperId)}>查看试卷</button>
        <button className="btn btn-primary btn-sm" onClick={() => onStartPaper(paperId)}>孩子端验收</button>
      </>}
      <button className="btn btn-soft btn-sm" onClick={onBack}>返回题库</button>
    </div>}
    {failures.length > 0 && <div className="message-banner danger" style={{ marginBottom: 'var(--space-4)', alignItems: 'flex-start' }}>
      <b>保存失败明细</b>
      <span style={{ flex: 1 }}>{failures.join('；')}</span>
      <button className="btn btn-warning btn-sm" onClick={retryFailed} disabled={saving}>仅重试失败项（{failedValidItems.length}）</button>
    </div>}

    {importProgress && (
      <div className="import-progress-bar" style={{ marginBottom: 'var(--space-4)' }}>
        <div className="import-progress-info">
          <b>正在导入…</b>
          <span>{importProgress.done} / {importProgress.total}</span>
        </div>
        <div className="progress-bar">
          <div
            className="progress-fill"
            style={{ width: `${importProgress.total ? Math.round((importProgress.done / importProgress.total) * 100) : 0}%` }}
          />
        </div>
      </div>
    )}

    <div className="editor-layout">
      <section className="editor-panel">
        <div className="card" style={{ marginBottom: 'var(--space-4)' }}>
          <h2 style={{ fontSize: 'var(--text-lg)', marginBottom: 'var(--space-3)' }}>1. 导入内容</h2>
          <div style={{ display: 'flex', gap: 'var(--space-2)', flexWrap: 'wrap', marginBottom: 'var(--space-3)' }}>
            <button className="btn btn-outline btn-sm" onClick={() => void copyNormalizedJson()} disabled={!parsed.items.length || Boolean(parsed.parseError)}>复制规范化 JSON</button>
            <button className="btn btn-secondary btn-sm" onClick={() => { setText(''); setSourceType('json'); setSourceName('手动粘贴 JSON'); setSelectedIndex(0); resetImportOutcome(); setShowNeedsAttentionOnly(false); }}>清空</button>
          </div>
          <textarea style={{ minHeight: 320 }} value={text} onChange={(e) => { setText(e.target.value); setSourceType('json'); setSourceName('手动编辑 JSON'); }} aria-label="题目 JSON 输入" />
          <p className="tip">支持 JSON 对象/数组，也支持 Excel、CSV、TSV 表格上传。Excel 表头可用 title、gradeLevel、difficulty、tags、question_type、stem、answer、options、explanation。</p>
        </div>

        <div className="card">
          <h2 style={{ fontSize: 'var(--text-lg)', marginBottom: 'var(--space-3)' }}>2. 校验结果</h2>
          {parsed.parseError && <div className="message-banner danger" style={{ marginBottom: 'var(--space-3)' }}>JSON 解析失败：{parsed.parseError}</div>}
          {!parsed.parseError && <div className={invalidItems.length ? 'editor-check-card warning' : 'editor-check-card success'}>
            <b>{parsed.items.length} 道题 / {validItems.length} 道可导入 / {invalidItems.length} 道需修正 / {warningCount} 道有提醒 / {duplicateCount} 道疑似重复</b>
            <span>{stats}{skipDuplicates && duplicateCount ? '。已开启跳过重复题。' : ''}</span>
          </div>}
          {!parsed.parseError && parsed.items.length > 0 && <div style={{ display: 'flex', gap: 'var(--space-2)', flexWrap: 'wrap', margin: 'var(--space-3) 0' }}>
            <button className="btn btn-outline btn-sm" disabled={!attentionItems.length} onClick={focusFirstAttentionItem}>定位第一道需处理题</button>
            <button className="btn btn-soft btn-sm" disabled={!attentionItems.length} onClick={() => setShowNeedsAttentionOnly((value) => !value)}>
              {showNeedsAttentionOnly ? '显示全部题目' : `只看需处理 ${attentionItems.length} 道`}
            </button>
          </div>}
          <label className="import-dedupe-toggle">
            <input type="checkbox" checked={skipDuplicates} onChange={(e) => setSkipDuplicates(e.target.checked)} />
            <span>导入时跳过疑似重复题</span>
          </label>
          <div style={{ display: 'grid', gap: 'var(--space-2)' }}>
            {visibleItems.map((item) => <button
              key={item.index}
              type="button"
              className={`import-item-card ${item.errors.length ? 'bad' : item.duplicateGroupIds?.length ? 'duplicate' : 'ok'} ${selected?.index === item.index ? 'active' : ''}`}
              onClick={() => setSelectedIndex(item.index)}
            >
              <b>{item.index + 1}. {item.draft?.title || '未命名'} <em>{typeLabel(item.draft)}</em></b>
              {item.errors.length ? <span>错误：{item.errors.join('；')}</span> : <span>校验通过{item.warnings.length ? `，提醒：${item.warnings.join('；')}` : ''}</span>}
            </button>)}
            {showNeedsAttentionOnly && !visibleItems.length && <p className="tip">当前没有需要处理的题目。</p>}
            {!parsed.items.length && !parsed.parseError && <p className="tip">暂无题目，请粘贴 JSON。</p>}
          </div>
        </div>
      </section>

      <section className="preview-panel">
        <h2 style={{ fontSize: 'var(--text-lg)', paddingBottom: 'var(--space-2)', marginBottom: 'var(--space-3)', color: 'var(--text-primary)' }}>导入预览</h2>
        {selected ? <>
          {selected.errors.length > 0 && <div className="message-banner danger" style={{ marginBottom: 'var(--space-3)' }}>{selected.errors.join('；')}</div>}
          {selected.warnings.length > 0 && <div className="message-banner warning" style={{ marginBottom: 'var(--space-3)' }}>{selected.warnings.join('；')}</div>}
          <details className="json-item-editor" open={selected.errors.length > 0} style={{ marginBottom: 'var(--space-3)' }}>
            <summary>编辑当前题 JSON</summary>
            <textarea value={itemEditText} onChange={(e) => setItemEditText(e.target.value)} />
            <div className="json-item-actions">
              <button className="btn btn-primary btn-sm" onClick={applyCurrentItemEdit}>应用修改并重新校验</button>
              <button className="btn btn-outline btn-sm" onClick={applyNormalizedCurrentItem}>写回规范格式</button>
              {selected.draft?.type === 'calculation_group' && (
                <button className="btn btn-success btn-sm" onClick={fillAnswersForCurrent}>🧮 一键生成答案</button>
              )}
            </div>
          </details>
          <ImportPreview draft={selected.draft} />
        </> : <div className="empty-state"><p className="empty-state-title">暂无预览</p><p className="empty-state-desc">请在左侧粘贴识别后的 JSON。</p></div>}
      </section>
    </div>
  </div>;
}

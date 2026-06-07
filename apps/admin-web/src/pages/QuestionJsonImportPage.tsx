import { useEffect, useMemo, useState } from 'react';
import { CalculationGroupPreview, CompositePreview, QuestionPreview } from '@kids-quiz/question-render';
import { exportQuestionBank, saveQuestionGroup } from '../api/questionGroups';
import { addPaperQuestionGroup, createPaper } from '../api/papers';

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
const allowedQuestionTypes = new Set(['fill_blank', 'single_choice', 'multiple_choice', 'ordering', 'matching']);

function asArray(value: unknown) {
  return Array.isArray(value) ? value : [value];
}

function downloadJson(filename: string, data: unknown) {
  const blob = new Blob([typeof data === 'string' ? data : JSON.stringify(data, null, 2)], { type: 'application/json;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
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

function normalizeImportedItem(raw: unknown) {
  const item = walkNormalize(raw) as any;
  if (!item || typeof item !== 'object') return item;
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
  const slotKeys = slots.map((slot: any) => normalizeSlotKey(slot.slot_key));
  const duplicateKeys = slotKeys.filter((key: string, index: number) => key && slotKeys.indexOf(key) !== index);
  if (duplicateKeys.length) errors.push(`answer_slots 存在重复 slot_key：${Array.from(new Set(duplicateKeys)).join('、')}`);
  if (question.question_type === 'fill_blank' && !isPoemPicker) {
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
  for (const slot of slots) {
    if (!slot.slot_key) errors.push('answer_slots 中存在空 slot_key');
    if (!slot.slot_type) errors.push(`空位 ${slot.slot_key || '-'} 缺少 slot_type`);
    const answer = slot.correct_answer;
    if (!Array.isArray(answer) || !answer.some((item) => String(item ?? '').trim())) {
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
    return { items: [], parseError: error instanceof Error ? error.message : String(error) };
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

export function QuestionJsonImportPage({ onBack, onOpenPaper, onStartPaper, onOpenAudit }: { onBack: () => void; onOpenPaper: (paperId: string) => void; onStartPaper: (paperId: string) => void; onOpenAudit?: () => void }) {
  const [text, setText] = useState(SAMPLE_JSON);
  const [selectedIndex, setSelectedIndex] = useState(0);
  const [message, setMessage] = useState('');
  const [saving, setSaving] = useState(false);
  const [creatingPaper, setCreatingPaper] = useState(false);
  const [savedIds, setSavedIds] = useState<string[]>([]);
  const [paperId, setPaperId] = useState('');
  const [failures, setFailures] = useState<string[]>([]);
  const [itemEditText, setItemEditText] = useState('');
  const [existingMap, setExistingMap] = useState<Map<string, string[]>>(() => new Map());
  const [skipDuplicates, setSkipDuplicates] = useState(true);
  const [duplicateLoading, setDuplicateLoading] = useState(false);
  const parsedBase = useMemo(() => parseImportText(text), [text]);
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

  const onFile = async (file?: File | null) => {
    if (!file) return;
    setText(await file.text());
    setSelectedIndex(0);
    setSavedIds([]);
    setPaperId('');
    setFailures([]);
    setMessage(`已读取文件：${file.name}`);
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

  const restoreSample = () => {
    setText(SAMPLE_JSON);
    setSelectedIndex(0);
    setSavedIds([]);
    setPaperId('');
    setFailures([]);
    setMessage('已恢复示例 JSON');
  };

  const applyCurrentItemEdit = () => {
    if (!selected) { setMessage('请先选择一道题。'); return; }
    try {
      const nextItem = JSON.parse(itemEditText);
      const nextText = replaceItemInJsonText(text, selected.index, nextItem);
      setText(nextText);
      setSelectedIndex(selected.index);
      setSavedIds([]);
      setPaperId('');
      setFailures([]);
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
      setSelectedIndex(selected.index);
      setSavedIds([]);
      setPaperId('');
      setFailures([]);
      setMessage(`已把第 ${selected.index + 1} 道题写回为规范格式。`);
    } catch (error) {
      setMessage(`规范化写回失败：${error instanceof Error ? error.message : String(error)}`);
    }
  };

  const importValid = async () => {
    if (!validItems.length) { setMessage(skipDuplicates && duplicateCount ? '没有可导入的新题：有效题都被判定为重复。你可以关闭“跳过重复题”后再导入。' : '没有可导入的题目，请先修正 JSON。'); return; }
    setSaving(true);
    setSavedIds([]);
    setPaperId('');
    setFailures([]);
    const ids: string[] = [];
    const failed: string[] = [];
    try {
      for (const [index, item] of validItems.entries()) {
        try {
          const saved = await saveQuestionGroup(withImportReviewTag(item.draft));
          ids.push(String(saved.id));
          setSavedIds([...ids]);
        } catch (error) {
          failed.push(`第 ${index + 1} 道「${item.draft?.title || '未命名'}」：${error instanceof Error ? error.message : String(error)}`);
        }
      }
      setFailures(failed);
      const skippedDuplicateCount = skipDuplicates ? duplicateCount : 0;
      setMessage(`导入完成：成功 ${ids.length} 道，保存失败 ${failed.length} 道，跳过 ${invalidItems.length} 道校验失败题目，跳过 ${skippedDuplicateCount} 道重复题。`);
      if (ids.length) void refreshDuplicateMap();
    } finally {
      setSaving(false);
    }
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
        <p className="page-subtitle">粘贴或上传识别工具输出的 JSON，先校验预览，再批量导入题库。</p>
      </div>
      <div className="page-actions">
        <label className="btn btn-outline btn-sm" style={{ cursor: 'pointer' }}>
          上传 JSON
          <input type="file" accept=".json,application/json" style={{ display: 'none' }} onChange={(e) => void onFile(e.target.files?.[0])} />
        </label>
        <button className="btn btn-outline btn-sm" onClick={downloadTemplate}>下载模板</button>
        <button className="btn btn-soft btn-sm" onClick={restoreSample}>恢复示例</button>
        <button className="btn btn-soft btn-sm" disabled={duplicateLoading} onClick={() => void refreshDuplicateMap()}>{duplicateLoading ? '刷新中...' : '刷新去重'}</button>
        <button className="btn btn-primary btn-sm" disabled={saving || !validItems.length} onClick={() => void importValid()}>
          {saving ? '导入中...' : `导入 ${validItems.length} 道有效题`}
        </button>
      </div>
    </header>

    {message && <div className="message-banner success" style={{ marginBottom: 'var(--space-4)' }}>{message}</div>}
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
      <span>{failures.join('；')}</span>
    </div>}

    <div className="editor-layout">
      <section className="editor-panel">
        <div className="card" style={{ marginBottom: 'var(--space-4)' }}>
          <h2 style={{ fontSize: 'var(--text-lg)', marginBottom: 'var(--space-3)' }}>1. JSON 内容</h2>
          <div style={{ display: 'flex', gap: 'var(--space-2)', flexWrap: 'wrap', marginBottom: 'var(--space-3)' }}>
            <button className="btn btn-outline btn-sm" onClick={() => void copyNormalizedJson()} disabled={!parsed.items.length || Boolean(parsed.parseError)}>复制规范化 JSON</button>
            <button className="btn btn-secondary btn-sm" onClick={() => { setText(''); setSelectedIndex(0); setSavedIds([]); setPaperId(''); setFailures([]); }}>清空</button>
          </div>
          <textarea style={{ minHeight: 320 }} value={text} onChange={(e) => { setText(e.target.value); setSelectedIndex(0); setSavedIds([]); setPaperId(''); setFailures([]); }} />
          <p className="tip">支持单个对象或数组。会自动兼容 \(...\)、\[...\] 公式和 {'{_0}'} 旧空位写法。</p>
        </div>

        <div className="card">
          <h2 style={{ fontSize: 'var(--text-lg)', marginBottom: 'var(--space-3)' }}>2. 校验结果</h2>
          {parsed.parseError && <div className="message-banner danger" style={{ marginBottom: 'var(--space-3)' }}>JSON 解析失败：{parsed.parseError}</div>}
          {!parsed.parseError && <div className={invalidItems.length ? 'editor-check-card warning' : 'editor-check-card success'}>
            <b>{parsed.items.length} 道题 / {validItems.length} 道可导入 / {invalidItems.length} 道需修正 / {duplicateCount} 道疑似重复</b>
            <span>{stats}{skipDuplicates && duplicateCount ? '。已开启跳过重复题。' : ''}</span>
          </div>}
          <label className="import-dedupe-toggle">
            <input type="checkbox" checked={skipDuplicates} onChange={(e) => setSkipDuplicates(e.target.checked)} />
            <span>导入时跳过疑似重复题</span>
          </label>
          <div style={{ display: 'grid', gap: 'var(--space-2)' }}>
            {parsed.items.map((item, index) => <button
              key={index}
              type="button"
              className={`import-item-card ${item.errors.length ? 'bad' : item.duplicateGroupIds?.length ? 'duplicate' : 'ok'} ${selected?.index === item.index ? 'active' : ''}`}
              onClick={() => setSelectedIndex(index)}
            >
              <b>{index + 1}. {item.draft?.title || '未命名'} <em>{typeLabel(item.draft)}</em></b>
              {item.errors.length ? <span>错误：{item.errors.join('；')}</span> : <span>校验通过{item.warnings.length ? `，提醒：${item.warnings.join('；')}` : ''}</span>}
            </button>)}
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
            </div>
          </details>
          <ImportPreview draft={selected.draft} />
        </> : <div className="empty-state"><p className="empty-state-title">暂无预览</p><p className="empty-state-desc">请在左侧粘贴识别后的 JSON。</p></div>}
      </section>
    </div>
  </div>;
}

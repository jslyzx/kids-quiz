#!/usr/bin/env node
import { existsSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(fileURLToPath(import.meta.url), '..', '..');

const groupTypes = new Set(['question', 'calculation_group', 'composite_group']);
const questionTypes = new Set([
  'fill_blank',
  'single_choice',
  'multiple_choice',
  'true_false',
  'ordering',
  'matching',
  'sentence_build',
  'word_problem',
]);

const typeAliases = new Map(Object.entries({
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
}));

const slotTypeAliases = new Map(Object.entries({
  TEXT: 'text',
  NUMBER: 'number',
  EXPRESSION: 'expression',
  CHOICE: 'choice',
  MATCH: 'match',
  ORDER: 'order',
  COMPARE_SYMBOL: 'compare_symbol',
}));

const keyboardModes = new Set(['math', 'digit', 'chinese-number', 'text']);

function usage() {
  console.log([
    'Usage: pnpm import:validate -- <file.json> [--check-assets] [--api-base=http://localhost:3000] [--write-normalized=out.json]',
    '',
    'Validates Kids Quiz import JSON, including OCR-friendly aliases from docs/question-json-import-format.md.',
  ].join('\n'));
}

function parseArgs(argv) {
  const args = { file: '', checkAssets: false, apiBase: 'http://localhost:3000', writeNormalized: '' };
  for (const arg of argv) {
    if (arg === '--help' || arg === '-h') args.help = true;
    else if (arg === '--check-assets') args.checkAssets = true;
    else if (arg.startsWith('--api-base=')) args.apiBase = arg.slice('--api-base='.length).replace(/\/$/, '');
    else if (arg.startsWith('--write-normalized=')) args.writeNormalized = arg.slice('--write-normalized='.length);
    else if (!args.file) args.file = arg;
    else throw new Error(`Unknown argument: ${arg}`);
  }
  return args;
}

function asArray(value) {
  return Array.isArray(value) ? value : value == null ? [] : [value];
}

function text(value) {
  return value == null ? '' : String(value);
}

function normalizeText(value) {
  return text(value)
    .replace(/\\\((.+?)\\\)/gs, (_all, expr) => `{{math:${String(expr).trim()}}}`)
    .replace(/\\\[(.+?)\\\]/gs, (_all, expr) => `{{math:${String(expr).trim()}}}`)
    .replace(/\{_(\d+)\}/g, (_all, no) => `{{blank:${Number(no) + 1}}}`)
    .replace(/\{\{blank_(\d+)\}\}/g, (_all, no) => `{{blank:${Number(no) + 1}}}`)
    .replace(/\{\{blank:blank_(\d+)\}\}/g, (_all, no) => `{{blank:${Number(no) + 1}}}`)
    .replace(/\{\{blank:(\d+)\}\}/g, (_all, no) => `{{blank:${Math.max(1, Number(no))}}}`);
}

function walkStrings(value) {
  if (typeof value === 'string') return normalizeText(value);
  if (Array.isArray(value)) return value.map(walkStrings);
  if (!value || typeof value !== 'object') return value;
  return Object.fromEntries(Object.entries(value).map(([key, item]) => [key, walkStrings(item)]));
}

function normalizeSlotKey(value, fallback = '') {
  const raw = text(value || fallback).trim();
  const match = raw.match(/^blank_(\d+)$/);
  if (match) return `blank_${Math.max(1, Number(match[1]))}`;
  return raw;
}

function blankKeysFromText(value) {
  return Array.from(text(value).matchAll(/\{\{blank(?::(\d+))?\}\}/g)).map((match, index) => `blank_${match[1] || index + 1}`);
}

function questionBlankKeys(question) {
  const values = [question?.stem];
  const tableFill = question?.content?.tableFill;
  if (tableFill && typeof tableFill === 'object') {
    if (Array.isArray(tableFill.headers)) values.push(...tableFill.headers);
    if (Array.isArray(tableFill.rows)) values.push(...tableFill.rows.flat());
  }
  return Array.from(new Set(values.flatMap(blankKeysFromText)));
}

function canonicalType(value) {
  const raw = text(value).trim();
  if (!raw) return '';
  return typeAliases.get(raw) ?? typeAliases.get(raw.toUpperCase()) ?? raw.toLowerCase();
}

function canonicalSlotType(value, fallback = 'text') {
  const raw = text(value || fallback).trim();
  return slotTypeAliases.get(raw) ?? slotTypeAliases.get(raw.toUpperCase()) ?? raw.toLowerCase();
}

function normalizeOptions(value) {
  return asArray(value).map((option, index) => {
    if (typeof option === 'string') return { key: String.fromCharCode(65 + index), text: option };
    return {
      key: text(option?.key ?? option?.label ?? String.fromCharCode(65 + index)).trim(),
      text: text(option?.text ?? option?.content ?? option?.value ?? '').trim(),
    };
  }).filter((option) => option.key || option.text);
}

function normalizeMaterials(input) {
  const raw = input?.materials ?? input?.material ?? input?.content?.materials ?? [];
  return asArray(raw).flatMap((material) => {
    if (!material) return [];
    if (typeof material === 'string') return [{ type: 'text', text: material }];
    const typeName = text(material.type || (material.url ? 'image' : 'text')).toLowerCase();
    return [{
      type: typeName === 'image' ? 'image' : typeName === 'table' ? 'table' : 'text',
      title: material.title ? text(material.title) : undefined,
      text: material.text ? text(material.text) : undefined,
      url: material.url || material.src || material.text,
      table: material.table,
    }];
  });
}

function normalizeAnswerSlots(question, questionType) {
  const slots = question.answer_slots ?? question.answerSlots;
  if (Array.isArray(slots) && slots.length) {
    return slots.map((slot, index) => ({
      slot_key: normalizeSlotKey(slot.slot_key ?? slot.slotKey, `blank_${index + 1}`),
      slot_type: canonicalSlotType(slot.slot_type ?? slot.slotType, questionType === 'matching' ? 'match' : questionType === 'ordering' || questionType === 'sentence_build' ? 'order' : questionType.includes('choice') || questionType === 'true_false' ? 'choice' : 'text'),
      correct_answer: Array.isArray(slot.correct_answer ?? slot.correctAnswer) ? (slot.correct_answer ?? slot.correctAnswer) : asArray(slot.correct_answer ?? slot.correctAnswer),
      answer_rule: slot.answer_rule ?? slot.answerRule,
      placeholder: slot.placeholder,
      unit: slot.unit,
      score: slot.score,
    }));
  }
  if (question.answer !== undefined) {
    const answers = asArray(question.answer).map((item) => text(item).trim()).filter(Boolean);
    if (questionType === 'single_choice' || questionType === 'multiple_choice' || questionType === 'true_false') {
      return [{ slot_key: 'choice', slot_type: 'choice', correct_answer: answers }];
    }
    const keys = questionBlankKeys(question);
    return answers.map((answer, index) => ({
      slot_key: keys[index] ?? `blank_${index + 1}`,
      slot_type: /^-?\d+(\.\d+)?$/.test(answer) ? 'number' : 'text',
      correct_answer: [answer],
    }));
  }
  return [];
}

function normalizeQuestion(raw, inheritedType = '') {
  const q = walkStrings({ ...(raw ?? {}) });
  const sourceType = canonicalType(q.question_type ?? q.questionType ?? q.type ?? inheritedType) || 'fill_blank';
  const questionType = sourceType === 'compare' || sourceType === 'poem_char_picker' ? 'fill_blank' : sourceType;
  const content = { ...(q.content && typeof q.content === 'object' ? q.content : {}) };

  if (Array.isArray(q.options)) content.options = normalizeOptions(q.options);
  if (Array.isArray(q.items)) content.items = q.items.map((item, index) => ({
    key: text(item?.key ?? index + 1),
    label: text(item?.label ?? item?.key ?? index + 1),
    value: text(item?.value ?? item?.text ?? item),
  }));
  if (Array.isArray(q.leftItems) || Array.isArray(q.rightItems)) {
    content.left = normalizeOptions(q.leftItems).map((item) => ({ key: item.key, text: item.text }));
    content.right = normalizeOptions(q.rightItems).map((item) => ({ key: item.key, text: item.text }));
  }
  const materials = normalizeMaterials(q);
  if (materials.length) content.materials = materials;

  let stem = text(q.stem ?? q.title ?? '');
  let answerSlots = normalizeAnswerSlots({ ...q, content }, questionType);

  if (sourceType === 'compare') {
    if (!blankKeysFromText(stem).length) stem = stem.replace(/[○〇]/, '{{blank:1}}');
    if (!blankKeysFromText(stem).length) stem = `${stem} {{blank:1}}`;
    answerSlots = answerSlots.length ? answerSlots : [{ slot_key: 'blank_1', slot_type: 'compare_symbol', correct_answer: asArray(q.answer).length ? asArray(q.answer) : [] }];
    answerSlots = answerSlots.map((slot, index) => ({
      ...slot,
      slot_key: blankKeysFromText(stem)[index] ?? normalizeSlotKey(slot.slot_key, `blank_${index + 1}`),
      slot_type: 'compare_symbol',
      answer_rule: slot.answer_rule ?? { allowed_values: ['>', '<', '='], display_shape: 'circle' },
    }));
  }

  if (sourceType === 'poem_char_picker' || content?.poem?.mode === 'char_picker') {
    const poem = content.poem ?? {};
    const fullText = text(poem.fullText ?? poem.content ?? '');
    const lines = Array.isArray(poem.lines) ? poem.lines.map(text) : [];
    const answer = fullText.replace(/[\s\p{P}]/gu, '');
    content.interaction = 'poem_char_fill';
    content.poem = { ...poem, lines };
    content.charPool = asArray(content.pickChars ?? q.pickChars ?? Array.from(answer)).map(text);
    answerSlots = [{ slot_key: 'poem', slot_type: 'text', correct_answer: [answer] }];
  }

  return {
    question_type: questionType,
    stem,
    content: Object.keys(content).length ? content : undefined,
    answer_slots: answerSlots,
    explanation: q.explanation ?? q.explanationHtml,
  };
}

function normalizeDraft(raw) {
  const item = walkStrings({ ...(raw ?? {}) });
  const type = canonicalType(item.type ?? item.group_type ?? item.groupType ?? item.question_type);
  const title = text(item.title).trim();
  const gradeLevel = text(item.gradeLevel ?? item.grade).trim() || undefined;
  const difficulty = Math.min(5, Math.max(1, Number(item.difficulty || 1)));
  const tags = asArray(item.tags).flatMap((tag) => text(tag).split(/[,，]/)).map((tag) => tag.trim()).filter(Boolean);
  const questions = asArray(item.questions ?? item.children);

  if (type === 'calculation_group') {
    const sourceItems = Array.isArray(item.items) ? item.items : questions;
    return {
      type: 'calculation_group',
      title: title || '口算题组',
      gradeLevel,
      difficulty,
      tags,
      columns: Number(item.columns ?? item.content?.columns ?? 4) || 4,
      items: sourceItems.map((q) => ({
        stem: text(q.stem ?? q.question ?? ''),
        answer: text(q.answer ?? q.answerSlots?.[0]?.correctAnswer?.[0] ?? q.answer_slots?.[0]?.correct_answer?.[0] ?? ''),
      })),
    };
  }

  if (type === 'composite_group' || questions.length > 1) {
    return {
      type: 'composite_group',
      title: title || '复合题',
      gradeLevel,
      difficulty,
      tags,
      commonStem: text(item.commonStem ?? item.common_stem ?? item.material?.text ?? ''),
      materials: normalizeMaterials(item),
      children: questions.map((q) => normalizeQuestion(q, type === 'composite_group' ? q?.type : type)),
    };
  }

  if (item.question) {
    return {
      type: 'question',
      title: title || text(item.question.stem).slice(0, 40) || '未命名题目',
      gradeLevel,
      difficulty,
      tags,
      question: normalizeQuestion(item.question, type),
    };
  }

  return {
    type: 'question',
    title: title || text(item.stem ?? questions[0]?.stem).slice(0, 40) || '未命名题目',
    gradeLevel,
    difficulty,
    tags,
    question: normalizeQuestion(questions[0] ?? item, type),
  };
}

function validateQuestion(question, path, errors, warnings) {
  if (!questionTypes.has(question.question_type)) errors.push(`${path}: unsupported question_type "${question.question_type}"`);
  if (!text(question.stem).trim() && question.content?.interaction !== 'poem_char_fill') errors.push(`${path}: stem is empty`);
  const slots = asArray(question.answer_slots);
  if (!slots.length) errors.push(`${path}: answer_slots is empty`);

  const keys = questionBlankKeys(question);
  const slotKeys = slots.map((slot) => normalizeSlotKey(slot.slot_key));
  const duplicateSlotKeys = slotKeys.filter((key, index) => key && slotKeys.indexOf(key) !== index);
  if (duplicateSlotKeys.length) errors.push(`${path}: duplicate slot_key ${Array.from(new Set(duplicateSlotKeys)).join(', ')}`);

  const isColumnArithmetic = question.content?.interaction === 'column_arithmetic' || question.content?.columnArithmetic;
  const isColumnDivision = question.content?.interaction === 'column_division' || question.content?.columnDivision;
  if (question.question_type === 'fill_blank' && !isColumnArithmetic && !isColumnDivision && question.content?.interaction !== 'poem_char_fill') {
    const missing = keys.filter((key) => !slotKeys.includes(key));
    if (keys.length && missing.length) errors.push(`${path}: blanks without answers ${missing.join(', ')}`);
    if (!keys.length && !question.content?.materials?.length) warnings.push(`${path}: fill_blank has no {{blank:n}} placeholder`);
  }

  for (const slot of slots) {
    if (!text(slot.slot_key).trim()) errors.push(`${path}: answer slot has empty slot_key`);
    if (!text(slot.slot_type).trim()) errors.push(`${path}: slot ${slot.slot_key || '-'} has empty slot_type`);
    const keyboard = text(slot.answer_rule?.keyboard).trim();
    if (keyboard && !keyboardModes.has(keyboard)) errors.push(`${path}: slot ${slot.slot_key || '-'} has unsupported answer_rule.keyboard "${keyboard}"`);
    const answer = asArray(slot.correct_answer);
    if (!isColumnArithmetic && !isColumnDivision && !answer.some((item) => text(item).trim())) errors.push(`${path}: slot ${slot.slot_key || '-'} has empty correct_answer`);
  }

  if (['single_choice', 'multiple_choice', 'true_false'].includes(question.question_type)) {
    const options = normalizeOptions(question.content?.options);
    if (options.length < 2) errors.push(`${path}: choice question needs at least 2 options`);
    const optionKeys = options.map((option) => option.key);
    const answerKeys = asArray(slots[0]?.correct_answer).map(text).filter(Boolean);
    if (question.question_type === 'single_choice' && answerKeys.length !== 1) errors.push(`${path}: single_choice must have exactly one answer`);
    const invalid = answerKeys.filter((key) => !optionKeys.includes(key));
    if (invalid.length) errors.push(`${path}: answers not in options ${invalid.join(', ')}`);
  }

  if (question.question_type === 'matching') {
    const leftKeys = asArray(question.content?.left).map((item) => text(item?.key)).filter(Boolean);
    const rightKeys = asArray(question.content?.right).map((item) => text(item?.key)).filter(Boolean);
    const matches = asArray(slots[0]?.correct_answer);
    if (!leftKeys.length || !rightKeys.length) errors.push(`${path}: matching question needs content.left and content.right`);
    const invalid = matches.filter((match) => !leftKeys.includes(text(match?.left)) || !rightKeys.includes(text(match?.right)));
    if (invalid.length) errors.push(`${path}: matching answer references missing keys`);
  }

  if (question.question_type === 'sentence_build') {
    const tokens = asArray(question.content?.tokens);
    if (tokens.length < 2) errors.push(`${path}: sentence_build needs at least 2 tokens`);
    const tokenKeys = tokens.map((t) => text(t?.key)).filter(Boolean);
    if (new Set(tokenKeys).size !== tokenKeys.length) errors.push(`${path}: sentence_build token keys must be unique`);
    if (tokens.some((t) => !text(t?.text).trim())) errors.push(`${path}: sentence_build has empty token text`);
    const answerKeys = asArray(slots[0]?.correct_answer).map(text).filter(Boolean);
    if (answerKeys.length !== tokenKeys.length) errors.push(`${path}: sentence_build answer count must match tokens`);
    const invalidAnswer = answerKeys.filter((key) => !tokenKeys.includes(key));
    if (invalidAnswer.length) errors.push(`${path}: sentence_build answer references missing token keys ${invalidAnswer.join(', ')}`);
  }

  const body = JSON.stringify(question);
  if (/[锛绗涓瀵棰鈥馃]/.test(body)) warnings.push(`${path}: text looks like mojibake; verify file encoding and OCR output`);
}

function validateDraft(draft, index) {
  const errors = [];
  const warnings = [];
  const path = `item[${index}]`;
  if (!groupTypes.has(draft.type)) errors.push(`${path}: unsupported type "${draft.type}"`);
  if (!text(draft.title).trim()) warnings.push(`${path}: title is empty`);

  if (draft.type === 'calculation_group') {
    if (!Array.isArray(draft.items) || !draft.items.length) errors.push(`${path}: calculation_group needs items`);
    asArray(draft.items).forEach((item, itemIndex) => {
      if (!text(item.stem).trim()) errors.push(`${path}.items[${itemIndex}]: stem is empty`);
      if (!text(item.answer).trim()) errors.push(`${path}.items[${itemIndex}]: answer is empty`);
    });
  } else if (draft.type === 'composite_group') {
    if (!Array.isArray(draft.children) || !draft.children.length) errors.push(`${path}: composite_group needs children`);
    asArray(draft.children).forEach((question, questionIndex) => validateQuestion(question, `${path}.children[${questionIndex}]`, errors, warnings));
  } else {
    validateQuestion(draft.question, `${path}.question`, errors, warnings);
  }
  return { errors: Array.from(new Set(errors)), warnings: Array.from(new Set(warnings)) };
}

function collectUrls(value, urls = []) {
  if (!value || typeof value !== 'object') return urls;
  if (Array.isArray(value)) {
    value.forEach((item) => collectUrls(item, urls));
    return urls;
  }
  for (const [key, item] of Object.entries(value)) {
    if ((key === 'url' || key === 'src') && typeof item === 'string') urls.push(item);
    else collectUrls(item, urls);
  }
  return urls;
}

async function validateAssets(drafts, apiBase) {
  const warnings = [];
  const errors = [];
  const urls = Array.from(new Set(drafts.flatMap((draft) => collectUrls(draft))));
  for (const url of urls) {
    if (/^https?:\/\/localhost:3000\/uploads\//.test(url) || /^https?:\/\/127\.0\.0\.1:3000\/uploads\//.test(url)) {
      const file = resolve(root, 'apps/api/uploads', decodeURIComponent(new URL(url).pathname.replace(/^\/uploads\//, '')));
      if (!existsSync(file)) errors.push(`asset missing: ${url} -> ${file}`);
      else if (!statSync(file).size) errors.push(`asset empty: ${url} -> ${file}`);
      continue;
    }
    if (url.startsWith('/uploads/')) {
      const file = resolve(root, 'apps/api', url.replace(/^\//, ''));
      if (!existsSync(file)) errors.push(`asset missing: ${url} -> ${file}`);
      continue;
    }
    if (/^https?:\/\//.test(url)) {
      try {
        const res = await fetch(url.replace(/^http:\/\/localhost:3000/, apiBase), { method: 'HEAD' });
        if (!res.ok) errors.push(`asset not reachable: ${url} -> HTTP ${res.status}`);
      } catch (error) {
        warnings.push(`asset check failed: ${url} -> ${error instanceof Error ? error.message : String(error)}`);
      }
    }
  }
  return { errors, warnings };
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  if (args.help || !args.file) {
    usage();
    process.exit(args.help ? 0 : 1);
  }

  const file = resolve(process.cwd(), args.file);
  const raw = JSON.parse(readFileSync(file, 'utf8'));
  const sourceItems = Array.isArray(raw) ? raw : [raw];
  const drafts = sourceItems.map(normalizeDraft);
  const reports = drafts.map(validateDraft);
  const errors = reports.flatMap((report) => report.errors);
  const warnings = reports.flatMap((report) => report.warnings);

  if (args.checkAssets) {
    const assetReport = await validateAssets(drafts, args.apiBase);
    errors.push(...assetReport.errors);
    warnings.push(...assetReport.warnings);
  }

  if (args.writeNormalized) {
    writeFileSync(resolve(process.cwd(), args.writeNormalized), JSON.stringify(drafts, null, 2), 'utf8');
  }

  console.log(`Validated ${drafts.length} import item(s).`);
  console.log(`Errors: ${errors.length}`);
  errors.forEach((error) => console.log(`ERROR ${error}`));
  console.log(`Warnings: ${warnings.length}`);
  warnings.forEach((warning) => console.log(`WARN ${warning}`));

  if (errors.length) process.exit(1);
}

main().catch((error) => {
  console.error(error instanceof Error ? error.stack || error.message : String(error));
  process.exit(1);
});

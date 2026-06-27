import type { AnswerSlot, QuestionDraft, QuestionType, SlotType, TableMaterial } from '@kids-quiz/shared-types';
import type { AppState, ChildDraftInput, MaterialInput } from '../types/editor';
import { richTextToPlainText } from '../components/RichTextEditor';
import { blankKeys } from './blanks';

export const defaultState: AppState = {
  mode: 'fill_blank',
  title: '',
  gradeLevel: '二年级',
  difficulty: 1,
  tagsText: '数学,基础',
  stem: '一个四位数，从右边起第一位是{{blank:1}}位，第三位是{{blank:2}}位；最大的四位数是{{blank:3}}，最小的四位数是{{blank:4}}。',
  answers: { blank_1: '个', blank_2: '百', blank_3: '9999', blank_4: '1000' },
  explanationHtml: '',
  choiceStem: '下面算式正确的是哪一项？',
  choiceOptionsText: 'A,20×3=60\nB,48÷6=6\nC,56÷7=9\nD,11×4=40',
  choiceAnswer: 'A',
  calcText: '20×3=60\n48÷6=8\n300×2=600\n56÷7=8',
  calcColumns: 4,
  orderingText: '①,1200\n②,980\n③,1000\n④,1500\n⑤,890',
  orderingAnswer: '④,①,③,②,⑤',
  orderingSeparator: '>',
  matchingLeft: '3×4\n5×6\n8÷2',
  matchingRight: '4\n12\n30',
  matchingAnswer: '3×4=>12\n5×6=>30\n8÷2=>4',
  sentenceTokens: 'I\nam\na\nboy\n#.',
  sentenceAnswer: '1,2,3,4,5',
  commonStem: '根据下面材料回答问题。',
  tableText: '物品,数量\n苹果,12\n梨,8\n桃子,15\n笔,6',
  materials: [
    { type: 'text', title: '材料', text: '根据下面材料回答问题。' },
    { type: 'table', title: '统计表', text: '物品,数量\n苹果,12\n梨,8\n桃子,15\n笔,6' },
  ],
  children: [
    { type: 'fill_blank', stem: '1. 苹果有{{blank:1}}个。', answer: '12', slotType: 'number', explanationHtml: '' },
    { type: 'fill_blank', stem: '2. 苹果比梨多{{blank:1}}个。', answer: '4', slotType: 'number', explanationHtml: '' },
    { type: 'fill_blank', stem: '3. 苹果和桃子一共有{{blank:1}}个。', answer: '27', slotType: 'number', explanationHtml: '' },
  ],
};

export const emptyState: AppState = {
  mode: 'fill_blank',
  title: '',
  gradeLevel: '二年级',
  difficulty: 1,
  tagsText: '',
  stem: '{{blank:1}}',
  answers: { blank_1: '' },
  explanationHtml: '',
  choiceStem: '',
  choiceOptionsText: 'A,\nB,\nC,\nD,',
  choiceAnswer: '',
  calcText: '',
  calcColumns: 4,
  orderingText: '',
  orderingAnswer: '',
  orderingSeparator: '>',
  matchingLeft: '',
  matchingRight: '',
  matchingAnswer: '',
  sentenceTokens: '',
  sentenceAnswer: '',
  commonStem: '',
  tableText: '',
  materials: [{ type: 'text', title: '', text: '' }],
  children: [{ type: 'fill_blank', stem: '1. {{blank:1}}', answer: '', slotType: 'number', answers: { blank_1: '' }, explanationHtml: '' }],
};

export function makeBlankSlots(stem: string, slotType: SlotType, answers: Record<string, string>): AnswerSlot[] {
  return blankKeys(stem).map((key) => ({
    slot_key: key,
    slot_type: slotType,
    correct_answer: [answers[key] ?? ''],
    answer_rule: slotType === 'compare_symbol' ? { allowed_values: ['>', '<', '='] } : undefined,
  }));
}

export function parseCalculationLines(text: string) {
  return text.split('\n').map((line) => line.trim()).filter(Boolean).map((line) => {
    const m = line.match(/^(.*?=)\s*(.+)$/);
    return m ? { stem: m[1].trim(), answer: m[2].trim() } : { stem: line, answer: '' };
  });
}

export function parseTable(text: string): TableMaterial {
  const rows = text.split('\n').map((line) => line.split(',').map((cell) => cell.trim())).filter((row) => row.some(Boolean));
  return { headers: rows[0] ?? [], rows: rows.slice(1) };
}

export function parseChoiceOptions(text: string) {
  return text.split('\n').map((line, index) => {
    const [key, ...rest] = line.split(',');
    return { key: key?.trim() || String.fromCharCode(65 + index), text: rest.join(',').trim() };
  }).filter((item) => item.key || item.text);
}

export function normalizeMaterials(input: MaterialInput[]) {
  return input
    .filter((item) => item.text.trim() || item.title?.trim())
    .map((item) => ({
      type: item.type,
      title: item.title?.trim() || undefined,
      text: item.type === 'table' ? undefined : item.text,
      url: item.type === 'image' ? item.text.trim() : undefined,
      table: item.type === 'table' ? parseTable(item.text) : undefined,
    }));
}

export function tableToCsv(table: any): string {
  if (!table) return '';
  const headers = Array.isArray(table.headers) ? table.headers : [];
  const rows = Array.isArray(table.rows) ? table.rows : [];
  return [headers, ...rows].filter((row) => Array.isArray(row) && row.length).map((row) => row.join(',')).join('\n');
}

export function materialInputsFromDb(group: any): MaterialInput[] {
  const stored = group.content?.materials;
  if (Array.isArray(stored) && stored.length) {
    return stored.map((item: any) => ({
      type: item.type === 'image' ? 'image' : item.type === 'table' ? 'table' : 'text',
      title: item.title ?? '',
      text: item.type === 'table' ? tableToCsv(item.table) : String(item.url ?? item.text ?? ''),
    }));
  }
  const legacy: MaterialInput[] = [];
  if (group.commonStem) legacy.push({ type: 'text', title: '公共题干', text: group.commonStem });
  if (group.content?.table) legacy.push({ type: 'table', title: '表格材料', text: tableToCsv(group.content.table) });
  return legacy.length ? legacy : [{ type: 'text', title: '', text: '' }];
}

function dbSlotTypeToEditor(value: string): ChildDraftInput['slotType'] {
  const map: Record<string, ChildDraftInput['slotType']> = {
    TEXT: 'text',
    NUMBER: 'number',
    COMPARE_SYMBOL: 'compare_symbol',
  };
  return map[value] ?? 'text';
}

function slotAnswers(slots: any[] = []) {
  return Object.fromEntries(slots.map((slot) => [slot.slotKey, Array.isArray(slot.correctAnswer) ? String(slot.correctAnswer[0] ?? '') : String(slot.correctAnswer ?? '')]));
}

function dbQuestionToChild(question: any): ChildDraftInput {
  const firstSlot = question.answerSlots?.[0];
  const slotType = dbSlotTypeToEditor(firstSlot?.slotType ?? 'NUMBER');
  return {
    type: slotType === 'compare_symbol' ? 'compare' : 'fill_blank',
    stem: question.stem ?? '',
    answer: slotAnswers(question.answerSlots).blank_1 ?? '',
    slotType,
    answers: slotAnswers(question.answerSlots),
    explanationHtml: question.content?.explanationHtml ?? '',
  };
}

export function dbGroupToAppState(group: any): AppState {
  const questions = group.questions ?? [];
  if (group.groupType === 'MENTAL_MATH') {
    return {
      ...defaultState,
      mode: 'calculation',
      title: group.title ?? '',
      gradeLevel: group.gradeLevel ?? defaultState.gradeLevel,
      difficulty: Number(group.difficulty ?? defaultState.difficulty),
      tagsText: Array.isArray(group.tags) ? group.tags.join(',') : '',
      calcColumns: Number(group.content?.columns ?? defaultState.calcColumns),
      calcText: questions.map((q: any) => `${q.stem ?? ''}${Array.isArray(q.answerSlots?.[0]?.correctAnswer) ? q.answerSlots[0].correctAnswer[0] ?? '' : ''}`).join('\n'),
    };
  }

  if (group.groupType === 'COMPOSITE') {
    return {
      ...defaultState,
      mode: 'composite',
      title: group.title ?? '',
      gradeLevel: group.gradeLevel ?? defaultState.gradeLevel,
      difficulty: Number(group.difficulty ?? defaultState.difficulty),
      tagsText: Array.isArray(group.tags) ? group.tags.join(',') : '',
      commonStem: group.commonStem ?? '',
      tableText: tableToCsv(group.content?.table),
      materials: materialInputsFromDb(group),
      children: questions.map(dbQuestionToChild),
    };
  }

  const question = questions[0];
  const firstSlot = question?.answerSlots?.[0];
  const slotType = dbSlotTypeToEditor(firstSlot?.slotType ?? 'NUMBER');
  if (question?.questionType === 'ORDERING') {
    const items = question.content?.items ?? [];
    return { ...defaultState, mode: 'ordering', title: group.title ?? '', gradeLevel: group.gradeLevel ?? defaultState.gradeLevel, difficulty: Number(group.difficulty ?? defaultState.difficulty), tagsText: Array.isArray(group.tags) ? group.tags.join(',') : '', orderingText: items.map((item: any) => `${item.label ?? item.key},${item.value ?? ''}`).join('\n'), orderingAnswer: (firstSlot?.correctAnswer ?? []).join(','), orderingSeparator: (question.content?.separator === '<' ? '<' : '>'), explanationHtml: question.content?.explanationHtml ?? '' };
  }
  if (question?.questionType === 'SENTENCE_BUILD') {
    const tokens = question.content?.tokens ?? [];
    const answerKeys = (firstSlot?.correctAnswer ?? []).map((k: any) => String(k));
    // 按答案顺序还原 token 文本（标点行用 # 前缀）
    const tokenMap = new Map(tokens.map((t: any) => [String(t.key), t]));
    const orderedTokens = answerKeys.map((k: string) => tokenMap.get(k)).filter(Boolean) as any[];
    const fallback = orderedTokens.length ? orderedTokens : tokens;
    return { ...defaultState, mode: 'sentence_build', title: group.title ?? '', gradeLevel: group.gradeLevel ?? defaultState.gradeLevel, difficulty: Number(group.difficulty ?? defaultState.difficulty), tagsText: Array.isArray(group.tags) ? group.tags.join(',') : '', sentenceTokens: fallback.map((t: any) => (t.isPunct && !/[，。！？；、.,!?;:]/.test(String(t.text)) ? `#${t.text}` : String(t.text))).join('\n'), sentenceAnswer: fallback.map((t: any) => String(t.key)).join(','), explanationHtml: question.content?.explanationHtml ?? '' };
  }
  if (question?.questionType === 'MATCHING') {
    const left = question.content?.left ?? [];
    const right = question.content?.right ?? [];
    const matches = firstSlot?.correctAnswer ?? [];
    const rightByKey = Object.fromEntries(right.map((item: any) => [item.key, item.text]));
    const leftByKey = Object.fromEntries(left.map((item: any) => [item.key, item.text]));
    return { ...defaultState, mode: 'matching', title: group.title ?? '', gradeLevel: group.gradeLevel ?? defaultState.gradeLevel, difficulty: Number(group.difficulty ?? defaultState.difficulty), tagsText: Array.isArray(group.tags) ? group.tags.join(',') : '', matchingLeft: left.map((item: any) => item.text).join('\n'), matchingRight: right.map((item: any) => item.text).join('\n'), matchingAnswer: matches.map((m: any) => `${leftByKey[m.left] ?? m.left}=>${rightByKey[m.right] ?? m.right}`).join('\n'), explanationHtml: question.content?.explanationHtml ?? '' };
  }
  if (question?.questionType === 'SINGLE_CHOICE' || question?.questionType === 'MULTIPLE_CHOICE') {
    const options = question.content?.options ?? [];
    const answer = question.answerSlots?.[0]?.correctAnswer ?? [];
    return { ...defaultState, mode: question.questionType === 'MULTIPLE_CHOICE' ? 'multiple_choice' : 'single_choice', title: group.title ?? '', gradeLevel: group.gradeLevel ?? defaultState.gradeLevel, difficulty: Number(group.difficulty ?? defaultState.difficulty), tagsText: Array.isArray(group.tags) ? group.tags.join(',') : '', choiceStem: question.stem ?? '', choiceOptionsText: options.map((item: any) => `${item.key},${item.text}`).join('\n'), choiceAnswer: Array.isArray(answer) ? answer.join(',') : String(answer ?? ''), explanationHtml: question.content?.explanationHtml ?? '' };
  }
  return {
    ...defaultState,
    mode: slotType === 'compare_symbol' ? 'compare' : 'fill_blank',
    title: group.title ?? '',
    gradeLevel: group.gradeLevel ?? defaultState.gradeLevel,
    difficulty: Number(group.difficulty ?? defaultState.difficulty),
    tagsText: Array.isArray(group.tags) ? group.tags.join(',') : '',
    stem: question?.stem ?? '',
    answers: slotAnswers(question?.answerSlots),
    explanationHtml: question?.content?.explanationHtml ?? '',
  };
}

function compactText(value: string, maxLength = 30) {
  const text = value
    .replace(/\{\{blank(?::[^}]+)?\}\}/g, '____')
    .replace(/\{_[0-9]+\}/g, '____')
    .replace(/\s+/g, ' ')
    .trim();
  if (!text) return '';
  return text.length > maxLength ? text.slice(0, maxLength) + '…' : text;
}

function titleForDraft(input: AppState) {
  const explicitTitle = input.title.trim();
  if (explicitTitle) return explicitTitle;
  if (input.mode === 'calculation') return '口算题组';
  if (input.mode === 'composite') return '复合题';
  if (input.mode === 'compare') return compactText(input.stem) || '比较符号题';
  if (input.mode === 'single_choice') return compactText(input.choiceStem) || '单选题';
  if (input.mode === 'multiple_choice') return compactText(input.choiceStem) || '多选题';
  if (input.mode === 'ordering') return '排序题';
  if (input.mode === 'matching') return '连线题';
  if (input.mode === 'sentence_build') {
    // title 优先用第一个词，否则用"连词成句"
    const firstToken = input.sentenceTokens.split('\n').map((l) => l.trim()).filter((l) => l && !l.startsWith('#'))[0];
    return compactText(firstToken || '') ? `连词成句：${firstToken}` : '连词成句';
  }
  return compactText(input.stem) || '填空题';
}

function questionStemTitle(input: AppState, fallback: string) {
  return input.title.trim() || fallback;
}

function childAnswers(child: ChildDraftInput) {
  const keys = blankKeys(child.stem);
  const base = child.answers ?? { blank_1: child.answer };
  return Object.fromEntries(keys.map((key, index) => [key, base[key] ?? (index === 0 ? child.answer : '')]));
}

function explanationPayload(html?: string) {
  const explanationHtml = (html ?? '').trim();
  const explanation = explanationHtml ? richTextToPlainText(explanationHtml) : '';
  return { explanationHtml, explanation };
}

function withExplanation<T extends QuestionDraft>(question: T, html?: string): T {
  const payload = explanationPayload(html);
  if (!payload.explanationHtml) return question;
  return {
    ...question,
    explanation: payload.explanation,
    content: { ...(question.content ?? {}), explanationHtml: payload.explanationHtml, explanationFormat: 'html' },
  };
}

function childToQuestion(child: ChildDraftInput): QuestionDraft {
  return withExplanation(
    { question_type: 'fill_blank', stem: child.stem, answer_slots: makeBlankSlots(child.stem, child.slotType, childAnswers(child)) },
    child.explanationHtml,
  );
}

export function buildDraft(input: AppState) {
  const title = titleForDraft(input);
  const meta = { gradeLevel: input.gradeLevel, difficulty: Number(input.difficulty || 1), tags: input.tagsText.split(/[,，\n]/).map((item) => item.trim()).filter(Boolean) };
  if (input.mode === 'calculation') return { ...meta, type: 'calculation_group', title, columns: input.calcColumns, items: parseCalculationLines(input.calcText) };
  if (input.mode === 'compare') return { ...meta, type: 'question', title, question: withExplanation({ question_type: 'fill_blank' as QuestionType, stem: input.stem, answer_slots: makeBlankSlots(input.stem, 'compare_symbol', input.answers) }, input.explanationHtml) };
  if (input.mode === 'single_choice' || input.mode === 'multiple_choice') { const options = parseChoiceOptions(input.choiceOptionsText); return { ...meta, type: 'question', title, question: withExplanation({ question_type: input.mode as QuestionType, stem: input.choiceStem, content: { options }, answer_slots: [{ slot_key: 'answer', slot_type: 'choice', correct_answer: input.choiceAnswer.split(',').map((sx) => sx.trim()).filter(Boolean) }] }, input.explanationHtml) }; }
  if (input.mode === 'ordering') { const items = input.orderingText.split('\n').filter(Boolean).map((line, i) => { const [label, value] = line.split(','); return { key: label?.trim() || String(i + 1), label: label?.trim() || String(i + 1), value: value?.trim() || '' }; }); return { ...meta, type: 'question', title, question: withExplanation({ question_type: 'ordering' as QuestionType, stem: questionStemTitle(input, '排序题'), content: { items, separator: input.orderingSeparator }, answer_slots: [{ slot_key: 'answer', slot_type: 'order', correct_answer: input.orderingAnswer.split(',').map((sx) => sx.trim()) }] }, input.explanationHtml) }; }
  if (input.mode === 'matching') { const left = input.matchingLeft.split('\n').filter(Boolean).map((text, i) => ({ key: 'L' + (i + 1), text })); const right = input.matchingRight.split('\n').filter(Boolean).map((text, i) => ({ key: 'R' + (i + 1), text })); const matches = input.matchingAnswer.split('\n').filter(Boolean).map((line) => { const [l, r] = line.split('=>').map((sx) => sx.trim()); return { left: left.find((x) => x.text === l)?.key ?? l, right: right.find((x) => x.text === r)?.key ?? r }; }); return { ...meta, type: 'question', title, question: withExplanation({ question_type: 'matching' as QuestionType, stem: questionStemTitle(input, '连线题'), content: { left, right }, answer_slots: [{ slot_key: 'answer', slot_type: 'match', correct_answer: matches }] }, input.explanationHtml) }; }
  if (input.mode === 'sentence_build') {
    const tokens = input.sentenceTokens.split('\n').map((l) => l.trim()).filter(Boolean).map((line, i) => {
      if (line.startsWith('#')) return { key: String(i + 1), text: line.slice(1).trim(), isPunct: true };
      const autoPunct = line.length === 1 && /[，。！？；、.,!?;:]/.test(line);
      return { key: String(i + 1), text: line, isPunct: autoPunct };
    });
    const answerKeys = (input.sentenceAnswer || tokens.map((t) => t.key).join(',')).split(',').map((s) => s.trim()).filter(Boolean);
    return { ...meta, type: 'question', title, question: withExplanation({ question_type: 'sentence_build' as QuestionType, stem: compactText(input.stem) && input.stem !== '____' ? input.stem : '把下面的词连成一句话，注意标点也要排到正确位置。', content: { tokens }, answer_slots: [{ slot_key: 'answer', slot_type: 'order', correct_answer: answerKeys }] }, input.explanationHtml) };
  }
  if (input.mode === 'composite') { const materials = normalizeMaterials(input.materials); const firstText = materials.find((item) => item.type === 'text') as any; const firstTable = materials.find((item) => item.type === 'table') as any; return { ...meta, type: 'composite_group', title, commonStem: firstText?.text ?? input.commonStem, table: firstTable?.table ?? parseTable(input.tableText), materials, children: input.children.map(childToQuestion) }; }
  return { ...meta, type: 'question', title, question: withExplanation({ question_type: 'fill_blank' as QuestionType, stem: input.stem, answer_slots: makeBlankSlots(input.stem, 'number', input.answers) }, input.explanationHtml) };
}

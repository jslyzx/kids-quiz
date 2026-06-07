import { useEffect, useMemo, useState, useRef, type ReactNode } from 'react';
import type { AnswerSlot, QuestionDraft } from '@kids-quiz/shared-types';
import { getPaper } from '../api/papers';
import { getQuestionGroup } from '../api/questionGroups';
import { submitPaperAttempt } from '../api/submissions';
import { StudentDraftPad } from '../components/StudentDraftPad';
import { dbGroupToPreviewDraft, dbQuestionToPreview } from '../utils/dbPreview';
import { renderMathHtml, renderMathText } from '../utils/mathText';
import { applyRewardSnapshot, grantPracticeReward, type RewardGrant } from '../utils/rewards';

type Props = {
  paperId?: string;
  questionGroupId?: string;
  onHome: () => void;
  onFinish?: () => void;
  onRetryWrong?: () => void;
  onContinueQuestionGroup?: (groupId: string) => void;
};

type MatchPair = { left: string; right: string };
type StudentAnswerValue = string | string[] | MatchPair[];
type StudentAnswers = Record<string, StudentAnswerValue>;
type PracticeQuestion = {
  title: string;
  itemId: string;
  questionIndex: number;
  question: QuestionDraft;
  questionId?: string;
  groupId?: string;
  subQuestionLabel?: string;
  commonStem?: string;
  table?: { headers?: string[]; rows?: string[][] };
  materials?: Array<{ type: string; title?: string; text?: string; table?: { headers?: string[]; rows?: string[][] }; url?: string }>;
};

type PracticeResultRecord = {
  title: string;
  stem: string;
  explanationHtml?: string;
  isCorrect: boolean;
  details: Array<{ slotKey: string; studentValue: unknown; correctValue: unknown; studentText: string; correctText: string; isCorrect: boolean }>;
};

type FinishSummary = {
  total: number;
  correct: number;
  wrong: number;
  accuracy: number;
  durationSeconds: number;
  reward?: RewardGrant;
  records: PracticeResultRecord[];
};

function answerKey(itemId: string, questionIndex: number, slotKey: string) {
  return `${itemId}:${questionIndex}:${slotKey}`;
}

function normalize(value: unknown) {
  return String(value ?? '').trim();
}

function normalizePoemText(value: string): string {
  return value.replace(/[\s\p{P}]/gu, '');
}

function isAnswered(value: StudentAnswerValue | undefined) {
  return Array.isArray(value) ? value.length > 0 : normalize(value).length > 0;
}

function formatDuration(seconds: number) {
  const safe = Math.max(0, Math.floor(seconds));
  const minutes = Math.floor(safe / 60);
  const rest = safe % 60;
  return minutes ? `${minutes}\u5206${String(rest).padStart(2, '0')}\u79d2` : `${rest}\u79d2`;
}

function matchKey(value: unknown): string {
  const pair = value as MatchPair;
  return `${pair.left}:${pair.right}`;
}

function isSlotCorrect(slot: AnswerSlot, value: StudentAnswerValue | undefined) {
  const correct = slot.correct_answer ?? [];
  if (slot.slot_type === 'choice' && Array.isArray(value)) {
    return [...value].map(normalize).sort().join(',') === (correct as unknown[]).map(normalize).sort().join(',');
  }
  if (slot.slot_type === 'order') {
    const student = Array.isArray(value) ? value : normalize(value).split(',').map((item) => item.trim()).filter(Boolean);
    const expected = (correct as unknown[]).map(normalize);
    return student.length === expected.length && student.every((item, index) => item === expected[index]);
  }
  if (slot.slot_type === 'match') {
    if (!Array.isArray(value)) return false;
    const student = (value as MatchPair[]).map(matchKey).sort().join('|');
    const expected = (correct as unknown[]).map(matchKey).sort().join('|');
    return student === expected;
  }
  return (correct as unknown[]).some((item) => normalize(item) === normalize(value));
}

function formatAnswerValue(value: unknown): string {
  if (Array.isArray(value)) {
    if (value.every((item) => item && typeof item === 'object' && 'left' in item && 'right' in item)) {
      return (value as MatchPair[]).map((item) => `${item.left}\u2192${item.right}`).join('\u3001') || '-';
    }
    return value.map(formatAnswerValue).join('\u3001') || '-';
  }
  if (value && typeof value === 'object') return JSON.stringify(value);
  return normalize(value) || '-';
}

function formatQuestionAnswer(question: QuestionDraft, value: unknown): string {
  const options = (question.content?.options ?? []) as Array<{ key: string; text: string }>;
  if ((question.question_type === 'single_choice' || question.question_type === 'multiple_choice') && options.length) {
    const keys = Array.isArray(value) ? value.map(normalize) : normalize(value) ? [normalize(value)] : [];
    return keys.map((key) => {
      const option = options.find((item) => item.key === key);
      return option ? `${key}：${option.text}` : key;
    }).join('\u3001') || '-';
  }
  if (question.question_type === 'matching') {
    const left = (question.content?.left ?? []) as Array<{ key: string; text: string }>;
    const right = (question.content?.right ?? []) as Array<{ key: string; text: string }>;
    const leftByKey = Object.fromEntries(left.map((item) => [item.key, item.text]));
    const rightByKey = Object.fromEntries(right.map((item) => [item.key, item.text]));
    const pairs = Array.isArray(value) ? value as MatchPair[] : [];
    return pairs.map((pair) => `${leftByKey[pair.left] ?? pair.left} \u2192 ${rightByKey[pair.right] ?? pair.right}`).join('\u3001') || '-';
  }
  if (question.content?.interaction === 'poem_char_fill') return normalizePoemText(formatAnswerValue(value)) || '-';
  return formatAnswerValue(value);
}

function draftStorageKey(sourceId: string) {
  return `kidsQuiz.playerDraft.${sourceId}`;
}

function readDraftAnswers(sourceId: string): StudentAnswers {
  try {
    const raw = localStorage.getItem(draftStorageKey(sourceId));
    return raw ? JSON.parse(raw) : {};
  } catch {
    return {};
  }
}

function readQuestionPracticeContext() {
  try {
    const raw = localStorage.getItem('kidsQuiz.questionPracticeContext');
    if (!raw) return null;
    const parsed = JSON.parse(raw) as { ids?: string[]; currentId?: string; subject?: string; grade?: string; keyword?: string; savedAt?: number };
    if (!Array.isArray(parsed.ids) || !parsed.ids.length) return null;
    return parsed;
  } catch {
    return null;
  }
}

function questionsFromItem(item: any): PracticeQuestion[] {
  if (item.group) {
    const draft = dbGroupToPreviewDraft(item.group) as any;
    if (draft.type === 'calculation_group') {
      return draft.items.map((calc: any, index: number) => ({
        title: draft.title,
        itemId: String(item.id),
        questionIndex: index,
        questionId: item.group.questions?.[index]?.id ? String(item.group.questions[index].id) : undefined,
        groupId: String(item.group.id),
        subQuestionLabel: draft.items.length > 1 ? `\u5c0f\u9898 ${index + 1}/${draft.items.length}` : undefined,
        question: {
          id: item.group.questions?.[index]?.id ? String(item.group.questions[index].id) : undefined,
          question_type: 'fill_blank',
          stem: `${calc.stem}{{blank:1}}`,
          answer_slots: [{ slot_key: 'blank_1', slot_type: 'number', correct_answer: [calc.answer] }],
        },
      }));
    }
    if (draft.type === 'composite_group') {
      return draft.children.map((question: QuestionDraft, questionIndex: number) => ({
        title: draft.title,
        question,
        itemId: String(item.id),
        questionIndex,
        questionId: question.id,
        groupId: String(item.group.id),
        subQuestionLabel: draft.children.length > 1 ? `\u5c0f\u9898 ${questionIndex + 1}/${draft.children.length}` : undefined,
        commonStem: draft.commonStem,
        table: draft.table,
        materials: draft.materials,
      }));
    }
    if (draft.type === 'question') {
      return [{ title: draft.title, question: draft.question, itemId: String(item.id), questionIndex: 0, questionId: draft.question.id, groupId: String(item.group.id) }];
    }
  }
  if (item.question) return [{ title: item.question.stem, question: dbQuestionToPreview(item.question), itemId: String(item.id), questionIndex: 0, questionId: String(item.question.id), groupId: item.groupId ? String(item.groupId) : undefined }];
  return [];
}


function questionsFromGroup(group: any): PracticeQuestion[] {
  const draft = dbGroupToPreviewDraft(group) as any;
  if (draft.type === 'calculation_group') {
    return draft.items.map((calc: any, index: number) => ({
      title: draft.title,
      itemId: `group-${group.id}`,
      questionIndex: index,
      questionId: group.questions?.[index]?.id ? String(group.questions[index].id) : undefined,
      groupId: String(group.id),
      subQuestionLabel: draft.items.length > 1 ? `\u5c0f\u9898 ${index + 1}/${draft.items.length}` : undefined,
      question: {
        id: group.questions?.[index]?.id ? String(group.questions[index].id) : undefined,
        question_type: 'fill_blank',
        stem: `${calc.stem}{{blank:1}}`,
        answer_slots: [{ slot_key: 'blank_1', slot_type: 'number', correct_answer: [calc.answer] }],
      },
    }));
  }
  if (draft.type === 'composite_group') {
    return draft.children.map((question: QuestionDraft, questionIndex: number) => ({
      title: draft.title,
      question,
      itemId: `group-${group.id}`,
      questionIndex,
      questionId: question.id,
      groupId: String(group.id),
      subQuestionLabel: draft.children.length > 1 ? `\u5c0f\u9898 ${questionIndex + 1}/${draft.children.length}` : undefined,
      commonStem: draft.commonStem,
      table: draft.table,
      materials: draft.materials,
    }));
  }
  if (draft.type === 'question') {
    return [{ title: draft.title, question: draft.question, itemId: `group-${group.id}`, questionIndex: 0, questionId: draft.question.id, groupId: String(group.id) }];
  }
  return [];
}

function MaterialTable({ table }: { table?: { headers?: string[]; rows?: string[][] } }) {
  const headers = table?.headers ?? [];
  const rows = table?.rows ?? [];
  if (!headers.length && !rows.length) return null;
  return <table className="practice-material-table">
    {headers.length > 0 && <thead><tr>{headers.map((header, index) => <th key={`${header}-${index}`}>{renderMathText(header)}</th>)}</tr></thead>}
    <tbody>{rows.map((row, rowIndex) => <tr key={rowIndex}>{row.map((cell, cellIndex) => <td key={`${rowIndex}-${cellIndex}`}>{renderMathText(String(cell ?? ''))}</td>)}</tr>)}</tbody>
  </table>;
}

function PracticeQuestionMaterial({ item }: { item: PracticeQuestion }) {
  if (item.question.content?.interaction === 'poem_char_fill') return null;
  const materials = Array.isArray(item.materials) && item.materials.length
    ? item.materials
    : [
        item.commonStem ? { type: 'text', title: '', text: item.commonStem } : null,
        item.table ? { type: 'table', title: '', table: item.table } : null,
      ].filter(Boolean) as NonNullable<PracticeQuestion['materials']>;
  if (!materials.length) return null;
  return <div className="practice-material">
    <div className="practice-material-tag">{'\u516c\u5171\u9898\u5e72'}</div>
    {materials.map((material, index) => <div className={`playerMaterial playerMaterial-${material.type}`} key={index}>
      {material.title && <b>{renderMathText(material.title)}</b>}
      {material.type === 'text' && material.text && <p>{renderMathText(material.text)}</p>}
      {material.type === 'table' && <MaterialTable table={material.table} />}
      {material.type === 'image' && material.url && <img src={material.url} alt={material.title || '\u9898\u76ee\u6750\u6599'} />}
    </div>)}
  </div>;
}

function BlankInput({ id, slot, value, setAnswer }: { id: string; slot: AnswerSlot; value: StudentAnswerValue | undefined; setAnswer: (id: string, value: StudentAnswerValue) => void }) {
  if (slot.slot_type === 'compare_symbol') {
    const allowed = (slot.answer_rule?.allowed_values as string[] | undefined) ?? ['>', '<', '='];
    return <select className="practice-blank-input" value={normalize(value)} onChange={(event) => setAnswer(id, event.target.value)}>
      <option value="">选择</option>
      {allowed.map((item) => <option value={item} key={item}>{item}</option>)}
    </select>;
  }
  return <input className="practice-blank-input" value={normalize(value)} onChange={(event) => setAnswer(id, event.target.value)} inputMode="text" />;
}

function renderTextWithBlanks(text: string, question: QuestionDraft, itemId: string, questionIndex: number, answers: StudentAnswers, setAnswer: (id: string, value: StudentAnswerValue) => void) {
  const parts: ReactNode[] = [];
  let last = 0;
  const re = /\{\{blank:(\d+)\}\}/g;
  let match: RegExpExecArray | null;
  while ((match = re.exec(text))) {
    if (match.index > last) parts.push(...renderMathText(text.slice(last, match.index)));
    const slotKey = `blank_${match[1]}`;
    const slot = question.answer_slots.find((item) => item.slot_key === slotKey);
    if (slot) {
      const id = answerKey(itemId, questionIndex, slotKey);
      parts.push(<BlankInput key={`${slotKey}-${match.index}`} id={id} slot={slot} value={answers[id]} setAnswer={setAnswer} />);
    }
    last = re.lastIndex;
  }
  if (last < text.length) parts.push(...renderMathText(text.slice(last)));
  return parts;
}

function renderStemWithBlanks(question: QuestionDraft, itemId: string, questionIndex: number, answers: StudentAnswers, setAnswer: (id: string, value: StudentAnswerValue) => void) {
  return renderTextWithBlanks(question.stem, question, itemId, questionIndex, answers, setAnswer);
}

function TableFillQuestion({ question, itemId, questionIndex, answers, setAnswer }: { question: QuestionDraft; itemId: string; questionIndex: number; answers: StudentAnswers; setAnswer: (id: string, value: StudentAnswerValue) => void }) {
  const table = (question.content?.tableFill ?? {}) as { headers?: string[]; rows?: string[][] };
  const headers = table.headers ?? [];
  const rows = table.rows ?? [];
  return <div className="practice-table-fill">
    {question.stem && <div className="practice-stem">{renderMathText(question.stem)}</div>}
    <div className="practice-table-wrap">
      <table className="practice-material-table practice-fill-table">
        {headers.length > 0 && <thead><tr>{headers.map((header, index) => <th key={`${header}-${index}`}>{renderMathText(header)}</th>)}</tr></thead>}
        <tbody>{rows.map((row, rowIndex) => (
          <tr key={rowIndex}>{row.map((cell, cellIndex) => (
            <td key={`${rowIndex}-${cellIndex}`}>{renderTextWithBlanks(String(cell ?? ''), question, itemId, questionIndex, answers, setAnswer)}</td>
          ))}</tr>
        ))}</tbody>
      </table>
    </div>
  </div>;
}

function ChoiceQuestion({ question, id, answers, setAnswer }: { question: QuestionDraft; id: string; answers: StudentAnswers; setAnswer: (id: string, value: StudentAnswerValue) => void }) {
  const options = (question.content?.options ?? []) as Array<{ key: string; text: string }>;
  const current = answers[id];
  const values: string[] = Array.isArray(current) ? current.filter((item): item is string => typeof item === 'string') : normalize(current) ? [normalize(current)] : [];
  const toggle = (key: string) => {
    if (question.question_type === 'single_choice') setAnswer(id, key);
    else setAnswer(id, values.includes(key) ? values.filter((item) => item !== key) : [...values, key]);
  };
  return <div className="practice-options">
    {options.map((option) => <button className={`practice-option ${values.includes(option.key) ? 'selected' : ''}`} key={option.key} onClick={() => toggle(option.key)}>
      <span className="practice-option-key">{option.key}</span><b>{renderMathText(option.text)}</b>
    </button>)}
  </div>;
}

function MatchingQuestion({ question, id, answers, setAnswer }: { question: QuestionDraft; id: string; answers: StudentAnswers; setAnswer: (id: string, value: StudentAnswerValue) => void }) {
  const left = (question.content?.left ?? []) as Array<{ key: string; text: string }>;
  const right = (question.content?.right ?? []) as Array<{ key: string; text: string }>;
  const pairs = Array.isArray(answers[id]) ? (answers[id] as MatchPair[]) : [];
  const [selectedLeft, setSelectedLeft] = useState<string | null>(null);

  const containerRef = useRef<HTMLDivElement | null>(null);
  const [coords, setCoords] = useState<Array<{ fromX: number; fromY: number; toX: number; toY: number; key: string }>>([]);
  const [pointerPos, setPointerPos] = useState<{ x: number; y: number } | null>(null);

  const pairedLeft = new Set(pairs.map((item) => item.left));
  const pairedRight = new Set(pairs.map((item) => item.right));

  const handleLeftClick = (key: string) => {
    if (pairedLeft.has(key)) {
      setAnswer(id, pairs.filter((item) => item.left !== key));
      setSelectedLeft(null);
    } else {
      setSelectedLeft(key === selectedLeft ? null : key);
    }
  };

  const handleRightClick = (key: string) => {
    if (pairedRight.has(key)) {
      setAnswer(id, pairs.filter((item) => item.right !== key));
      setSelectedLeft(null);
    } else if (selectedLeft) {
      setAnswer(id, [...pairs.filter((item) => item.left !== selectedLeft && item.right !== key), { left: selectedLeft, right: key }]);
      setSelectedLeft(null);
    }
  };

  const updateCoords = () => {
    const container = containerRef.current;
    if (!container) return;
    const containerRect = container.getBoundingClientRect();

    const nextCoords = pairs.map((pair) => {
      const leftEl = container.querySelector(`[data-left-key="${pair.left}"]`);
      const rightEl = container.querySelector(`[data-right-key="${pair.right}"]`);
      if (!leftEl || !rightEl) return null;

      const leftRect = leftEl.getBoundingClientRect();
      const rightRect = rightEl.getBoundingClientRect();

      const fromX = leftRect.right - containerRect.left;
      const fromY = leftRect.top + leftRect.height / 2 - containerRect.top;

      const toX = rightRect.left - containerRect.left;
      const toY = rightRect.top + rightRect.height / 2 - containerRect.top;

      return { fromX, fromY, toX, toY, key: `${pair.left}-${pair.right}` };
    }).filter((item): item is NonNullable<typeof item> => item !== null);

    setCoords(nextCoords);
  };

  useEffect(() => {
    updateCoords();
    const timer = setTimeout(updateCoords, 100);
    return () => clearTimeout(timer);
  }, [pairs, question]);

  useEffect(() => {
    window.addEventListener('resize', updateCoords);
    return () => window.removeEventListener('resize', updateCoords);
  }, [pairs]);

  const activeStartPos = useMemo(() => {
    if (!selectedLeft) return null;
    const container = containerRef.current;
    if (!container) return null;
    const leftEl = container.querySelector(`[data-left-key="${selectedLeft}"]`);
    if (!leftEl) return null;
    const containerRect = container.getBoundingClientRect();
    const leftRect = leftEl.getBoundingClientRect();
    return {
      x: leftRect.right - containerRect.left,
      y: leftRect.top + leftRect.height / 2 - containerRect.top
    };
  }, [selectedLeft]);

  const handlePointerMove = (event: React.PointerEvent) => {
    if (!selectedLeft) return;
    const container = containerRef.current;
    if (!container) return;
    const containerRect = container.getBoundingClientRect();
    setPointerPos({
      x: event.clientX - containerRect.left,
      y: event.clientY - containerRect.top,
    });
  };

  const handlePointerLeave = () => {
    setPointerPos(null);
  };

  return (
    <div 
      ref={containerRef} 
      className="practice-match" 
      onPointerMove={handlePointerMove}
      onPointerLeave={handlePointerLeave}
    >
      <svg className="practice-match-lines">
        {coords.map((c) => {
          const d = `M ${c.fromX} ${c.fromY} C ${(c.fromX + c.toX) / 2} ${c.fromY}, ${(c.fromX + c.toX) / 2} ${c.toY}, ${c.toX} ${c.toY}`;
          return (
            <path
              key={c.key}
              d={d}
              stroke="var(--color-success)"
              strokeWidth="4"
              strokeLinecap="round"
              fill="none"
            />
          );
        })}
        {activeStartPos && pointerPos && (
          <path
            d={`M ${activeStartPos.x} ${activeStartPos.y} C ${(activeStartPos.x + pointerPos.x) / 2} ${activeStartPos.y}, ${(activeStartPos.x + pointerPos.x) / 2} ${pointerPos.y}, ${pointerPos.x} ${pointerPos.y}`}
            stroke="var(--color-primary)"
            strokeWidth="3"
            strokeDasharray="6,4"
            strokeLinecap="round"
            fill="none"
          />
        )}
      </svg>

      <div className="practice-match-board">
        <div className="practice-match-col">
          {left.map((item) => (
            <button 
              key={item.key} 
              data-left-key={item.key}
              className={`${selectedLeft === item.key ? 'selected' : ''} ${pairedLeft.has(item.key) ? 'paired' : ''}`} 
              onClick={() => handleLeftClick(item.key)}
            >
              {renderMathText(item.text)}
            </button>
          ))}
        </div>

        <div className="practice-match-col">
          {right.map((item) => (
            <button 
              key={item.key} 
              data-right-key={item.key}
              className={`${pairedRight.has(item.key) ? 'paired' : ''}`} 
              onClick={() => handleRightClick(item.key)}
            >
              {renderMathText(item.text)}
            </button>
          ))}
        </div>
      </div>

      <div className="practice-match-tools">
        {pairs.length === 0 ? (
          <span>请点击左边，再点击右边连线<br/>已连线按钮点按可断开</span>
        ) : (
          <span>已连线 {pairs.length} 对</span>
        )}
        {pairs.length > 0 && (
          <button 
            className="btn btn-secondary btn-sm" 
            style={{ marginTop: 'var(--space-3)', pointerEvents: 'auto' }} 
            onClick={() => { setAnswer(id, []); setSelectedLeft(null); }}
          >
            重置连线
          </button>
        )}
      </div>
    </div>
  );
}

function PoemCharFillQuestion({ question, id, answers, setAnswer }: { question: QuestionDraft; id: string; answers: StudentAnswers; setAnswer: (id: string, value: StudentAnswerValue) => void }) {
  const slot = question.answer_slots[0];
  const poem = (question.content?.poem ?? {}) as { title?: string; author?: string; dynasty?: string; lines?: string[] };
  const lines = Array.isArray(poem.lines) ? poem.lines : [];
  const answerText = normalizePoemText(String((slot?.correct_answer as unknown[])?.[0] ?? lines.join('')));
  const chars = Array.from(answerText);
  const picked = Array.from(normalizePoemText(normalize(answers[id])));
  const pool = Array.isArray(question.content?.charPool) ? question.content?.charPool as string[] : chars;
  const used = new Array(pool.length).fill(false);
  picked.forEach((ch) => {
    const idx = pool.findIndex((item, index) => item === ch && !used[index]);
    if (idx >= 0) used[idx] = true;
  });
  const append = (ch: string, index: number) => {
    if (used[index] || picked.length >= chars.length) return;
    setAnswer(id, `${picked.join('')}${ch}`);
  };
  let cursor = 0;
  return <div className="practice-poem">
    <h2>{poem.title || '古诗填空'}</h2>
    <p className="practice-poem-author">{[poem.dynasty, poem.author].filter(Boolean).join(' \u00b7 ')}</p>
    <div className="practice-poem-lines">
      {lines.map((line, lineIndex) => {
        const punct = line.match(/[，。！？；,.!?;]$/)?.[0] ?? '';
        const pure = Array.from(normalizePoemText(line));
        const start = cursor;
        cursor += pure.length;
        return <div key={lineIndex}>{pure.map((_, index) => <span key={index}>{picked[start + index] || ''}</span>)}{punct && <b>{punct}</b>}</div>;
      })}
    </div>
    <div className="practice-poem-actions"><button className="btn btn-secondary btn-sm" onClick={() => setAnswer(id, picked.slice(0, -1).join(''))}>删除</button><button className="btn btn-secondary btn-sm" onClick={() => setAnswer(id, '')}>重置</button></div>
    <div className="practice-char-pool">{pool.map((ch, index) => <button className={`btn btn-secondary ${used[index] ? 'used' : ''}`} key={`${ch}-${index}`} onClick={() => append(ch, index)}>{ch}</button>)}</div>
  </div>;
}

function CurrentQuestion({ item, answers, setAnswer }: { item: PracticeQuestion; answers: StudentAnswers; setAnswer: (id: string, value: StudentAnswerValue) => void }) {
  const { question, itemId, questionIndex } = item;
  const slot = question.answer_slots[0];
  const id = answerKey(itemId, questionIndex, slot?.slot_key || 'answer');
  if (question.content?.interaction === 'poem_char_fill') return <PoemCharFillQuestion question={question} id={id} answers={answers} setAnswer={setAnswer} />;
  if (question.content?.tableFill) return <TableFillQuestion question={question} itemId={itemId} questionIndex={questionIndex} answers={answers} setAnswer={setAnswer} />;
  return <>
    <div className="practice-stem">{question.question_type === 'fill_blank' ? renderStemWithBlanks(question, itemId, questionIndex, answers, setAnswer) : renderMathText(question.stem)}</div>
    {(question.question_type === 'single_choice' || question.question_type === 'multiple_choice') && <ChoiceQuestion question={question} id={id} answers={answers} setAnswer={setAnswer} />}
    {question.question_type === 'ordering' && <input className="practice-wide-input" value={normalize(answers[id])} onChange={(event) => setAnswer(id, event.target.value)} placeholder="按顺序填写序号，例如：①,②,③" />}
    {question.question_type === 'matching' && <MatchingQuestion question={question} id={id} answers={answers} setAnswer={setAnswer} />}
  </>;
}

function questionAnswered(item: PracticeQuestion, answers: StudentAnswers) {
  return item.question.answer_slots.every((slot) => isAnswered(answers[answerKey(item.itemId, item.questionIndex, slot.slot_key)]));
}

export function StudentPracticePlayerPage({ paperId, questionGroupId, onHome, onRetryWrong, onContinueQuestionGroup }: Props) {
  const sourceId = paperId ? `paper.${paperId}` : `group.${questionGroupId}`;
  const [paper, setPaper] = useState<any>(null);
  const [group, setGroup] = useState<any>(null);
  const [answers, setAnswers] = useState<StudentAnswers>(() => readDraftAnswers(sourceId));
  const [index, setIndex] = useState(0);
  const [message, setMessage] = useState('');
  const [startedAt, setStartedAt] = useState(() => Date.now());
  const [now, setNow] = useState(() => Date.now());
  const [draftOpen, setDraftOpen] = useState(false);
  const [summary, setSummary] = useState<FinishSummary | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const questions = useMemo<PracticeQuestion[]>(() => paper ? (paper?.items || []).flatMap(questionsFromItem) : group ? questionsFromGroup(group) : [], [paper, group]);
  const current = questions[index];
  const answeredCount = questions.filter((item) => questionAnswered(item, answers)).length;
  const progress = questions.length ? Math.round((answeredCount / questions.length) * 100) : 0;
  const practiceContext = useMemo(() => !paperId ? readQuestionPracticeContext() : null, [paperId, questionGroupId]);
  const nextGroupId = useMemo(() => {
    if (!questionGroupId || !practiceContext?.ids?.length) return null;
    const pos = practiceContext.ids.findIndex((id) => String(id) === String(questionGroupId));
    if (pos < 0) return null;
    return practiceContext.ids[pos + 1] || null;
  }, [questionGroupId, practiceContext]);

  useEffect(() => {
    setAnswers(readDraftAnswers(sourceId));
    setIndex(0);
    setMessage('');
    setDraftOpen(false);
    setSummary(null);
    setStartedAt(Date.now());
  }, [sourceId]);

  useEffect(() => {
    if (paperId) {
      getPaper(paperId).then((data) => { setPaper(data); setGroup(null); }).catch((error) => setMessage(`加载失败：${error instanceof Error ? error.message : String(error)}`));
    } else if (questionGroupId) {
      getQuestionGroup(questionGroupId).then((data) => { setGroup(data); setPaper(null); }).catch((error) => setMessage(`加载失败：${error instanceof Error ? error.message : String(error)}`));
    }
  }, [paperId, questionGroupId]);

  useEffect(() => {
    const timer = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(timer);
  }, []);

  useEffect(() => {
    localStorage.setItem(draftStorageKey(sourceId), JSON.stringify(answers));
  }, [answers, sourceId]);

  const setAnswer = (id: string, value: StudentAnswerValue) => {
    setAnswers((prev) => ({ ...prev, [id]: value }));
    setMessage('');
  };

  const next = () => {
    if (!current) return;
    if (!questionAnswered(current, answers)) {
      setMessage('这一题还没有完成哦，先答完再继续。');
      return;
    }
    setDraftOpen(false);
    setIndex((value) => Math.min(value + 1, questions.length - 1));
    setMessage('');
  };

  const finish = async () => {
    if (!questions.length) return;
    const firstMissing = questions.findIndex((item) => !questionAnswered(item, answers));
    if (firstMissing >= 0) {
      setIndex(firstMissing);
      setMessage('还有题目没完成，先补完这一题。');
      return;
    }
    const nextResults: Record<string, boolean> = {};
    let total = 0;
    let correct = 0;
    const durationSeconds = Math.floor((Date.now() - startedAt) / 1000);
    const records = questions.map(({ title, question, itemId, questionIndex, questionId, groupId }) => {
      const details = question.answer_slots.map((slot) => {
        const key = answerKey(itemId, questionIndex, slot.slot_key);
        const ok = isSlotCorrect(slot, answers[key]);
        nextResults[key] = ok;
        total += 1;
        if (ok) correct += 1;
        return {
          slotKey: slot.slot_key,
          studentValue: answers[key] ?? '',
          correctValue: slot.correct_answer,
          studentText: formatQuestionAnswer(question, answers[key] ?? ''),
          correctText: formatQuestionAnswer(question, slot.correct_answer),
          isCorrect: ok,
          score: ok ? 1 : 0,
        };
      });
      return {
        questionId,
        groupId,
        answerData: Object.fromEntries(details.map((detail) => [detail.slotKey, detail.studentValue])),
        correctData: Object.fromEntries(details.map((detail) => [detail.slotKey, detail.correctValue])),
        isCorrect: details.length > 0 && details.every((detail) => detail.isCorrect),
        score: details.filter((detail) => detail.isCorrect).length,
        maxScore: details.length || 1,
        details,
        title,
        stem: question.stem,
        explanationHtml: typeof question.content?.explanationHtml === 'string' ? question.content.explanationHtml : undefined,
      };
    });
    const accuracy = total ? Math.round((correct / total) * 100) : 0;
    let reward: RewardGrant | undefined;
    try {
      setSubmitting(true);
      if (paperId) {
        const saved = await submitPaperAttempt({ paperId, studentName: localStorage.getItem('kidsQuiz.studentName') || '小朋友', avatarUrl: localStorage.getItem('kidsQuiz.avatarUrl') || undefined, durationSeconds, answers: records.filter((record) => record.questionId) });
        if (saved.reward) {
          reward = saved.reward;
          applyRewardSnapshot(saved.reward);
        }
      }
      localStorage.removeItem(draftStorageKey(sourceId));
    } catch {
      reward = grantPracticeReward({ accuracy, correct, total });
    } finally {
      setSubmitting(false);
    }
    if (!reward) reward = grantPracticeReward({ accuracy, correct, total });
    setSummary({ total, correct, wrong: total - correct, accuracy, durationSeconds, reward, records });
  };

  if (summary) {
    const wrongRecords = summary.records.filter((record) => !record.isCorrect);
    const explanationCount = wrongRecords.filter((record) => record.explanationHtml).length;
    return <div className="practice-layout">
    <div className="practice-result">
      <div className="result-emoji">{summary.accuracy >= 90 ? '🌟' : summary.accuracy >= 70 ? '👍' : '💪'}</div>
      <h1>{summary.accuracy >= 90 ? '太棒啦！' : '完成练习啦！'}</h1>
      <p>答对 {summary.correct} / {summary.total}，正确率 {summary.accuracy}%</p>
      <div className="result-stats">
        <div className="result-stat"><b>{summary.reward?.stars ?? 0}</b><span>获得星星</span></div>
        <div className="result-stat"><b>{formatDuration(summary.durationSeconds)}</b><span>用时</span></div>
        <div className="result-stat"><b>{summary.wrong}</b><span>错题</span></div>
      </div>
      <div className="result-actions">
        {nextGroupId && onContinueQuestionGroup && <button className="btn btn-accent" onClick={() => onContinueQuestionGroup(nextGroupId)}>继续练同类题</button>}
        <button className="btn btn-primary" onClick={onHome}>回到首页</button>
        {summary.wrong > 0 && onRetryWrong && <button className="btn btn-secondary" onClick={onRetryWrong}>错题重练</button>}
      </div>
      <div className="result-review" id="result-review">
        <div className="result-review-header">
          <b>{summary.wrong ? '\u9519\u9898\u548c\u7b54\u6848' : '\u7b54\u6848\u56de\u987e'}</b>
          <span>{summary.wrong ? `还有 ${summary.wrong} 处需要再看看${explanationCount ? `，其中 ${explanationCount} 题有解析` : ''}` : '\u5168\u90e8\u7b54\u5bf9\uff0c\u53ef\u4ee5\u5feb\u901f\u56de\u987e\u4e00\u4e0b'}</span>
        </div>
        {(wrongRecords.length ? wrongRecords : summary.records).map((record, recordIndex) => <div className={`result-answer-card ${record.isCorrect ? 'ok' : 'wrong'}`} key={`${record.title}-${recordIndex}`}>
          <div className="result-answer-head"><b>{recordIndex + 1}. {renderMathText(record.title)}</b><em>{record.isCorrect ? '\u5df2\u7b54\u5bf9' : '\u9700\u590d\u4e60'}</em></div>
          <p>{renderMathText(record.stem.replace(/\{\{blank:\d+\}\}/g, '\u25A1'))}</p>
          <div className="result-answer-rows">
            {record.details.map((detail) => <div className={`result-answer-row ${detail.isCorrect ? 'ok' : 'wrong'}`} key={detail.slotKey}>
              <span>{detail.slotKey.startsWith('blank_') ? `第${detail.slotKey.replace('blank_', '')}空` : '答案'}</span>
              <strong>{'\u4f60\u5199\u7684'}：{renderMathText(detail.studentText)}</strong>
              <strong>{'\u6b63\u786e\u7b54\u6848'}：{renderMathText(detail.correctText)}</strong>
            </div>)}
          </div>
          {!record.isCorrect && record.explanationHtml && (
            <div className="question-explanation">
              <div className="question-explanation-title">💡 解题解析</div>
              <div dangerouslySetInnerHTML={{ __html: renderMathHtml(record.explanationHtml) }} />
              <div className="explanation-actions">
                <button className="btn btn-soft btn-sm" type="button" onClick={(event) => { event.currentTarget.textContent = '已标记懂了'; event.currentTarget.disabled = true; }}>我懂了</button>
                {onRetryWrong && <button className="btn btn-outline btn-sm" type="button" onClick={onRetryWrong}>再练错题</button>}
              </div>
            </div>
          )}
        </div>)}
      </div>
    </div>
  </div>;
  }

  return <div className="practice-layout">
    <div className="practice-topbar">
      <div className="practice-progress-info">
        <b className="practice-title">{paper?.title || group?.title || '练习'}</b>
        {!paperId && <div className="practice-source-pills">
          {practiceContext?.subject && <em className="practice-source-pill">{practiceContext.subject}</em>}
          {practiceContext?.grade && <em className="practice-source-pill">{practiceContext.grade}</em>}
          {practiceContext?.keyword && <em className="practice-source-pill">{practiceContext.keyword}</em>}
          {nextGroupId && <em className="practice-source-pill">完成后可继续同类题</em>}
        </div>}
        <span className="practice-status">第 {questions.length ? index + 1 : 0} / {questions.length} 题 · 已完成 {answeredCount} 题 · 用时 {formatDuration(Math.floor((now - startedAt) / 1000))}</span>
        <i className="practice-progress-track"><em className="practice-progress-fill" style={{ width: `${progress}%` }} /></i>
      </div>
    </div>

    <main className="practice-stage">
      <section className="practice-question-card">
        {current ? <>
          <div className="practice-question-meta">
            <span className="practice-meta-title">{renderMathText(current.title)}{current.subQuestionLabel && <em className="sub-question-badge">{current.subQuestionLabel}</em>}</span>
            <div className="practice-question-status">
              <button className={`practice-draft-btn ${draftOpen ? 'active' : ''}`} title={draftOpen ? '\u6536\u8d77\u8349\u7a3f' : '\u6253\u5f00\u8349\u7a3f'} aria-label={draftOpen ? '\u6536\u8d77\u8349\u7a3f' : '\u6253\u5f00\u8349\u7a3f'} onClick={() => setDraftOpen((value) => !value)}>
                {draftOpen ? <span>{'\u2715'}</span> : <svg viewBox="0 0 24 24" aria-hidden="true">
                  <path d="M5 19h14" />
                  <path d="M7 15.5 15.8 6.7a1.8 1.8 0 0 1 2.55 0l.95.95a1.8 1.8 0 0 1 0 2.55L10.5 19H7v-3.5Z" />
                  <path d="m14.7 7.8 2.5 2.5" />
                </svg>}
              </button>
              <b>{questionAnswered(current, answers) ? '已完成' : '待作答'}</b>
            </div>
          </div>
          <PracticeQuestionMaterial item={current} />
          <CurrentQuestion item={current} answers={answers} setAnswer={setAnswer} />
        </> : <p className="tip">这套练习还没有题目。</p>}
      </section>
    </main>

    {current && <StudentDraftPad storageKey={`kidsQuiz.playerQuestionDraft.${sourceId}.${current.itemId}.${current.questionIndex}`} open={draftOpen} onClose={() => setDraftOpen(false)} inline />}

    {message && <div className="toast">{message}</div>}

    <footer className="practice-bottombar">
      <button className="btn btn-secondary" disabled={index <= 0} onClick={() => { setDraftOpen(false); setIndex((value) => Math.max(0, value - 1)); }}>上一题</button>
      <div className="practice-dots">{questions.map((item, dotIndex) => <button key={`${item.itemId}-${item.questionIndex}`} className={`practice-dot ${dotIndex === index ? 'active' : ''} ${questionAnswered(item, answers) ? 'done' : ''}`} onClick={() => { setDraftOpen(false); setIndex(dotIndex); }}>{dotIndex + 1}</button>)}</div>
      {index >= questions.length - 1 ? <button className="btn btn-primary" onClick={finish} disabled={submitting || !questions.length}>{submitting ? '提交中...' : '完成练习'}</button> : <button className="btn btn-primary" onClick={next}>下一题</button>}
    </footer>
  </div>;
}

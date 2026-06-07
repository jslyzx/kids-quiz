import { useEffect, useMemo, useState, type ReactNode } from 'react';
import type { AnswerSlot, QuestionDraft, TableMaterial } from '@kids-quiz/shared-types';
import { getPaper } from '../api/papers';
import { submitPaperAttempt } from '../api/submissions';
import { saveStudentProfile as saveStudentProfileApi } from '../api/student';
import { StudentDraftPad } from '../components/StudentDraftPad';
import { dbGroupToPreviewDraft, dbQuestionToPreview } from '../utils/dbPreview';
import { renderMathText } from '../utils/mathText';
import { applyRewardSnapshot, badgeLabels, grantPracticeReward, type RewardGrant } from '../utils/rewards';

type Props = {
  paperId: string;
  onBack: () => void;
  onEdit: () => void;
  onHome?: () => void;
  onRetryWrong?: () => void;
  onTaskCenter?: () => void;
};

type MatchPair = { left: string; right: string };
type StudentAnswerValue = string | string[] | MatchPair[];
type StudentAnswers = Record<string, StudentAnswerValue>;
type CheckResult = Record<string, boolean>;
type WrongDetail = { title: string; slotKey: string; studentValue: unknown; correctValue: unknown };
type MissingDetail = { id: string; title: string; slotKey: string };
type SubmitSummary = { total: number; correct: number; wrong: number; accuracy: number; savedCount: number; durationSeconds: number; reward?: RewardGrant; wrongDetails: WrongDetail[] };
type PaperQuestionRef = { title: string; question: QuestionDraft; itemId: string; questionIndex: number; questionId?: string; groupId?: string };

function answerKey(itemId: string, questionIndex: number, slotKey: string) {
  return `${itemId}:${questionIndex}:${slotKey}`;
}

function normalize(value: unknown) {
  return String(value ?? '').trim();
}

function displayValue(value: unknown): string {
  if (Array.isArray(value)) return value.map(displayValue).join(', ');
  if (value && typeof value === 'object') return JSON.stringify(value);
  return normalize(value) || '未填写';
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
  return minutes ? `${minutes}分${String(rest).padStart(2, '0')}秒` : `${rest}秒`;
}

function formatSavedAt(value?: string) {
  if (!value) return '尚未保存';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '尚未保存';
  return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' });
}

function draftStorageKey(paperId: string) {
  return `kidsQuiz.paperDraft.${paperId}`;
}

function draftMetaStorageKey(paperId: string) {
  return `kidsQuiz.paperDraftMeta.${paperId}`;
}

function readDraftAnswers(paperId: string): StudentAnswers {
  try {
    const raw = localStorage.getItem(draftStorageKey(paperId));
    return raw ? JSON.parse(raw) : {};
  } catch {
    return {};
  }
}

function readDraftSavedAt(paperId: string): string | undefined {
  try {
    const raw = localStorage.getItem(draftMetaStorageKey(paperId));
    if (!raw) return undefined;
    const parsed = JSON.parse(raw) as { savedAt?: string };
    return parsed.savedAt;
  } catch {
    return undefined;
  }
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

function MaterialTable({ table }: { table?: TableMaterial }) {
  if (!table) return null;
  return <table className="kq-table">
    <thead><tr>{table.headers.map((header) => <th key={header}>{header}</th>)}</tr></thead>
    <tbody>{table.rows.map((row, rowIndex) => <tr key={rowIndex}>{row.map((cell, cellIndex) => <td key={cellIndex}>{cell}</td>)}</tr>)}</tbody>
  </table>;
}

function Materials({ draft }: { draft: any }) {
  const materials = Array.isArray(draft.materials) && draft.materials.length ? draft.materials : [
    draft.commonStem ? { type: 'text', text: draft.commonStem } : null,
    draft.table ? { type: 'table', table: draft.table } : null,
  ].filter(Boolean);

  return <>{materials.map((material: any, index: number) => <div className="kq-material" key={index}>
    {material.title && <div className="kq-material-title">{material.title}</div>}
    {material.type === 'text' && <div className="kq-stem kq-common">{material.text}</div>}
    {material.type === 'table' && <MaterialTable table={material.table} />}
    {material.type === 'image' && material.url && <img className="kq-material-image" src={material.url} alt={material.title || '题目材料'} />}
  </div>)}</>;
}

function BlankInput({ id, slot, answers, results, setAnswer }: { id: string; slot: AnswerSlot; answers: StudentAnswers; results: CheckResult | null; setAnswer: (id: string, value: StudentAnswerValue) => void }) {
  const resultClass = results ? (results[id] ? 'correct' : 'wrong') : '';
  const missingClass = !results && !isAnswered(answers[id]) ? 'missing' : '';
  if (slot.slot_type === 'compare_symbol') {
    const allowed = (slot.answer_rule?.allowed_values as string[] | undefined) ?? ['>', '<', '='];
    return <select data-answer-id={id} className={`studentBlank ${resultClass} ${missingClass}`} value={normalize(answers[id])} onChange={(event) => setAnswer(id, event.target.value)}>
      <option value="">选择</option>
      {allowed.map((value) => <option key={value} value={value}>{value}</option>)}
    </select>;
  }
  return <input data-answer-id={id} className={`studentBlank ${resultClass} ${missingClass}`} value={normalize(answers[id])} onChange={(event) => setAnswer(id, event.target.value)} placeholder="填写答案" />;
}

function renderTextWithBlanks(text: string, question: QuestionDraft, itemId: string, questionIndex: number, answers: StudentAnswers, results: CheckResult | null, setAnswer: (id: string, value: StudentAnswerValue) => void) {
  const parts: ReactNode[] = [];
  let last = 0;
  const re = /\{\{blank:(\d+)\}\}/g;
  let match: RegExpExecArray | null;
  while ((match = re.exec(text))) {
    if (match.index > last) parts.push(...renderMathText(text.slice(last, match.index)));
    const slotKey = `blank_${match[1]}`;
    const slot = question.answer_slots.find((item) => item.slot_key === slotKey);
    if (slot) parts.push(<BlankInput key={`${slotKey}-${match.index}`} id={answerKey(itemId, questionIndex, slotKey)} slot={slot} answers={answers} results={results} setAnswer={setAnswer} />);
    last = re.lastIndex;
  }
  if (last < text.length) parts.push(...renderMathText(text.slice(last)));
  return parts;
}

function renderStem(question: QuestionDraft, itemId: string, questionIndex: number, answers: StudentAnswers, results: CheckResult | null, setAnswer: (id: string, value: StudentAnswerValue) => void) {
  return renderTextWithBlanks(question.stem, question, itemId, questionIndex, answers, results, setAnswer);
}

function TableFillQuestion({ question, itemId, questionIndex, answers, results, setAnswer }: { question: QuestionDraft; itemId: string; questionIndex: number; answers: StudentAnswers; results: CheckResult | null; setAnswer: (id: string, value: StudentAnswerValue) => void }) {
  const table = (question.content?.tableFill ?? {}) as { headers?: string[]; rows?: string[][] };
  const headers = table.headers ?? [];
  const rows = table.rows ?? [];
  return <div className="studentQuestion">
    {question.stem && <div className="kq-stem">{renderMathText(question.stem)}</div>}
    <div className="practice-table-wrap">
      <table className="practice-material-table practice-fill-table">
        {headers.length > 0 && <thead><tr>{headers.map((header, index) => <th key={`${header}-${index}`}>{renderMathText(header)}</th>)}</tr></thead>}
        <tbody>{rows.map((row, rowIndex) => (
          <tr key={rowIndex}>{row.map((cell, cellIndex) => <td key={`${rowIndex}-${cellIndex}`}>{renderTextWithBlanks(String(cell ?? ''), question, itemId, questionIndex, answers, results, setAnswer)}</td>)}</tr>
        ))}</tbody>
      </table>
    </div>
  </div>;
}

function PoemCharFillQuestion({ question, itemId, questionIndex, answers, results, setAnswer }: { question: QuestionDraft; itemId: string; questionIndex: number; answers: StudentAnswers; results: CheckResult | null; setAnswer: (id: string, value: StudentAnswerValue) => void }) {
  const slot = question.answer_slots[0];
  const id = answerKey(itemId, questionIndex, slot?.slot_key || 'answer');
  const poem = (question.content?.poem ?? {}) as { title?: string; author?: string; dynasty?: string; lines?: string[] };
  const lines = Array.isArray(poem.lines) ? poem.lines : [];
  const answerText = normalizePoemText(String((slot?.correct_answer as unknown[])?.[0] ?? lines.join('')));
  const chars = Array.from(answerText);
  const value = normalizePoemText(normalize(answers[id]));
  const picked = Array.from(value);
  const resultClass = results ? (results[id] ? 'correct' : 'wrong') : '';
  const missingClass = !results && !isAnswered(answers[id]) ? 'missing' : '';
  const pool = Array.isArray(question.content?.charPool) ? question.content?.charPool as string[] : chars;
  const used = new Array(pool.length).fill(false);
  picked.forEach((ch) => {
    const idx = pool.findIndex((item, index) => item === ch && !used[index]);
    if (idx >= 0) used[idx] = true;
  });
  const append = (ch: string, index: number) => {
    if (used[index] || picked.length >= chars.length) return;
    setAnswer(id, `${value}${ch}`);
  };
  const removeLast = () => setAnswer(id, picked.slice(0, -1).join(''));
  const cursorByLine: Array<{ chars: string[]; punct: string; start: number }> = [];
  let cursor = 0;
  lines.forEach((line) => {
    const punct = (line.match(/[，。！？；,.!?;]$/)?.[0]) ?? '';
    const pure = Array.from(normalizePoemText(line));
    cursorByLine.push({ chars: pure, punct, start: cursor });
    cursor += pure.length;
  });

  return <div className="studentQuestion poemFillQuestion">
    <div className="poemTitle">{poem.title || question.stem}</div>
    <div className="poemAuthor">{[poem.dynasty, poem.author].filter(Boolean).join('·')}</div>
    <div className={`poemSlotLines ${resultClass} ${missingClass}`} data-answer-id={id}>
      {cursorByLine.map((row, rowIndex) => <div className="poemSlotLine" key={rowIndex}>
        {row.chars.map((_, charIndex) => {
          const globalIndex = row.start + charIndex;
          const ch = picked[globalIndex] || '';
          const wrong = ch && ch !== chars[globalIndex];
          return <span className={wrong ? 'wrongChar' : ''} key={globalIndex}>{ch || ''}</span>;
        })}
        {row.punct && <b>{row.punct}</b>}
      </div>)}
    </div>
    <div className="poemActions"><button onClick={removeLast} disabled={!picked.length}>删除</button><button onClick={() => setAnswer(id, '')}>重置</button></div>
    <div className="poemCharPool">{pool.map((ch, index) => <button className={used[index] ? 'used' : ''} key={`${ch}-${index}`} onClick={() => append(ch, index)}>{ch}</button>)}</div>
    {results && <p className={results[id] ? 'resultOk' : 'resultBad'}>{results[id] ? '回答正确' : '顺序不对，再读一遍古诗试试'}</p>}
  </div>;
}

function MatchingQuestion({ question, id, answers, results, setAnswer }: { question: QuestionDraft; id: string; answers: StudentAnswers; results: CheckResult | null; setAnswer: (id: string, value: StudentAnswerValue) => void }) {
  const left = (question.content?.left ?? []) as Array<{ key: string; text: string }>;
  const right = (question.content?.right ?? []) as Array<{ key: string; text: string }>;
  const pairs = Array.isArray(answers[id]) ? (answers[id] as MatchPair[]) : [];
  const [selectedLeft, setSelectedLeft] = useState<string | null>(null);
  const resultClass = results ? (results[id] ? 'correct' : 'wrong') : '';
  const missingClass = !results && !isAnswered(answers[id]) ? 'missing' : '';

  const leftByKey = Object.fromEntries(left.map((item) => [item.key, item.text]));
  const rightByKey = Object.fromEntries(right.map((item) => [item.key, item.text]));
  const pairedLeft = new Set(pairs.map((item) => item.left));
  const pairedRight = new Set(pairs.map((item) => item.right));

  const chooseLeft = (key: string) => {
    if (pairedLeft.has(key)) return;
    setSelectedLeft((current) => current === key ? null : key);
  };
  const chooseRight = (key: string) => {
    if (!selectedLeft || pairedRight.has(key)) return;
    setAnswer(id, [...pairs.filter((item) => item.left !== selectedLeft && item.right !== key), { left: selectedLeft, right: key }]);
    setSelectedLeft(null);
  };
  const removePair = (leftKey: string) => setAnswer(id, pairs.filter((item) => item.left !== leftKey));
  const resetPairs = () => { setAnswer(id, []); setSelectedLeft(null); };

  return <div className="studentQuestion">
    <div className="kq-stem">{renderMathText(question.stem)}</div>
    <div className={`studentMatchBoard ${resultClass} ${missingClass}`} data-answer-id={id}>
      <div className="studentMatchCol">
        {left.map((item) => <button
          key={item.key}
          className={`${selectedLeft === item.key ? 'selected' : ''} ${pairedLeft.has(item.key) ? 'paired' : ''}`}
          onClick={() => chooseLeft(item.key)}
        >{renderMathText(item.text)}</button>)}
      </div>
      <div className="studentMatchCenter">
        <b>先点左边，再点右边</b>
        {pairs.map((pair) => <div className="matchPairChip" key={pair.left}>
          <span>{leftByKey[pair.left] ?? pair.left}</span><em>→</em><span>{rightByKey[pair.right] ?? pair.right}</span>
          <button onClick={() => removePair(pair.left)}>撤销</button>
        </div>)}
        {!pairs.length && <small>还没有连线</small>}
        <button className="secondary" onClick={resetPairs} disabled={!pairs.length}>重置连线</button>
      </div>
      <div className="studentMatchCol">
        {right.map((item) => <button
          key={item.key}
          className={`${pairedRight.has(item.key) ? 'paired' : ''}`}
          onClick={() => chooseRight(item.key)}
        >{renderMathText(item.text)}</button>)}
      </div>
    </div>
    {results && <p className={results[id] ? 'resultOk' : 'resultBad'}>{results[id] ? '连线正确' : '连线不正确，请检查配对'}</p>}
  </div>;
}


function QuestionDraftShell({ storageKey, children }: { storageKey: string; children: ReactNode }) {
  const [open, setOpen] = useState(false);
  return <div className="questionDraftShell">
    <div className="questionDraftActions">
      <button className={open ? 'active' : ''} onClick={() => setOpen((value) => !value)}>{open ? '\u6536\u8d77\u8349\u7a3f' : '\u6253\u5f00\u8349\u7a3f'}</button>
    </div>
    {children}
    <StudentDraftPad storageKey={storageKey} open={open} onClose={() => setOpen(false)} inline />
  </div>;
}

function InteractiveQuestion({ question, itemId, questionIndex, answers, results, setAnswer }: { question: QuestionDraft; itemId: string; questionIndex: number; answers: StudentAnswers; results: CheckResult | null; setAnswer: (id: string, value: StudentAnswerValue) => void }) {
  const slot = question.answer_slots[0];
  const id = answerKey(itemId, questionIndex, slot?.slot_key || 'answer');
  const draftKey = `kidsQuiz.questionDraftPad.${itemId}.${questionIndex}`;
  let body: ReactNode;

  if (question.content?.interaction === 'poem_char_fill') {
    body = <PoemCharFillQuestion question={question} itemId={itemId} questionIndex={questionIndex} answers={answers} results={results} setAnswer={setAnswer} />;
  } else if (question.content?.tableFill) {
    body = <TableFillQuestion question={question} itemId={itemId} questionIndex={questionIndex} answers={answers} results={results} setAnswer={setAnswer} />;
  } else if (question.question_type === 'single_choice' || question.question_type === 'multiple_choice') {
    const options = (question.content?.options ?? []) as Array<{ key: string; text: string }>;
    const current = answers[id];
    const values: string[] = Array.isArray(current)
      ? current.filter((item): item is string => typeof item === 'string')
      : normalize(current) ? [normalize(current)] : [];
    const toggle = (key: string) => {
      if (question.question_type === 'single_choice') setAnswer(id, key);
      else setAnswer(id, values.includes(key) ? values.filter((item) => item !== key) : [...values, key]);
    };
    body = <div className="studentQuestion">
      <div className="kq-stem">{renderMathText(question.stem)}</div>
      <div className="studentChoices" data-answer-id={id}>{options.map((option) => <button className={values.includes(option.key) ? 'selected' : ''} key={option.key} onClick={() => toggle(option.key)}>{option.key}. {renderMathText(option.text)}</button>)}</div>
      {results && <p className={results[id] ? 'resultOk' : 'resultBad'}>{results[id] ? '\u56de\u7b54\u6b63\u786e' : `\u56de\u7b54\u9519\u8bef\uff0c\u6b63\u786e\u7b54\u6848\uff1a${(slot?.correct_answer as unknown[]).map(normalize).join(', ')}`}</p>}
    </div>;
  } else if (question.question_type === 'ordering') {
    const items = (question.content?.items ?? []) as Array<{ key: string; label: string; value: string }>;
    body = <div className="studentQuestion">
      <div className="kq-stem">{renderMathText(question.stem)}</div>
      <div className="kq-pills">{items.map((item) => <span key={item.key}>{item.label} {item.value}</span>)}</div>
      <input data-answer-id={id} className={`studentWideInput ${results ? (results[id] ? 'correct' : 'wrong') : !isAnswered(answers[id]) ? 'missing' : ''}`} value={normalize(answers[id])} onChange={(event) => setAnswer(id, event.target.value)} placeholder="\u6309\u987a\u5e8f\u586b\u5199\u5e8f\u53f7\uff0c\u4f8b\u5982\uff1a\u2460,\u2461,\u2462" />
    </div>;
  } else if (question.question_type === 'matching') {
    body = <MatchingQuestion question={question} id={id} answers={answers} results={results} setAnswer={setAnswer} />;
  } else {
    body = <div className="studentQuestion"><div className="kq-stem">{renderStem(question, itemId, questionIndex, answers, results, setAnswer)}</div></div>;
  }

  return <QuestionDraftShell storageKey={draftKey}>{body}</QuestionDraftShell>;
}

function questionsFromItem(item: any): PaperQuestionRef[] {
  if (item.group) {
    const draft = dbGroupToPreviewDraft(item.group) as any;
    if (draft.type === 'calculation_group') {
      return draft.items.map((calc: any, index: number) => ({
        title: `${draft.title} - ${index + 1}`,
        itemId: String(item.id),
        questionIndex: index,
        questionId: item.group.questions?.[index]?.id ? String(item.group.questions[index].id) : undefined,
        groupId: String(item.group.id),
        question: {
          id: item.group.questions?.[index]?.id ? String(item.group.questions[index].id) : undefined,
          question_type: 'fill_blank',
          stem: `${calc.stem}{{blank:1}}`,
          answer_slots: [{ slot_key: 'blank_1', slot_type: 'number', correct_answer: [calc.answer] }],
        },
      }));
    }
    if (draft.type === 'composite_group') return draft.children.map((question: QuestionDraft, questionIndex: number) => ({ title: draft.title, question, itemId: String(item.id), questionIndex, questionId: question.id, groupId: String(item.group.id) }));
    if (draft.type === 'question') return [{ title: draft.title, question: draft.question, itemId: String(item.id), questionIndex: 0, questionId: draft.question.id, groupId: String(item.group.id) }];
  }
  if (item.question) return [{ title: item.question.stem, question: dbQuestionToPreview(item.question), itemId: String(item.id), questionIndex: 0, questionId: String(item.question.id), groupId: item.groupId ? String(item.groupId) : undefined }];
  return [];
}

function PaperQuestionBlock({ item, index, answers, results, setAnswer }: { item: any; index: number; answers: StudentAnswers; results: CheckResult | null; setAnswer: (id: string, value: StudentAnswerValue) => void }) {
  if (item.group) {
    const draft = dbGroupToPreviewDraft(item.group) as any;
    if (draft.type === 'composite_group') {
      return <section className="preview-paper preview-paper-block">
        <h2>{index + 1}. {renderMathText(draft.title)}</h2>
        <Materials draft={draft} />
        {draft.children.map((question: QuestionDraft, questionIndex: number) => <InteractiveQuestion key={questionIndex} question={question} itemId={String(item.id)} questionIndex={questionIndex} answers={answers} results={results} setAnswer={setAnswer} />)}
      </section>;
    }
    if (draft.type === 'calculation_group') {
      return <section className="preview-paper preview-paper-block">
        <h2>{index + 1}. {renderMathText(draft.title)}</h2>
        <QuestionDraftShell storageKey={`kidsQuiz.questionDraftPad.${item.id}.calculation_group`}>
          <div className="studentCalcGrid" style={{ gridTemplateColumns: `repeat(${draft.columns || 4}, minmax(0, 1fr))` }}>
            {draft.items.map((calc: any, questionIndex: number) => {
              const id = answerKey(String(item.id), questionIndex, 'blank_1');
              const slot: AnswerSlot = { slot_key: 'blank_1', slot_type: 'number', correct_answer: [calc.answer] };
              return <div className="studentCalcItem" key={questionIndex}><span>{calc.stem}</span><BlankInput id={id} slot={slot} answers={answers} results={results} setAnswer={setAnswer} /></div>;
            })}
          </div>
        </QuestionDraftShell>
      </section>;
    }
    if (draft.type === 'question') {
      return <section className="preview-paper preview-paper-block"><h2>{index + 1}. {renderMathText(draft.title)}</h2><InteractiveQuestion question={draft.question} itemId={String(item.id)} questionIndex={0} answers={answers} results={results} setAnswer={setAnswer} /></section>;
    }
  }
  if (item.question) return <section className="preview-paper preview-paper-block"><h2>{index + 1}. {renderMathText(item.question.stem)}</h2><InteractiveQuestion question={dbQuestionToPreview(item.question)} itemId={String(item.id)} questionIndex={0} answers={answers} results={results} setAnswer={setAnswer} /></section>;
  return <section className="preview-paper preview-paper-block"><h2>{index + 1}. 未命名题目</h2></section>;
}

function CompletionPanel({
  summary,
  onRetry,
  onHome,
  onRetryWrong,
  onTaskCenter,
}: {
  summary: SubmitSummary;
  onRetry: () => void;
  onHome?: () => void;
  onRetryWrong?: () => void;
  onTaskCenter?: () => void;
}) {
  const encouragement = summary.accuracy >= 90 ? '太棒了，今天状态很好！' : summary.accuracy >= 70 ? '不错，再复习一下错题就更稳了！' : '没关系，我们把错题再练一遍。';
  const nextTitle = summary.wrong > 0 ? '建议下一步：错题重练' : summary.accuracy >= 90 ? '建议下一步：挑战新任务' : '建议下一步：回到今日任务';
  const nextText = summary.wrong > 0 ? '先把本次错题再练一遍，做对后会自动从错题本移出。' : summary.accuracy >= 90 ? '这套掌握得很好，可以继续完成今日任务或挑战下一套。' : '回到今日任务，继续按计划巩固。';
  return <div className="completion-panel">
    <div className="completion-hero">
      <div className="completion-emoji">{summary.accuracy >= 90 ? '🌟' : summary.accuracy >= 70 ? '👍' : '💪'}</div>
      <div><h2>练习完成</h2><p>{encouragement}</p></div>
    </div>
    <div className="completion-stats">
      <div><b>{summary.accuracy}%</b><span>正确率</span></div>
      <div><b>{summary.correct}</b><span>答对</span></div>
      <div><b>{summary.wrong}</b><span>错题</span></div>
      <div><b>{summary.savedCount}</b><span>已保存</span></div>
      <div><b>{formatDuration(summary.durationSeconds)}</b><span>用时</span></div>
      <div><b>+{summary.reward?.stars ?? 0}</b><span>星星</span></div>
    </div>
    {summary.reward && <div className="reward-panel">
      <b>本次获得 {summary.reward.stars} 颗星星，连续练习 {summary.reward.streakDays} 天</b>
      {!!summary.reward.newBadges.length && <p>新徽章：{summary.reward.newBadges.map((badge) => badgeLabels[badge] || badge).join('、')}</p>}
    </div>}
    <div className="next-step-panel">
      <b>{nextTitle}</b>
      <span>{nextText}</span>
      <div>
        {summary.wrong > 0 && onRetryWrong && <button className="btn btn-primary btn-sm" onClick={onRetryWrong}>去错题重练</button>}
        {onTaskCenter && <button className="btn btn-secondary btn-sm" onClick={onTaskCenter}>回今日任务</button>}
      </div>
    </div>
    <div className="completion-actions" style={{ marginTop: 'var(--space-3)' }}>
      <button className="btn btn-primary" onClick={onRetry}>再练一次</button>
      {onHome && <button className="btn btn-secondary" style={{ marginLeft: 'var(--space-2)' }} onClick={onHome}>返回孩子首页</button>}
    </div>
    {!!summary.wrongDetails.length && <div className="completion-wrong-list">
      <h3>本次错题</h3>
      {summary.wrongDetails.map((item, index) => <div className="completion-wrong-item" key={`${item.title}-${item.slotKey}-${index}`}>
        <b>{item.title}</b>
        <span>{item.slotKey}：你的答案 {displayValue(item.studentValue)}，正确答案 {displayValue(item.correctValue)}</span>
      </div>)}
    </div>}
  </div>;
}

export function PaperPreviewPage({ paperId, onBack, onEdit, onHome, onRetryWrong, onTaskCenter }: Props) {
  const [paper, setPaper] = useState<any>(null);
  const [message, setMessage] = useState('');
  const [loading, setLoading] = useState(false);
  const [answers, setAnswers] = useState<StudentAnswers>({});
  const [results, setResults] = useState<CheckResult | null>(null);
  const [summary, setSummary] = useState<SubmitSummary | null>(null);
  const [missingDetails, setMissingDetails] = useState<MissingDetail[]>([]);
  const [studentName, setStudentName] = useState(() => localStorage.getItem('kidsQuiz.studentName') || '小朋友');
  const [avatarUrl, setAvatarUrl] = useState(() => localStorage.getItem('kidsQuiz.avatarUrl') || '');
  const [startedAt, setStartedAt] = useState(() => Date.now());
  const [now, setNow] = useState(() => Date.now());
  const [draftSavedAt, setDraftSavedAt] = useState<string | undefined>(() => readDraftSavedAt(paperId));

  const allQuestions = useMemo<PaperQuestionRef[]>(() => (paper?.items || []).flatMap(questionsFromItem), [paper]);
  const elapsedSeconds = Math.floor((now - startedAt) / 1000);
  const progress = useMemo(() => {
    const total = allQuestions.reduce((sum, item) => sum + item.question.answer_slots.length, 0);
    const answered = allQuestions.reduce((sum, item) => sum + item.question.answer_slots.filter((slot) => {
      const value = answers[answerKey(item.itemId, item.questionIndex, slot.slot_key)];
      return isAnswered(value);
    }).length, 0);
    return { total, answered, percent: total ? Math.round((answered / total) * 100) : 0 };
  }, [allQuestions, answers]);

  const refresh = async () => {
    try {
      setLoading(true);
      const data = await getPaper(paperId);
      const draftAnswers = readDraftAnswers(paperId);
      const restoredCount = Object.values(draftAnswers).filter(isAnswered).length;
      setPaper(data);
      setAnswers(draftAnswers);
      setDraftSavedAt(readDraftSavedAt(paperId));
      setResults(null);
      setSummary(null);
      setMissingDetails([]);
      setStartedAt(Date.now());
      setNow(Date.now());
      setMessage(restoredCount ? `已加载学生端答题：${data.title}，并恢复 ${restoredCount} 个草稿答案` : `已加载学生端答题：${data.title}`);
    } catch (error) {
      setMessage(`加载失败：${error instanceof Error ? error.message : String(error)}`);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { void refresh(); }, [paperId]);

  useEffect(() => {
    const timer = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(timer);
  }, []);

  useEffect(() => {
    if (!paper) return;
    const savedAt = new Date().toISOString();
    localStorage.setItem(draftStorageKey(paperId), JSON.stringify(answers));
    localStorage.setItem(draftMetaStorageKey(paperId), JSON.stringify({ savedAt }));
    setDraftSavedAt(savedAt);
  }, [answers, paper, paperId]);

  const setAnswer = (id: string, value: StudentAnswerValue) => {
    setAnswers((prev) => ({ ...prev, [id]: value }));
    setResults(null);
    setSummary(null);
    setMissingDetails([]);
  };

  const saveStudentProfile = () => {
    localStorage.setItem('kidsQuiz.studentName', studentName.trim() || '小朋友');
    localStorage.setItem('kidsQuiz.avatarUrl', avatarUrl.trim());
    void saveStudentProfileApi({ name: studentName.trim() || '小朋友', avatarUrl: avatarUrl.trim() }).catch(() => undefined);
    setMessage('已保存孩子资料');
  };

  const reset = () => {
    setAnswers({});
    setResults(null);
    setSummary(null);
    setMissingDetails([]);
    setStartedAt(Date.now());
    setNow(Date.now());
    localStorage.removeItem(draftStorageKey(paperId));
    localStorage.removeItem(draftMetaStorageKey(paperId));
    setDraftSavedAt(undefined);
    setMessage('已清空本次作答');
  };

  const findMissingDetails = () => {
    const list: MissingDetail[] = [];
    allQuestions.forEach(({ title, question, itemId, questionIndex }) => {
      question.answer_slots.forEach((slot) => {
        const id = answerKey(itemId, questionIndex, slot.slot_key);
        if (!isAnswered(answers[id])) list.push({ id, title: question.stem || title, slotKey: slot.slot_key });
      });
    });
    return list;
  };

  const scrollToAnswer = (id: string) => {
    window.setTimeout(() => {
      const element = document.querySelector(`[data-answer-id="${CSS.escape(id)}"]`) as HTMLElement | null;
      if (!element) return;
      element.scrollIntoView({ behavior: 'smooth', block: 'center' });
      if (element instanceof HTMLInputElement || element instanceof HTMLTextAreaElement || element instanceof HTMLSelectElement) element.focus();
    }, 50);
  };

  const submit = async () => {
    const missing = findMissingDetails();
    if (missing.length) {
      setMissingDetails(missing);
      setResults(null);
      setSummary(null);
      setMessage(`还有 ${missing.length} 个空没有完成，已定位到第一个未填写位置`);
      scrollToAnswer(missing[0].id);
      return;
    }
    setMissingDetails([]);
    const nextResults: CheckResult = {};
    const wrongDetails: WrongDetail[] = [];
    let total = 0;
    let correct = 0;
    const durationSeconds = Math.floor((Date.now() - startedAt) / 1000);
    const answerRecords = allQuestions.map(({ title, question, itemId, questionIndex, questionId, groupId }) => {
      const details = question.answer_slots.map((slot) => {
        const id = answerKey(itemId, questionIndex, slot.slot_key);
        const ok = isSlotCorrect(slot, answers[id]);
        nextResults[id] = ok;
        total += 1;
        if (ok) correct += 1;
        else wrongDetails.push({ title: question.stem || title, slotKey: slot.slot_key, studentValue: answers[id] ?? '', correctValue: slot.correct_answer });
        return { slotKey: slot.slot_key, studentValue: answers[id] ?? '', correctValue: slot.correct_answer, isCorrect: ok, score: ok ? 1 : 0 };
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
      };
    });
    setResults(nextResults);
    const saveable = answerRecords.filter((record) => record.questionId);
    let savedCount = 0;
    let reward: RewardGrant | undefined;
    try {
      const saved = await submitPaperAttempt({ paperId, studentName: studentName.trim() || '小朋友', avatarUrl: avatarUrl.trim() || undefined, durationSeconds, answers: saveable });
      savedCount = saved.savedCount ?? saveable.length;
      if (saved.reward) {
        reward = saved.reward;
        applyRewardSnapshot(saved.reward);
      }
      setMessage('已提交并保存练习记录');
      localStorage.removeItem(draftStorageKey(paperId));
      localStorage.removeItem(draftMetaStorageKey(paperId));
      setDraftSavedAt(undefined);
    } catch (error) {
      setMessage(`已本地判题，但保存失败：${error instanceof Error ? error.message : String(error)}`);
    }
    const accuracy = total ? Math.round((correct / total) * 100) : 0;
    if (!reward) reward = grantPracticeReward({ accuracy, correct, total });
    setSummary({ total, correct, wrong: total - correct, accuracy, savedCount, durationSeconds, reward, wrongDetails });
  };

  return <div className="paper-preview-page animate-fadeIn">
    <header className="page-header" style={{ marginBottom: 'var(--space-5)' }}>
      <div className="page-header-left">
        <h1 className="page-title">学生端答题预览</h1>
        <p className="page-subtitle">模拟学生端答题界面。答题完成后可进行判题测试。</p>
      </div>
    </header>
    <div className="single-main">
      <section className="card">
        <div className="toolbar">
          {onHome && <button className="btn btn-outline btn-sm" onClick={onHome}>孩子首页</button>}
          <button className="btn btn-secondary btn-sm" onClick={onBack}>返回试卷管理</button>
          <button className="btn btn-outline btn-sm" onClick={onEdit}>编辑题目</button>
          <button className="btn btn-outline btn-sm" onClick={refresh}>{loading ? '加载中...' : '刷新'}</button>
          <button className="btn btn-primary btn-sm" onClick={submit}>提交判题</button>
          <button className="btn btn-secondary btn-sm" onClick={reset}>清空答案</button>
        </div>
        {message && <p className="message">{message}</p>}

        {!!missingDetails.length && <div className="missing-panel">
          <b>还有 {missingDetails.length} 个位置没填写</b>
          <p>请先补全答案，再提交判题。</p>
          <button className="btn btn-primary btn-sm" onClick={() => scrollToAnswer(missingDetails[0].id)}>定位第一个未完成</button>
          <div style={{ marginTop: 'var(--space-2)' }}>
            {missingDetails.slice(0, 6).map((item, index) => <span key={item.id} onClick={() => scrollToAnswer(item.id)}>{index + 1}. {item.slotKey}</span>)}
            {missingDetails.length > 6 && <span>还有 {missingDetails.length - 6} 个...</span>}
          </div>
        </div>}

        {summary && <CompletionPanel summary={summary} onRetry={reset} onHome={onHome} onRetryWrong={onRetryWrong} onTaskCenter={onTaskCenter} />}

        <div className="preview-paper" style={{ marginTop: 'var(--space-4)' }}>
          <div className="practice-status-bar">
            <div>
              <b>作答进度</b>
              <span>{progress.answered} / {progress.total} 空</span>
            </div>
            <div className="practice-progress-track"><i style={{ width: `${progress.percent}%` }} /></div>
            <div>
              <b>当前用时</b>
              <span>{formatDuration(elapsedSeconds)}</span>
            </div>
            <div>
              <b>草稿</b>
              <span>自动保存于 {formatSavedAt(draftSavedAt)}</span>
            </div>
          </div>
          {draftSavedAt && progress.answered > 0 && <div className="draft-resume-notice">
            <b>已恢复上次作答</b>
            <span>草稿保存时间：{new Date(draftSavedAt).toLocaleString()}。继续填写即可，提交成功后草稿会自动清理。</span>
          </div>}
          <div className="student-profile-box">
            <div className="student-avatar-preview">{avatarUrl ? <img src={avatarUrl} alt={studentName || '孩子头像'} /> : <span>😊</span>}</div>
            <div className="student-profile-fields">
              <label>昵称</label>
              <input value={studentName} onChange={(event) => setStudentName(event.target.value)} placeholder="比如：小宇" />
              <label>头像 URL（可选）</label>
              <input value={avatarUrl} onChange={(event) => setAvatarUrl(event.target.value)} placeholder="可以先留空，后续再上传头像" />
            </div>
            <button className="btn btn-primary btn-sm" onClick={saveStudentProfile}>保存资料</button>
          </div>
          <div className="preview-paper-header">
            <h1>{paper?.title || '试卷'}</h1>
            {paper?.description && <p>{paper.description}</p>}
            <div className="preview-paper-meta"><span>昵称：{studentName.trim() || '小朋友'}</span><span>家庭练习</span><span>用时：__________</span></div>
          </div>
          {(paper?.items || []).map((item: any, index: number) => <PaperQuestionBlock key={item.id} item={item} index={index} answers={answers} results={results} setAnswer={setAnswer} />)}
          {!paper?.items?.length && <p className="tip">当前试卷还没有题目，请先进入“编辑题目”添加。</p>}
        </div>
      </section>
    </div>
  </div>;
}

import { useEffect, useState } from 'react';
import type { QuestionDraft, TableMaterial } from '@kids-quiz/shared-types';
import { getPaper } from '../api/papers';
import { dbGroupToPreviewDraft, dbQuestionToPreview } from '../utils/dbPreview';
import { renderMathText } from '../utils/mathText';

type Props = {
  paperId: string;
  onBack: () => void;
  onPreview: () => void;
};

type AnswerRow = {
  section: string;
  no: string;
  answer: string;
};

function formatAnswerValue(value: unknown): string {
  if (Array.isArray(value)) return value.map(formatAnswerValue).join(' / ');
  if (value && typeof value === 'object') return JSON.stringify(value);
  return String(value ?? '');
}

function questionAnswerText(question: QuestionDraft): string {
  return question.answer_slots.map((slot) => `${slot.slot_key}: ${formatAnswerValue(slot.correct_answer)}`).join('；') || '-';
}

function collectAnswerRows(items: any[] = []): AnswerRow[] {
  const rows: AnswerRow[] = [];
  items.forEach((item, sectionIndex) => {
    if (item.group) {
      const draft = dbGroupToPreviewDraft(item.group) as any;
      const section = `${sectionIndex + 1}. ${draft.title}`;
      if (draft.type === 'calculation_group') {
        draft.items.forEach((calc: any, calcIndex: number) => rows.push({ section, no: String(calcIndex + 1), answer: formatAnswerValue(calc.answer) }));
      } else if (draft.type === 'composite_group') {
        draft.children.forEach((question: QuestionDraft, questionIndex: number) => rows.push({ section, no: String(questionIndex + 1), answer: questionAnswerText(question) }));
      } else if (draft.type === 'question') {
        rows.push({ section, no: '1', answer: questionAnswerText(draft.question) });
      }
      return;
    }
    if (item.question) {
      const question = dbQuestionToPreview(item.question);
      rows.push({ section: `${sectionIndex + 1}. ${item.question.stem}`, no: '1', answer: questionAnswerText(question) });
    }
  });
  return rows;
}

function MaterialTable({ table }: { table?: TableMaterial }) {
  if (!table) return null;
  return <table className="kq-table printTable">
    <thead><tr>{table.headers.map((header) => <th key={header}>{header}</th>)}</tr></thead>
    <tbody>{table.rows.map((row, rowIndex) => <tr key={rowIndex}>{row.map((cell, cellIndex) => <td key={cellIndex}>{cell}</td>)}</tr>)}</tbody>
  </table>;
}

function renderPrintStem(question: QuestionDraft) {
  const parts: React.ReactNode[] = [];
  let last = 0;
  const re = /\{\{blank:(\d+)\}\}/g;
  let match: RegExpExecArray | null;
  const stem = question.stem;
  while ((match = re.exec(stem))) {
    if (match.index > last) parts.push(...renderMathText(stem.slice(last, match.index)));
    const slot = question.answer_slots.find((item) => item.slot_key === `blank_${match?.[1]}`);
    const className = slot?.slot_type === 'compare_symbol' && slot.answer_rule?.display_shape === 'circle' ? 'printBlank printCircle' : 'printBlank';
    parts.push(<span className={className} key={`${match[1]}-${match.index}`} />);
    last = re.lastIndex;
  }
  if (last < stem.length) parts.push(...renderMathText(stem.slice(last)));
  return parts;
}

function PrintQuestion({ question, index }: { question: QuestionDraft; index?: number }) {
  const prefix = index === undefined ? '' : `${index + 1}. `;
  const materials = question.content?.materials;
  const options = (question.content?.options ?? []) as Array<{ key: string; text: string }>;
  const items = (question.content?.items ?? []) as Array<{ key: string; label: string; value: string }>;
  const left = (question.content?.left ?? []) as Array<{ key: string; text: string }>;
  const right = (question.content?.right ?? []) as Array<{ key: string; text: string }>;

  if (question.question_type === 'single_choice' || question.question_type === 'multiple_choice') {
    return <div className="printQuestion">
      {Array.isArray(materials) && materials.length > 0 && <PrintMaterials draft={{ materials }} />}
      <div className="printStem">{prefix}{renderMathText(question.stem)}</div>
      <div className="printOptions">{options.map((option) => <span key={option.key}>{option.key}. {renderMathText(option.text)}</span>)}</div>
    </div>;
  }

  if (question.question_type === 'ordering') {
    const separator = String(question.content?.separator ?? '>');
    return <div className="printQuestion">
      {Array.isArray(materials) && materials.length > 0 && <PrintMaterials draft={{ materials }} />}
      <div className="printStem">{prefix}{renderMathText(question.stem)}</div>
      <div className="printOptions">{items.map((item) => <span key={item.key}>{item.label} {item.value}</span>)}</div>
      <div className="printOrder">{items.map((_, itemIndex) => <span key={itemIndex}><i />{itemIndex < items.length - 1 && <b>{separator}</b>}</span>)}</div>
    </div>;
  }

  if (question.question_type === 'sentence_build') {
    const tokens = (question.content?.tokens ?? []) as Array<{ key: string; text: string; isPunct?: boolean }>;
    return <div className="printQuestion">
      {Array.isArray(materials) && materials.length > 0 && <PrintMaterials draft={{ materials }} />}
      <div className="printStem">{prefix}{renderMathText(question.stem)}</div>
      <div className="printOptions printSentenceTokens">{tokens.map((token) => <span key={token.key} className={token.isPunct ? 'printPunct' : ''}>{token.text}</span>)}</div>
      <div className="printSentenceLine" />
    </div>;
  }

  if (question.question_type === 'matching') {
    return <div className="printQuestion">
      {Array.isArray(materials) && materials.length > 0 && <PrintMaterials draft={{ materials }} />}
      <div className="printStem">{prefix}{renderMathText(question.stem)}</div>
      <div className="printMatch">
        <div>{left.map((item) => <span key={item.key}>{item.text}</span>)}</div>
        <div>{right.map((item) => <span key={item.key}>{item.text}</span>)}</div>
      </div>
    </div>;
  }

  return <div className="printQuestion">
    {Array.isArray(materials) && materials.length > 0 && <PrintMaterials draft={{ materials }} />}
    <div className="printStem">{prefix}{renderPrintStem(question)}</div>
  </div>;
}

function PrintMaterials({ draft }: { draft: any }) {
  const materials = Array.isArray(draft.materials) && draft.materials.length ? draft.materials : [
    draft.commonStem ? { type: 'text', text: draft.commonStem } : null,
    draft.table ? { type: 'table', table: draft.table } : null,
  ].filter(Boolean);
  return <>{materials.map((material: any, index: number) => <div className="printMaterial" key={index}>
    {material.title && <b>{material.title}</b>}
    {material.type === 'text' && <p>{material.text}</p>}
    {material.type === 'table' && <MaterialTable table={material.table} />}
    {material.type === 'image' && material.url && <img src={material.url} alt={material.title || '题目材料'} />}
  </div>)}</>;
}

function PrintBlock({ item, index }: { item: any; index: number }) {
  if (item.group) {
    const draft = dbGroupToPreviewDraft(item.group) as any;
    if (draft.type === 'calculation_group') {
      return <section className="printSection">
        <h2>{index + 1}. {renderMathText(draft.title)}</h2>
        <div className="printCalcGrid" style={{ gridTemplateColumns: `repeat(${draft.columns || 4}, minmax(0, 1fr))` }}>
          {draft.items.map((calc: any, calcIndex: number) => <div className="printCalcItem" key={calcIndex}>{calc.stem}<span /></div>)}
        </div>
      </section>;
    }
    if (draft.type === 'composite_group') {
      return <section className="printSection">
        <h2>{index + 1}. {renderMathText(draft.title)}</h2>
        <PrintMaterials draft={draft} />
        {draft.children.map((question: QuestionDraft, questionIndex: number) => <PrintQuestion key={questionIndex} question={question} index={questionIndex} />)}
      </section>;
    }
    if (draft.type === 'question') {
      return <section className="printSection"><h2>{index + 1}. {renderMathText(draft.title)}</h2><PrintQuestion question={draft.question} /></section>;
    }
  }
  if (item.question) return <section className="printSection"><h2>{index + 1}. {renderMathText(item.question.stem)}</h2><PrintQuestion question={dbQuestionToPreview(item.question)} /></section>;
  return null;
}

export function PaperPrintPage({ paperId, onBack, onPreview }: Props) {
  const [paper, setPaper] = useState<any>(null);
  const [message, setMessage] = useState('');
  const [loading, setLoading] = useState(false);
  const [showAnswers, setShowAnswers] = useState(false);

  const refresh = async () => {
    try {
      setLoading(true);
      const data = await getPaper(paperId);
      setPaper(data);
      setMessage(`已加载打印版：${data.title}`);
    } catch (error) {
      setMessage(`加载失败：${error instanceof Error ? error.message : String(error)}`);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { void refresh(); }, [paperId]);

  return <div className="app printPage">
    <header className="noPrint">
      <h1>Kids Quiz 打印练习卷</h1>
      <p>生成适合 A4 打印的纸质练习版，不显示答案。</p>
    </header>
    <main className="singleMain">
      <section className="panel">
        <div className="toolbar noPrint">
          <button className="secondary" onClick={onBack}>返回试卷管理</button>
          <button onClick={onPreview}>学生答题</button>
          <button onClick={refresh}>{loading ? '加载中...' : '刷新'}</button>
          <button className={showAnswers ? '' : 'secondary'} onClick={() => setShowAnswers((value) => !value)}>{showAnswers ? '隐藏答案页' : '显示答案页'}</button>
          <button onClick={() => window.print()}>打印 / 保存 PDF</button>
        </div>
        {message && <p className="message noPrint">{message}</p>}

        <article className="printSheet">
          <div className="printHead">
            <h1>{paper?.title || '练习卷'}</h1>
            {paper?.description && <p>{paper.description}</p>}
            <div className="printMeta"><span>姓名：__________</span><span>日期：__________</span><span>用时：__________</span></div>
          </div>
          {(paper?.items || []).map((item: any, index: number) => <PrintBlock item={item} index={index} key={item.id || index} />)}
          {!paper?.items?.length && <p className="tip noPrint">当前试卷还没有题目，请先编辑试卷添加题目。</p>}
        </article>

        {showAnswers && <article className="printSheet answerSheet">
          <div className="printHead">
            <h1>{paper?.title || '练习卷'} 参考答案</h1>
            <p>家长批改用，可选择单独打印或随试卷一起保存 PDF。</p>
          </div>
          <div className="answerRows">
            {collectAnswerRows(paper?.items || []).map((row, index) => <div className="answerRow" key={`${row.section}-${row.no}-${index}`}>
              <span>{row.section}</span>
              <b>第 {row.no} 题</b>
              <em>{row.answer}</em>
            </div>)}
          </div>
        </article>}
      </section>
    </main>
  </div>;
}

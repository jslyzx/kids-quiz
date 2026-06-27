import type { ReactNode } from 'react';
import type { AnswerSlot, ColumnArithmeticCell, ColumnArithmeticContent, QuestionDraft, TableMaterial } from '@kids-quiz/shared-types';
import katex from 'katex';
import 'katex/dist/katex.min.css';
import './renderer.css';

type CompositeMaterial = {
  type: 'text' | 'table' | 'image';
  title?: string;
  text?: string;
  url?: string;
  table?: TableMaterial;
};

type TableFill = {
  headers?: string[];
  rows?: string[][];
};

function slotByKey(slots: AnswerSlot[], key: string) {
  return slots.find((slot) => slot.slot_key === key);
}

function renderMathText(text: string) {
  const parts: ReactNode[] = [];
  const re = /\{\{math:(.+?)\}\}|\\\((.+?)\\\)|\\\[(.+?)\\\]/gs;
  let last = 0;
  let m: RegExpExecArray | null;
  while ((m = re.exec(text))) {
    if (m.index > last) parts.push(text.slice(last, m.index));
    const expr = m[1] ?? m[2] ?? m[3] ?? '';
    try {
      parts.push(<span className="mathInline" key={`${m.index}-${expr}`} dangerouslySetInnerHTML={{ __html: katex.renderToString(expr, { throwOnError: false, displayMode: Boolean(m[3]) }) }} />);
    } catch {
      parts.push(expr);
    }
    last = re.lastIndex;
  }
  if (last < text.length) parts.push(text.slice(last));
  return parts;
}

function renderStem(stem: string, slots: AnswerSlot[]) {
  const parts: ReactNode[] = [];
  let last = 0;
  const re = /\{\{blank:(\d+)\}\}/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(stem))) {
    if (m.index > last) parts.push(...renderMathText(stem.slice(last, m.index)));
    const key = `blank_${m[1]}`;
    const slot = slotByKey(slots, key);
    if (slot?.slot_type === 'compare_symbol') {
      const allowed = (slot.answer_rule?.allowed_values as string[] | undefined) ?? ['>', '<', '='];
      const isCircle = slot.answer_rule?.display_shape === 'circle';
      parts.push(isCircle
        ? <span className="kq-symbol-circle" key={`${key}-${m.index}`} aria-label={`符号 ${m[1]}`} />
        : <span className="kq-compare" key={`${key}-${m.index}`}>
            {allowed.map((value) => <button key={value}>{value}</button>)}
          </span>,
      );
    } else {
      parts.push(<span className="kq-blank" key={`${key}-${m.index}`} aria-label={`填空 ${m[1]}`} />);
    }
    last = re.lastIndex;
  }
  if (last < stem.length) parts.push(...renderMathText(stem.slice(last)));
  return parts;
}

function MaterialTable({ table }: { table?: TableMaterial }) {
  if (!table) return null;
  return (
    <table className="kq-table">
      <thead><tr>{table.headers.map((h) => <th key={h}>{h}</th>)}</tr></thead>
      <tbody>{table.rows.map((row, i) => <tr key={i}>{row.map((c, j) => <td key={j}>{c}</td>)}</tr>)}</tbody>
    </table>
  );
}

function TableFillPreview({ question }: { question: QuestionDraft }) {
  const table = (question.content?.tableFill ?? {}) as TableFill;
  const headers = table.headers ?? [];
  const rows = table.rows ?? [];
  return (
    <div className="kq-question">
      {question.stem && <div className="kq-stem">{renderMathText(question.stem)}</div>}
      <table className="kq-table kq-table-fill">
        {headers.length > 0 && <thead><tr>{headers.map((header, index) => <th key={`${header}-${index}`}>{renderMathText(header)}</th>)}</tr></thead>}
        <tbody>{rows.map((row, rowIndex) => (
          <tr key={rowIndex}>{row.map((cell, cellIndex) => <td key={`${rowIndex}-${cellIndex}`}>{renderStem(String(cell ?? ''), question.answer_slots)}</td>)}</tr>
        ))}</tbody>
      </table>
    </div>
  );
}

function cellText(cell: ColumnArithmeticCell) {
  if (!cell) return '';
  return cell.text ?? '';
}

function ColumnArithmeticPreview({ question }: { question: QuestionDraft }) {
  const config = question.content?.columnArithmetic as ColumnArithmeticContent | undefined;
  const rows = [...(config?.carryRows ?? []), ...(config?.rows ?? [])];
  const columns = config?.columns ?? Math.max(1, ...rows.map((row) => row.cells.length));
  return (
    <div className="kq-question">
      {question.stem && <div className="kq-stem">{renderMathText(question.stem)}</div>}
      <div className="kq-column-arithmetic" style={{ ['--kq-columns' as string]: columns }}>
        {rows.map((row, rowIndex) => (
          <div className={`kq-column-row kq-column-row-${row.role ?? 'operand'}`} key={rowIndex}>
            <span className="kq-column-operator">{row.operator ?? ''}</span>
            {Array.from({ length: columns }).map((_, cellIndex) => {
              const offset = columns - row.cells.length;
              const cell = row.cells[cellIndex - offset] ?? null;
              const key = cell?.slot ?? `${rowIndex}-${cellIndex}`;
              if (cell?.slot) return <span className="kq-column-cell kq-column-slot" key={key} />;
              return <span className={`kq-column-cell ${cell ? 'fixed' : 'empty'}`} key={key}>{cellText(cell)}</span>;
            })}
          </div>
        ))}
      </div>
    </div>
  );
}

function MaterialBlock({ material }: { material: CompositeMaterial }) {
  return (
    <div className={`kq-material kq-material-${material.type}`}>
      {material.title && <div className="kq-material-title">{material.title}</div>}
      {material.type === 'text' && <div className="kq-stem kq-common">{material.text}</div>}
      {material.type === 'table' && <MaterialTable table={material.table} />}
      {material.type === 'image' && material.url && <img className="kq-material-image" src={material.url} alt={material.title ?? '题目材料'} />}
    </div>
  );
}

export function QuestionPreview({ question }: { question: QuestionDraft }) {
  const materials = question.content?.materials as CompositeMaterial[] | undefined;
  const materialBlocks = Array.isArray(materials) ? materials.map((material, index) => <MaterialBlock key={index} material={material} />) : null;
  if (question.content?.interaction === 'column_arithmetic' || question.content?.columnArithmetic) return <ColumnArithmeticPreview question={question} />;
  if (question.content?.interaction === 'poem_char_fill') return <PoemCharFillPreview question={question} />;
  if (question.content?.tableFill) return <TableFillPreview question={question} />;
  if (question.question_type === 'ordering') return <OrderingPreview question={question} />;
  if (question.question_type === 'sentence_build') return <SentenceBuildPreview question={question} />;
  if (question.question_type === 'matching') return <MatchingPreview question={question} />;
  if (['single_choice', 'multiple_choice', 'true_false'].includes(question.question_type)) return <ChoicePreview question={question} />;
  return (
    <div className="kq-question">
      {materialBlocks}
      <div className="kq-stem">{renderStem(question.stem, question.answer_slots)}</div>
    </div>
  );
}

export function CalculationGroupPreview({ items, columns = 4 }: { items: Array<{ stem: string; answer: string | number }>; columns?: number }) {
  return (
    <div className="kq-calc-grid" style={{ gridTemplateColumns: `repeat(${columns}, minmax(0, 1fr))` }}>
      {items.map((item, index) => (
        <div className="kq-calc-item" key={`${item.stem}-${index}`}>
          <span>{item.stem}</span><span className="kq-answer-line" />
        </div>
      ))}
    </div>
  );
}

function ChoicePreview({ question }: { question: QuestionDraft }) {
  const options = (question.content?.options ?? []) as Array<{ key: string; text: string }>;
  return (
    <div className="kq-question">
      <div className="kq-stem">{renderMathText(question.stem)}</div>
      <div className="kq-choices">{options.map((opt) => <button key={opt.key}>{opt.key}. {renderMathText(opt.text)}</button>)}</div>
    </div>
  );
}

function PoemCharFillPreview({ question }: { question: QuestionDraft }) {
  const poem = (question.content?.poem ?? {}) as { title?: string; author?: string; dynasty?: string; lines?: string[] };
  const pool = (question.content?.charPool ?? []) as string[];
  const lines = Array.isArray(poem.lines) ? poem.lines : [];
  return (
    <div className="kq-question poemFillQuestion">
      <div className="poemTitle">{poem.title || question.stem}</div>
      <div className="poemAuthor">{[poem.dynasty, poem.author].filter(Boolean).join('·')}</div>
      <div className="poemSlotLines">
        {lines.map((line, rowIndex) => {
          const chars = Array.from(line.replace(/[\s\p{P}]/gu, ''));
          const punct = line.match(/[，。！？；,.!?;]$/)?.[0] ?? '';
          return <div className="poemSlotLine" key={rowIndex}>{chars.map((_, index) => <span key={index} />)}{punct && <b>{punct}</b>}</div>;
        })}
      </div>
      <div className="poemCharPool">{pool.map((ch, index) => <button key={`${ch}-${index}`}>{ch}</button>)}</div>
    </div>
  );
}

function OrderingPreview({ question }: { question: QuestionDraft }) {
  const items = (question.content?.items ?? []) as Array<{ key: string; label: string; value: string }>;
  const answer = (question.answer_slots[0]?.correct_answer ?? items) as unknown[];
  const separator = String(question.content?.separator ?? '>');
  return (
    <div className="kq-question">
      <div className="kq-stem">{renderMathText(question.stem)}</div>
      <div className="kq-pills">{items.map((item) => <span key={item.key}>{item.label} {item.value}</span>)}</div>
      <div className="kq-order-slots">
        {answer.map((_, index) => (
          <span className="kq-order-wrap" key={index}>
            <span className="kq-order-slot">第{index + 1}个</span>
            {index < answer.length - 1 && <b>{separator}</b>}
          </span>
        ))}
      </div>
    </div>
  );
}

function SentenceBuildPreview({ question }: { question: QuestionDraft }) {
  const tokens = (question.content?.tokens ?? []) as Array<{ key: string; text: string; isPunct?: boolean }>;
  const tokenMap = new Map(tokens.map((t) => [String(t.key), t]));
  const answerKeys = ((question.answer_slots[0]?.correct_answer ?? []) as unknown[]).map((k) => String(k));
  // 按答案顺序展示；无答案时按 tokens 原序
  const ordered = answerKeys.length
    ? answerKeys.map((k) => tokenMap.get(k)).filter(Boolean) as typeof tokens
    : tokens;
  return (
    <div className="kq-question">
      <div className="kq-stem">{renderMathText(question.stem)}</div>
      <div className="kq-pills kq-sentence-pills">
        {ordered.map((token, index) => (
          <span
            key={token.key}
            className={token.isPunct ? 'kq-pill kq-pill-punct' : 'kq-pill'}
          >{token.text}</span>
        ))}
      </div>
    </div>
  );
}

function MatchingPreview({ question }: { question: QuestionDraft }) {
  const left = (question.content?.left ?? []) as Array<{ key: string; text: string }>;
  const right = (question.content?.right ?? []) as Array<{ key: string; text: string }>;
  return (
    <div className="kq-question">
      <div className="kq-stem">{renderMathText(question.stem)}</div>
      <div className="kq-match">
        <div>{left.map((item) => <button key={item.key}>{item.text}</button>)}</div>
        <div>{right.map((item) => <button key={item.key}>{item.text}</button>)}</div>
      </div>
    </div>
  );
}

export function CompositePreview({ title, commonStem, table, materials, children }: { title: string; commonStem?: string; table?: TableMaterial; materials?: CompositeMaterial[]; children: QuestionDraft[] }) {
  const hasMaterials = Array.isArray(materials) && materials.length > 0;
  return (
    <section className="kq-paper">
      <h2>{renderMathText(title)}</h2>
      {hasMaterials ? materials.map((material, index) => <MaterialBlock key={index} material={material} />) : <>
        {commonStem && <div className="kq-stem kq-common">{commonStem}</div>}
        <MaterialTable table={table} />
      </>}
      {children.map((child, index) => <QuestionPreview key={index} question={child} />)}
    </section>
  );
}


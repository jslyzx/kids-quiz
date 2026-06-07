import { useState } from 'react';
import type { SlotType } from '@kids-quiz/shared-types';
import type { AppState } from '../../types/editor';
import { blankKeys } from '../../utils/blanks';

type SetAppStateField = <K extends keyof AppState>(key: K, value: AppState[K]) => void;

type CalcOp = '+' | '-' | '×' | '÷';

function randomInt(min: number, max: number) {
  const low = Math.ceil(Math.min(min, max));
  const high = Math.floor(Math.max(min, max));
  return Math.floor(Math.random() * (high - low + 1)) + low;
}

function makeCalculation(op: CalcOp, min: number, max: number) {
  if (op === '+') {
    const a = randomInt(min, max);
    const b = randomInt(min, max);
    return `${a}+${b}=${a + b}`;
  }
  if (op === '-') {
    const a = randomInt(min, max);
    const b = randomInt(min, max);
    const left = Math.max(a, b);
    const right = Math.min(a, b);
    return `${left}-${right}=${left - right}`;
  }
  if (op === '×') {
    const a = randomInt(min, max);
    const b = randomInt(min, max);
    return `${a}×${b}=${a * b}`;
  }
  const divisor = Math.max(1, randomInt(min, max));
  const quotient = Math.max(1, randomInt(min, max));
  return `${divisor * quotient}÷${divisor}=${quotient}`;
}

export function CalculationEditor({
  value,
  columns,
  onChange,
  onColumnsChange,
}: {
  value: string;
  columns: number;
  onChange: (value: string) => void;
  onColumnsChange: (value: number) => void;
}) {
  const [count, setCount] = useState(20);
  const [min, setMin] = useState(2);
  const [max, setMax] = useState(99);
  const [ops, setOps] = useState<CalcOp[]>(['+', '-', '×', '÷']);
  const toggleOp = (op: CalcOp) => setOps((prev) => prev.includes(op) ? prev.filter((item) => item !== op) : [...prev, op]);
  const generate = (append: boolean) => {
    const usableOps: CalcOp[] = ops.length ? ops : ['+', '-'];
    const lines = Array.from({ length: Math.max(1, count) }, () => {
      const op = usableOps[randomInt(0, usableOps.length - 1)];
      return makeCalculation(op, min, max);
    }).join('\n');
    onChange(append && value.trim() ? `${value.trim()}\n${lines}` : lines);
  };
  return <>
    <label>每行展示几个</label>
    <select value={columns} onChange={(e) => onColumnsChange(Number(e.target.value))}>
      <option value={2}>每行 2 题，适合横式较长</option>
      <option value={3}>每行 3 题</option>
      <option value={4}>每行 4 题，默认</option>
      <option value={5}>每行 5 题</option>
      <option value={6}>每行 6 题，适合口算密集排版</option>
    </select>
    <div className="calc-generator">
      <b>快速生成口算题</b>
      <div className="calc-generator-grid">
        <label>数量<input type="number" min={1} max={200} value={count} onChange={(e) => setCount(Number(e.target.value))} /></label>
        <label>最小数<input type="number" value={min} onChange={(e) => setMin(Number(e.target.value))} /></label>
        <label>最大数<input type="number" value={max} onChange={(e) => setMax(Number(e.target.value))} /></label>
      </div>
      <div className="calc-ops">
        {(['+', '-', '×', '÷'] as CalcOp[]).map((op) => <button type="button" className={ops.includes(op) ? 'selected' : ''} onClick={() => toggleOp(op)} key={op}>{op}</button>)}
      </div>
      <div className="rowActions" style={{ display: 'flex', gap: 'var(--space-2)' }}>
        <button type="button" className="btn btn-primary btn-sm" onClick={() => generate(false)}>生成并替换</button>
        <button type="button" className="btn btn-secondary btn-sm" onClick={() => generate(true)}>追加生成</button>
      </div>
      <p className="tip" style={{ marginTop: 'var(--space-2)' }}>除法会自动生成整除算式；减法默认不出现负数。生成后仍可在下面手动微调。</p>
    </div>
    <label>口算内容（每行一题，格式：题干=答案）</label>
    <textarea value={value} onChange={(e) => onChange(e.target.value)} />
    <p className="tip">例：20×3=60。左侧作为学生看到的题干，右侧作为标准答案。</p>
  </>;
}

export function AnswerSlotEditor({ stem, slotType, answers, onChange }: { stem: string; slotType: SlotType; answers: Record<string, string>; onChange: (answers: Record<string, string>) => void }) {
  const keys = blankKeys(stem);
  const setAnswer = (key: string, value: string) => onChange({ ...answers, [key]: value });
  return <div className="slot-list">
    <b>答案空位配置</b>
    {keys.map((key) => <div className="slot-row" key={key}>
      <span>{key}</span>
      <span>{slotType}</span>
      {slotType === 'compare_symbol' ? (
        <select value={answers[key] ?? '='} onChange={(e) => setAnswer(key, e.target.value)}>
          <option>&gt;</option>
          <option>&lt;</option>
          <option>=</option>
        </select>
      ) : (
        <input value={answers[key] ?? ''} onChange={(e) => setAnswer(key, e.target.value)} placeholder="标准答案" />
      )}
    </div>)}
  </div>;
}

export function FillBlankBatchTool({
  onApply,
}: {
  onApply: (stem: string, answers: Record<string, string>) => void;
}) {
  const [text, setText] = useState('一个四位数，从右边起第一位是[个]位，第三位是[百]位；最大的四位数是[9999]，最小的四位数是[1000]。');
  const apply = () => {
    const answers: Record<string, string> = {};
    let index = 0;
    const stem = text.replace(/\[([^\]]*)\]/g, (_all, answer: string) => {
      index += 1;
      answers[`blank_${index}`] = String(answer ?? '').trim();
      return `{{blank:${index}}}`;
    });
    onApply(stem, answers);
  };
  return <details className="batch-tool">
    <summary>批量录入填空题</summary>
    <p className="tip" style={{ marginTop: 'var(--space-2)', marginBottom: 'var(--space-3)' }}>把答案写在英文中括号里，例如：最大四位数是[9999]。系统会自动生成空位和标准答案。</p>
    <textarea value={text} onChange={(e) => setText(e.target.value)} />
    <div className="rowActions" style={{ display: 'flex', gap: 'var(--space-2)', marginTop: 'var(--space-2)' }}>
      <button type="button" className="btn btn-primary btn-sm" onClick={apply}>生成填空题</button>
      <button type="button" className="btn btn-secondary btn-sm" onClick={() => setText('')}>清空</button>
    </div>
  </details>;
}

export function ChoiceEditor({ state, set, multiple }: { state: AppState; set: SetAppStateField; multiple: boolean }) {
  const [batchText, setBatchText] = useState(`下面算式正确的是（ ）
A. 20×3=60
B. 48÷6=6
C. 56÷7=8
D. 11×4=40
答案：${multiple ? 'A,C' : 'A'}`);
  const applyBatch = () => {
    const lines = batchText.split(/\r?\n/).map((line) => line.trim()).filter(Boolean);
    const optionLines: string[] = [];
    const stemLines: string[] = [];
    let answer = '';
    for (const line of lines) {
      const answerMatch = line.match(/^答案[:：]\s*(.+)$/);
      if (answerMatch) {
        answer = answerMatch[1].replace(/[，、；; ]+/g, ',').replace(/,+$/g, '');
        continue;
      }
      const optionMatch = line.match(/^([A-ZＡ-Ｚ])[\.\．、)]\s*(.+)$/i);
      if (optionMatch) {
        const key = optionMatch[1].toUpperCase().replace(/[Ａ-Ｚ]/g, (char) => String.fromCharCode(char.charCodeAt(0) - 65248));
        optionLines.push(`${key},${optionMatch[2].trim()}`);
      } else {
        stemLines.push(line);
      }
    }
    if (stemLines.length) set('choiceStem', stemLines.join('\n'));
    if (optionLines.length) set('choiceOptionsText', optionLines.join('\n'));
    if (answer) set('choiceAnswer', answer);
  };
  return <>
    <details className="batch-tool">
      <summary>批量录入{multiple ? '多选题' : '单选题'}</summary>
      <p className="tip" style={{ marginTop: 'var(--space-2)', marginBottom: 'var(--space-3)' }}>支持“题干 + A/B/C/D 选项 + 答案：A,C”格式，一键拆成题干、选项和答案。</p>
      <textarea value={batchText} onChange={(e) => setBatchText(e.target.value)} />
      <div className="rowActions" style={{ display: 'flex', gap: 'var(--space-2)', marginTop: 'var(--space-2)' }}>
        <button type="button" className="btn btn-primary btn-sm" onClick={applyBatch}>解析选择题</button>
        <button type="button" className="btn btn-secondary btn-sm" onClick={() => setBatchText('')}>清空</button>
      </div>
    </details>
    <label>题干</label>
    <textarea value={state.choiceStem} onChange={(e) => set('choiceStem', e.target.value)} />
    <label>选项（每行一个，格式：选项编号,选项内容）</label>
    <textarea value={state.choiceOptionsText} onChange={(e) => set('choiceOptionsText', e.target.value)} />
    <label>{multiple ? '正确答案（多个用英文逗号分隔，例如 A,C）' : '正确答案（例如 A）'}</label>
    <input value={state.choiceAnswer} onChange={(e) => set('choiceAnswer', e.target.value)} />
  </>;
}

export function OrderingEditor({ state, set }: { state: AppState; set: SetAppStateField }) {
  return <>
    <label>排序方向 / 展示符号</label>
    <select value={state.orderingSeparator} onChange={(e) => set('orderingSeparator', e.target.value as AppState['orderingSeparator'])}>
      <option value=">">从大到小（使用 &gt;）</option>
      <option value="<">从小到大（使用 &lt;）</option>
    </select>
    <label>待排序内容（每行：序号,数值）</label>
    <textarea value={state.orderingText} onChange={(e) => set('orderingText', e.target.value)} />
    <label>正确顺序（填写序号，用英文逗号分隔）</label>
    <input value={state.orderingAnswer} onChange={(e) => set('orderingAnswer', e.target.value)} />
  </>;
}

export function MatchingEditor({ state, set }: { state: AppState; set: SetAppStateField }) {
  return <>
    <label>左侧内容（每行一个）</label>
    <textarea value={state.matchingLeft} onChange={(e) => set('matchingLeft', e.target.value)} />
    <label>右侧内容（每行一个）</label>
    <textarea value={state.matchingRight} onChange={(e) => set('matchingRight', e.target.value)} />
    <label>答案连线（每行一组，格式：左侧=&gt;右侧）</label>
    <textarea value={state.matchingAnswer} onChange={(e) => set('matchingAnswer', e.target.value)} />
  </>;
}

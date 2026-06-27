import { useRef, useState } from 'react';
import type { SlotType } from '@kids-quiz/shared-types';
import type { AppState } from '../../types/editor';
import { blankKeys, blankKeysOrdered, nextBlankNumber } from '../../utils/blanks';

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

export function AnswerSlotEditor({
  stem,
  slotType,
  answers,
  onChange,
  onStemChange,
}: {
  stem: string;
  slotType: SlotType;
  answers: Record<string, string>;
  onChange: (answers: Record<string, string>) => void;
  onStemChange?: (stem: string) => void;
}) {
  // 严格按题干出现顺序，答案区与题干空位一一对应
  const keys = blankKeysOrdered(stem);
  const setAnswer = (key: string, value: string) => onChange({ ...answers, [key]: value });

  // 删除某空位：从题干移除对应 {{blank:n}}，并清理其答案
  const removeBlank = (key: string) => {
    if (!onStemChange) return;
    const num = key.replace('blank_', '');
    const token = `{{blank:${num}}}`;
    const nextStem = stem.split(token).join('').replace(/\s{2,}/g, ' ').trim();
    onStemChange(nextStem);
    const nextAnswers = { ...answers };
    delete nextAnswers[key];
    onChange(nextAnswers);
  };

  return <div className="slot-list">
    <div className="slot-list-head">
      <b>答案空位配置</b>
      {onStemChange && <span className="tip">题干中的空位会自动同步到这里</span>}
    </div>
    {keys.length === 0 && <p className="tip">题干里还没有空位。点上方「插入空位」或在题干里写 <code>{'{{blank:1}}'}</code> 添加。</p>}
    {keys.map((key, index) => <div className="slot-row" key={key}>
      <span className="slot-row-key">第 {index + 1} 空 <small>{key}</small></span>
      <span className="badge badge-muted">{slotType}</span>
      {slotType === 'compare_symbol' ? (
        <select value={answers[key] ?? '='} onChange={(e) => setAnswer(key, e.target.value)}>
          <option value="&gt;">&gt;</option>
          <option value="&lt;">&lt;</option>
          <option value="=">=</option>
        </select>
      ) : (
        <input value={answers[key] ?? ''} onChange={(e) => setAnswer(key, e.target.value)} placeholder="标准答案" aria-label={`${key} 的标准答案`} />
      )}
      {onStemChange && <button type="button" className="btn btn-ghost btn-sm slot-remove" onClick={() => removeBlank(key)} aria-label={`删除空位 ${key}`} title="从题干移除该空位">✕</button>}
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
  // 把现有 choiceOptionsText（"A,内容" 每行）解析成结构化选项
  const options = parseChoiceOptions(state.choiceOptionsText);
  const answerKeys = state.choiceAnswer.split(',').map((s) => s.trim()).filter(Boolean);
  const correctSet = new Set(answerKeys);

  // 结构化选项变更时，同步写回 choiceOptionsText 和 choiceAnswer（保持向下兼容）
  const syncToText = (nextOptions: { key: string; text: string }[], nextCorrect: Set<string>) => {
    set('choiceOptionsText', nextOptions.map((o) => `${o.key},${o.text}`).join('\n'));
    set('choiceAnswer', [...nextCorrect].join(','));
  };

  const updateOptionText = (key: string, text: string) => {
    const next = options.map((o) => (o.key === key ? { ...o, text } : o));
    syncToText(next, correctSet);
  };

  const toggleCorrect = (key: string) => {
    let nextCorrect: Set<string>;
    if (multiple) {
      nextCorrect = new Set(correctSet);
      if (nextCorrect.has(key)) nextCorrect.delete(key);
      else nextCorrect.add(key);
    } else {
      // 单选：点当前已选的则取消，否则替换
      nextCorrect = correctSet.has(key) ? new Set() : new Set([key]);
    }
    syncToText(options, nextCorrect);
  };

  const addOption = () => {
    const nextKey = nextOptionKey(options);
    const next = [...options, { key: nextKey, text: '' }];
    syncToText(next, correctSet);
  };

  const removeOption = (key: string) => {
    const next = options.filter((o) => o.key !== key);
    const nextCorrect = new Set(correctSet);
    nextCorrect.delete(key);
    syncToText(next, nextCorrect);
  };

  const moveOption = (index: number, dir: -1 | 1) => {
    const target = index + dir;
    if (target < 0 || target >= options.length) return;
    const next = [...options];
    [next[index], next[target]] = [next[target], next[index]];
    syncToText(next, correctSet);
  };

  return <div className="choice-editor">
    <details className="batch-tool">
      <summary>批量录入{multiple ? '多选题' : '单选题'}（粘贴整段解析）</summary>
      <p className="tip" style={{ marginTop: 'var(--space-2)', marginBottom: 'var(--space-3)' }}>支持"题干 + A.选项 + 答案：A,C"格式，一键拆成结构化选项。</p>
      <ChoiceBatchImporter
        multiple={multiple}
        onApply={(stem, opts, answer) => {
          set('choiceStem', stem);
          set('choiceOptionsText', opts.map((o) => `${o.key},${o.text}`).join('\n'));
          set('choiceAnswer', answer);
        }}
      />
    </details>

    <label>题干</label>
    <textarea value={state.choiceStem} onChange={(e) => set('choiceStem', e.target.value)} rows={2} placeholder="例：8×6 的结果是？" />

    <div className="choice-options-head">
      <label>选项（点 ✓ 标记正确答案，答案会自动同步）</label>
      <button type="button" className="btn btn-outline btn-sm" onClick={addOption}>＋ 添加选项</button>
    </div>

    <div className="choice-options-list">
      {options.length === 0 && <p className="tip">还没有选项，点「添加选项」开始，或用上方批量录入。</p>}
      {options.map((opt, index) => {
        const isCorrect = correctSet.has(opt.key);
        return (
          <div className={`choice-option-row ${isCorrect ? 'is-correct' : ''}`} key={opt.key}>
            <span className="choice-option-key">{opt.key}</span>
            <input
              className="choice-option-input"
              value={opt.text}
              onChange={(e) => updateOptionText(opt.key, e.target.value)}
              placeholder={`选项 ${opt.key} 的内容`}
              aria-label={`选项 ${opt.key}`}
            />
            <button
              type="button"
              className={`choice-correct-toggle ${isCorrect ? 'active' : ''}`}
              onClick={() => toggleCorrect(opt.key)}
              title={isCorrect ? '已标记为正确' : '标记为正确'}
              aria-label={`标记选项 ${opt.key} 为正确`}
              aria-pressed={isCorrect}
            >{isCorrect ? '✓' : '○'}</button>
            <div className="choice-option-actions">
              <button type="button" className="btn btn-ghost btn-sm" disabled={index === 0} onClick={() => moveOption(index, -1)} aria-label="上移">↑</button>
              <button type="button" className="btn btn-ghost btn-sm" disabled={index === options.length - 1} onClick={() => moveOption(index, 1)} aria-label="下移">↓</button>
              <button type="button" className="btn btn-ghost btn-sm slot-remove" onClick={() => removeOption(opt.key)} aria-label={`删除选项 ${opt.key}`}>✕</button>
            </div>
          </div>
        );
      })}
    </div>

    <div className="choice-answer-summary">
      <span className="badge badge-success">正确答案：{answerKeys.length ? answerKeys.join('、') : '（未标记）'}</span>
      {!multiple && answerKeys.length > 1 && <span className="tip">单选题只应有一个正确答案</span>}
      {multiple && answerKeys.length < 1 && <span className="tip">多选题至少标记一个正确答案</span>}
    </div>
  </div>;
}

function nextOptionKey(options: { key: string }[]) {
  const used = new Set(options.map((o) => o.key));
  for (let i = 0; i < 26; i += 1) {
    const k = String.fromCharCode(65 + i);
    if (!used.has(k)) return k;
  }
  return `O${options.length + 1}`;
}

function parseChoiceOptions(text: string): { key: string; text: string }[] {
  const lines = text.split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
  return lines.map((line, index) => {
    const m = line.match(/^([A-ZＡ-Ｚ])[\.\．、,)]\s*(.+)$/i);
    if (m) {
      const key = m[1].toUpperCase().replace(/[Ａ-Ｚ]/g, (c) => String.fromCharCode(c.charCodeAt(0) - 65248));
      return { key, text: m[2].trim() };
    }
    return { key: String.fromCharCode(65 + index), text: line };
  });
}

export function ChoiceBatchImporter({ multiple, onApply }: { multiple: boolean; onApply: (stem: string, options: { key: string; text: string }[], answer: string) => void }) {
  const [batchText, setBatchText] = useState(`下面算式正确的是（ ）
A. 20×3=60
B. 48÷6=6
C. 56÷7=8
D. 11×4=40
答案：${multiple ? 'A,C' : 'A'}`);
  const apply = () => {
    const lines = batchText.split(/\r?\n/).map((line) => line.trim()).filter(Boolean);
    const optionLines: { key: string; text: string }[] = [];
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
        const key = optionMatch[1].toUpperCase().replace(/[Ａ-Ｚ]/g, (c) => String.fromCharCode(c.charCodeAt(0) - 65248));
        optionLines.push({ key, text: optionMatch[2].trim() });
      } else {
        stemLines.push(line);
      }
    }
    onApply(stemLines.join('\n'), optionLines, answer);
  };
  return <>
    <textarea value={batchText} onChange={(e) => setBatchText(e.target.value)} rows={6} />
    <div className="rowActions" style={{ display: 'flex', gap: 'var(--space-2)', marginTop: 'var(--space-2)' }}>
      <button type="button" className="btn btn-primary btn-sm" onClick={apply}>解析并填入</button>
      <button type="button" className="btn btn-secondary btn-sm" onClick={() => setBatchText('')}>清空</button>
    </div>
  </>;
}

export function OrderingEditor({ state, set }: { state: AppState; set: SetAppStateField }) {
  // 把 orderingText（"序号,值" 每行）解析为结构化项；答案（orderingAnswer 是 key 序列）决定正确顺序
  const rawItems = parseOrderingItems(state.orderingText);
  const answerKeys = state.orderingAnswer.split(',').map((s) => s.trim()).filter(Boolean);

  // 若有答案序列，按答案顺序排列展示（录入者看到的就是正确顺序）；否则按录入顺序
  const orderedItems = answerKeys.length
    ? answerKeys.map((k) => rawItems.find((it) => it.key === k)).filter(Boolean) as OrderingItemParsed[]
    : rawItems;

  const sync = (items: OrderingItemParsed[]) => {
    set('orderingText', items.map((it, i) => `${it.key},${it.value || it.label || ''}`).join('\n'));
    set('orderingAnswer', items.map((it) => it.key).join(','));
  };

  const updateValue = (key: string, value: string) => {
    sync(orderedItems.map((it) => (it.key === key ? { ...it, value, label: value } : it)));
  };

  const addItem = () => {
    const used = new Set(orderedItems.map((it) => it.key));
    let nextKey = String(orderedItems.length + 1);
    let i = 1;
    while (used.has(nextKey)) { i += 1; nextKey = String(orderedItems.length + i); }
    sync([...orderedItems, { key: nextKey, label: nextKey, value: '' }]);
  };

  const removeItem = (key: string) => {
    sync(orderedItems.filter((it) => it.key !== key));
  };

  const moveItem = (index: number, dir: -1 | 1) => {
    const target = index + dir;
    if (target < 0 || target >= orderedItems.length) return;
    const next = [...orderedItems];
    [next[index], next[target]] = [next[target], next[index]];
    sync(next);
  };

  // HTML5 拖拽排序
  const dragIndexRef = useRef<number>(-1);
  const onDragStart = (index: number) => () => { dragIndexRef.current = index; };
  const onDrop = (index: number) => (e: React.DragEvent) => {
    e.preventDefault();
    const from = dragIndexRef.current;
    if (from < 0 || from === index) return;
    const next = [...orderedItems];
    const [moved] = next.splice(from, 1);
    next.splice(index, 0, moved);
    sync(next);
    dragIndexRef.current = -1;
  };

  return <div className="ordering-editor">
    <label>排序方向 / 展示符号</label>
    <select value={state.orderingSeparator} onChange={(e) => set('orderingSeparator', e.target.value as AppState['orderingSeparator'])}>
      <option value=">">从大到小（使用 &gt;）</option>
      <option value="<">从小到大（使用 &lt;）</option>
    </select>
    <p className="tip">按正确顺序排列下方项目（拖拽或用 ↑↓ 调整）。孩子端会打乱顺序让孩子排。</p>

    <div className="choice-options-head">
      <label>待排序项目（当前顺序即为正确答案）</label>
      <button type="button" className="btn btn-outline btn-sm" onClick={addItem}>＋ 添加项目</button>
    </div>

    <div className="ordering-list">
      {orderedItems.length === 0 && <p className="tip">还没有项目，点「添加项目」开始。</p>}
      {orderedItems.map((item, index) => (
        <div
          className="ordering-item"
          key={item.key}
          draggable
          onDragStart={onDragStart(index)}
          onDragOver={(e) => e.preventDefault()}
          onDrop={onDrop(index)}
        >
          <span className="ordering-drag" title="拖拽排序" aria-hidden="true">⠿</span>
          <span className="ordering-position">{index + 1}</span>
          <input
            className="ordering-input"
            value={item.value}
            onChange={(e) => updateValue(item.key, e.target.value)}
            placeholder={`项目 ${item.key} 的内容`}
            aria-label={`第 ${index + 1} 个项目`}
          />
          <div className="choice-option-actions">
            <button type="button" className="btn btn-ghost btn-sm" disabled={index === 0} onClick={() => moveItem(index, -1)} aria-label="上移">↑</button>
            <button type="button" className="btn btn-ghost btn-sm" disabled={index === orderedItems.length - 1} onClick={() => moveItem(index, 1)} aria-label="下移">↓</button>
            <button type="button" className="btn btn-ghost btn-sm slot-remove" onClick={() => removeItem(item.key)} aria-label="删除项目">✕</button>
          </div>
        </div>
      ))}
    </div>

    <div className="choice-answer-summary">
      <span className="badge badge-success">正确顺序：{orderedItems.length ? orderedItems.map((it) => it.key).join(' → ') : '（无）'}</span>
    </div>
  </div>;
}

type OrderingItemParsed = { key: string; label: string; value: string };

function parseOrderingItems(text: string): OrderingItemParsed[] {
  const lines = text.split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
  return lines.map((line, index) => {
    const parts = line.split(',');
    const key = (parts[0] || String(index + 1)).trim();
    const value = (parts.slice(1).join(',') || '').trim();
    return { key, label: key, value };
  });
}

export function MatchingEditor({ state, set }: { state: AppState; set: SetAppStateField }) {
  const left = state.matchingLeft.split('\n').map((s) => s.trim()).filter(Boolean);
  const right = state.matchingRight.split('\n').map((s) => s.trim()).filter(Boolean);
  const pairs = parseMatchingPairs(state.matchingAnswer, left, right);

  const [selectedLeft, setSelectedLeft] = useState<number | null>(null);

  const sync = (nextPairs: { left: string; right: string }[]) => {
    set('matchingAnswer', nextPairs.map((p) => `${p.left}=>${p.right}`).join('\n'));
  };

  const updateLeft = (index: number, value: string) => {
    const next = left.map((s, i) => (i === index ? value : s));
    set('matchingLeft', next.join('\n'));
  };
  const updateRight = (index: number, value: string) => {
    const next = right.map((s, i) => (i === index ? value : s));
    set('matchingRight', next.join('\n'));
  };
  const addLeft = () => set('matchingLeft', [...left, ''].join('\n'));
  const addRight = () => set('matchingRight', [...right, ''].join('\n'));
  const removeLeft = (index: number) => {
    const removed = left[index];
    const next = left.filter((_, i) => i !== index);
    set('matchingLeft', next.join('\n'));
    // 清理涉及该项的连线
    sync(pairs.filter((p) => p.left !== removed));
  };
  const removeRight = (index: number) => {
    const removed = right[index];
    const next = right.filter((_, i) => i !== index);
    set('matchingRight', next.join('\n'));
    sync(pairs.filter((p) => p.right !== removed));
  };

  // 点左侧：选中/取消选中；再点右侧：建立/断开连线
  const onLeftClick = (index: number) => {
    const text = left[index];
    if (pairs.some((p) => p.left === text)) {
      // 已有连线：断开
      sync(pairs.filter((p) => p.left !== text));
      setSelectedLeft(null);
    } else {
      setSelectedLeft(selectedLeft === index ? null : index);
    }
  };
  const onRightClick = (index: number) => {
    if (selectedLeft === null) return;
    const leftText = left[selectedLeft];
    const rightText = right[index];
    // 移除左侧已有的旧连线，建立新连线
    const next = pairs.filter((p) => p.left !== leftText && p.right !== rightText);
    next.push({ left: leftText, right: rightText });
    sync(next);
    setSelectedLeft(null);
  };

  const pairedLeft = new Set(pairs.map((p) => p.left));
  const pairedRight = new Set(pairs.map((p) => p.right));

  return <div className="matching-editor">
    <p className="tip">在左右两列分别输入内容，然后<b>点左侧、再点右侧</b>建立连线。已连线的项再次点击可断开。</p>

    <div className="matching-columns">
      <div className="matching-col">
        <div className="choice-options-head">
          <label>左侧（{left.length}）</label>
          <button type="button" className="btn btn-outline btn-sm" onClick={addLeft}>＋</button>
        </div>
        <div className="matching-list">
          {left.map((text, index) => {
            const isSelected = selectedLeft === index;
            const isPaired = pairedLeft.has(text);
            return (
              <div className={`matching-row ${isSelected ? 'selected' : ''} ${isPaired ? 'paired' : ''}`} key={`L${index}`}>
                <button type="button" className="matching-pick" onClick={() => onLeftClick(index)} aria-label={`选择左侧第 ${index + 1} 项`}>
                  {text || `（空 ${index + 1}）`}
                </button>
                <input className="matching-edit" value={text} onChange={(e) => updateLeft(index, e.target.value)} placeholder={`左侧 ${index + 1}`} aria-label={`左侧第 ${index + 1} 项内容`} />
                <button type="button" className="btn btn-ghost btn-sm slot-remove" onClick={() => removeLeft(index)} aria-label="删除">✕</button>
              </div>
            );
          })}
          {left.length === 0 && <p className="tip">点 ＋ 添加左侧内容</p>}
        </div>
      </div>

      <div className="matching-col">
        <div className="choice-options-head">
          <label>右侧（{right.length}）</label>
          <button type="button" className="btn btn-outline btn-sm" onClick={addRight}>＋</button>
        </div>
        <div className="matching-list">
          {right.map((text, index) => {
            const isPaired = pairedRight.has(text);
            const disabled = selectedLeft === null;
            return (
              <div className={`matching-row ${isPaired ? 'paired' : ''}`} key={`R${index}`}>
                <button type="button" className="matching-pick" disabled={disabled} onClick={() => onRightClick(index)} aria-label={`选择右侧第 ${index + 1} 项`}>
                  {text || `（空 ${index + 1}）`}
                </button>
                <input className="matching-edit" value={text} onChange={(e) => updateRight(index, e.target.value)} placeholder={`右侧 ${index + 1}`} aria-label={`右侧第 ${index + 1} 项内容`} />
                <button type="button" className="btn btn-ghost btn-sm slot-remove" onClick={() => removeRight(index)} aria-label="删除">✕</button>
              </div>
            );
          })}
          {right.length === 0 && <p className="tip">点 ＋ 添加右侧内容</p>}
        </div>
      </div>
    </div>

    {/* 连线关系列表 */}
    <div className="matching-pairs">
      <label>已建立的连线（{pairs.length}）</label>
      {pairs.length === 0 && <p className="tip">还没有连线，点左侧再点右侧开始。</p>}
      <div className="matching-pairs-list">
        {pairs.map((p, i) => (
          <div className="matching-pair" key={i}>
            <span className="badge badge-primary">{p.left}</span>
            <span className="matching-arrow">→</span>
            <span className="badge badge-accent">{p.right}</span>
            <button type="button" className="btn btn-ghost btn-sm slot-remove" onClick={() => sync(pairs.filter((_, j) => j !== i))} aria-label="断开连线">✕</button>
          </div>
        ))}
      </div>
    </div>
  </div>;
}

function parseMatchingPairs(text: string, left: string[], right: string[]): { left: string; right: string }[] {
  const lines = text.split('\n').map((s) => s.trim()).filter(Boolean);
  return lines.map((line) => {
    const [l, r] = line.split('=>').map((s) => s.trim());
    return { left: l || '', right: r || '' };
  }).filter((p) => p.left && p.right && left.includes(p.left) && right.includes(p.right));
}

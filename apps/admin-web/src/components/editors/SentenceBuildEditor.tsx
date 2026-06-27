import { useRef, useState } from 'react';
import type { AppState } from '../../types/editor';

type SetAppStateField = <K extends keyof AppState>(key: K, value: AppState[K]) => void;

type Token = { key: string; text: string; isPunct: boolean };

/** 中文标点（独立成块） */
const PUNCT_CHARS = new Set(['，', '。', '！', '？', '；', '、', '.', ',', '!', '?', ';', ':', '"', '"', '\'', '\'', '「', '」', '“', '”', '（', '）', '(', ')']);

function isPunctChar(ch: string): boolean {
  return PUNCT_CHARS.has(ch);
}

/**
 * 把 sentenceTokens 文本解析为结构化 token
 * 文本格式：每行一个词；标点行用 `#` 前缀，如 `#。`
 */
export function parseSentenceTokens(text: string): Token[] {
  const lines = text.split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
  return lines.map((line, index) => {
    if (line.startsWith('#')) {
      return { key: String(index + 1), text: line.slice(1).trim(), isPunct: true };
    }
    // 单字符且为标点 → 自动识别
    const autoPunct = line.length === 1 && isPunctChar(line);
    return { key: String(index + 1), text: line, isPunct: autoPunct };
  });
}

function tokensToText(tokens: Token[]): string {
  return tokens.map((t) => (t.isPunct && !isPunctChar(t.text) ? `#${t.text}` : t.text)).join('\n');
}

function nextTokenKey(tokens: Token[]) {
  let max = 0;
  for (const t of tokens) {
    const n = Number(t.key);
    if (!Number.isNaN(n) && n > max) max = n;
  }
  return String(max + 1);
}

/**
 * 连词成句编辑器
 * - 词块列表（拖拽 + ↑↓ 调序，当前顺序即正确语序）
 * - 每个词块可切换「标点」属性（标点块渲染更小、贴近前词）
 * - 批量工具：粘贴整句自动按空格/标点拆词
 */
export function SentenceBuildEditor({ state, set }: { state: AppState; set: SetAppStateField }) {
  const tokens = parseSentenceTokens(state.sentenceTokens);
  // 有答案序列时按答案排序展示（=正确语序），否则按录入顺序
  const answerKeys = state.sentenceAnswer.split(',').map((s) => s.trim()).filter(Boolean);
  const orderedTokens = answerKeys.length
    ? answerKeys.map((k) => tokens.find((t) => t.key === k)).filter(Boolean) as Token[]
    : tokens;

  const sync = (nextTokens: Token[]) => {
    set('sentenceTokens', tokensToText(nextTokens));
    set('sentenceAnswer', nextTokens.map((t) => t.key).join(','));
  };

  const updateText = (key: string, text: string) => {
    sync(orderedTokens.map((t) => (t.key === key ? { ...t, text } : t)));
  };

  const togglePunct = (key: string) => {
    sync(orderedTokens.map((t) => (t.key === key ? { ...t, isPunct: !t.isPunct } : t)));
  };

  const addToken = (isPunct = false) => {
    const next = [...orderedTokens, { key: nextTokenKey(orderedTokens), text: '', isPunct }];
    sync(next);
  };

  const removeToken = (key: string) => {
    sync(orderedTokens.filter((t) => t.key !== key));
  };

  const moveToken = (index: number, dir: -1 | 1) => {
    const target = index + dir;
    if (target < 0 || target >= orderedTokens.length) return;
    const next = [...orderedTokens];
    [next[index], next[target]] = [next[target], next[index]];
    sync(next);
  };

  // 批量拆句：粘贴整句，自动按空格拆词、标点独立成块
  const [batchText, setBatchText] = useState('');
  const [batchOpen, setBatchOpen] = useState(false);
  const splitSentence = () => {
    const text = batchText.trim();
    if (!text) return;
    const result: Token[] = [];
    let i = 1;
    // 先按空格拆，再把每个片段末尾的标点拆出来
    const segments = text.split(/\s+/);
    for (const seg of segments) {
      if (!seg) continue;
      // 末尾标点
      let core = seg;
      const trailingPuncts: string[] = [];
      while (core.length > 0 && isPunctChar(core[core.length - 1])) {
        trailingPuncts.unshift(core[core.length - 1]);
        core = core.slice(0, -1);
      }
      if (core) result.push({ key: String(i++), text: core, isPunct: false });
      for (const p of trailingPuncts) result.push({ key: String(i++), text: p, isPunct: true });
    }
    sync(result);
    setBatchText('');
    setBatchOpen(false);
  };

  // HTML5 拖拽
  const dragIndexRef = useRef<number>(-1);
  const onDragStart = (index: number) => () => { dragIndexRef.current = index; };
  const onDrop = (index: number) => (e: React.DragEvent) => {
    e.preventDefault();
    const from = dragIndexRef.current;
    if (from < 0 || from === index) return;
    const next = [...orderedTokens];
    const [moved] = next.splice(from, 1);
    next.splice(index, 0, moved);
    sync(next);
    dragIndexRef.current = -1;
  };

  return (
    <div className="sentence-build-editor">
      <label className="fill-label">题干（孩子看到的提示语）</label>
      <textarea
        className="fill-stem-textarea"
        value={state.stem && state.stem !== '____' ? state.stem : ''}
        onChange={(e) => set('stem', e.target.value)}
        placeholder="把下面的词连成一句话，注意标点也要排到正确位置。"
        rows={2}
      />
      <p className="tip">
        把词块按<b>正确语序</b>排列（拖拽或 ↑↓）。标点（如 <code>。</code> <code>.</code> <code>？</code>）要单独成块，孩子必须排到正确位置才判对。
      </p>

      {/* 批量拆句工具 */}
      <div className="fill-toolbar">
        <button type="button" className="btn btn-outline btn-sm" onClick={() => setBatchOpen((v) => !v)}>
          {batchOpen ? '收起批量拆句' : '批量拆句（粘贴整句自动拆词）'}
        </button>
        <button type="button" className="btn btn-primary btn-sm" onClick={() => addToken(false)}>＋ 添加词</button>
        <button type="button" className="btn btn-secondary btn-sm" onClick={() => addToken(true)}>＋ 添加标点</button>
      </div>
      {batchOpen && (
        <div className="batch-tool-content">
          <textarea
            placeholder="粘贴整句，如：I am a boy.  或  春天 来 了 。"
            value={batchText}
            onChange={(e) => setBatchText(e.target.value)}
            rows={3}
          />
          <div className="rowActions" style={{ marginTop: 'var(--space-2)' }}>
            <button type="button" className="btn btn-primary btn-sm" onClick={splitSentence}>拆词并填入</button>
            <button type="button" className="btn btn-secondary btn-sm" onClick={() => setBatchText('')}>清空</button>
          </div>
        </div>
      )}

      {/* 词块列表 */}
      <div className="ordering-list">
        {orderedTokens.length === 0 && <p className="tip">还没有词块，点「添加词」或用批量拆句开始。</p>}
        {orderedTokens.map((token, index) => (
          <div
            className={`ordering-item sentence-token-row ${token.isPunct ? 'is-punct' : ''}`}
            key={token.key}
            draggable
            onDragStart={onDragStart(index)}
            onDragOver={(e) => e.preventDefault()}
            onDrop={onDrop(index)}
          >
            <span className="ordering-drag" title="拖拽调序" aria-hidden="true">⠿</span>
            <span className="ordering-position">{index + 1}</span>
            <input
              className={`ordering-input ${token.isPunct ? 'punct-input' : ''}`}
              value={token.text}
              onChange={(e) => updateText(token.key, e.target.value)}
              placeholder={token.isPunct ? '标点，如 。 . ？' : '词或词组'}
              aria-label={`第 ${index + 1} 个词块`}
            />
            <button
              type="button"
              className={`choice-correct-toggle ${token.isPunct ? 'active' : ''}`}
              style={{ width: 36, height: 36, fontSize: 12 }}
              onClick={() => togglePunct(token.key)}
              title={token.isPunct ? '已标记为标点' : '标记为标点'}
              aria-label={`切换标点属性`}
              aria-pressed={token.isPunct}
            >标</button>
            <div className="choice-option-actions">
              <button type="button" className="btn btn-ghost btn-sm" disabled={index === 0} onClick={() => moveToken(index, -1)} aria-label="上移">↑</button>
              <button type="button" className="btn btn-ghost btn-sm" disabled={index === orderedTokens.length - 1} onClick={() => moveToken(index, 1)} aria-label="下移">↓</button>
              <button type="button" className="btn btn-ghost btn-sm slot-remove" onClick={() => removeToken(token.key)} aria-label="删除">✕</button>
            </div>
          </div>
        ))}
      </div>

      {/* 预览：拼成的句子 */}
      <div className="fill-preview">
        <div className="fill-preview-label">正确语序预览</div>
        <div className="fill-preview-body sentence-preview">
          {orderedTokens.length === 0 && <span className="fill-preview-empty">添加词块后这里显示拼成的句子</span>}
          {orderedTokens.map((t, i) => (
            <span key={t.key} className={t.isPunct ? 'sentence-preview-punct' : 'sentence-preview-word'}>
              {t.text || '＿'}{!t.isPunct && i < orderedTokens.length - 1 ? ' ' : ''}
            </span>
          ))}
        </div>
      </div>

      <div className="choice-answer-summary">
        <span className="badge badge-success">正确语序：{orderedTokens.length ? orderedTokens.map((t) => t.key).join(' → ') : '（无）'}</span>
        {orderedTokens.length < 2 && <span className="tip">至少需要 2 个词块</span>}
      </div>
    </div>
  );
}

import { useMemo, useState } from 'react';
import { QuestionPreview } from '@kids-quiz/question-render';
import type { QuestionDraft } from '@kids-quiz/shared-types';
import { saveQuestionGroup } from '../api/questionGroups';

const DEFAULT_TEXT = '一个四位数，从右边起第一位是[个]位，第三位是[百]位；最大的四位数是[9999]，最小的四位数是[1000]。\n\n由 5 个千、3 个百和 6 个一组成的数是[5306]，读作[五千三百零六]。';
type SplitMode = 'blankLine' | 'line';

type ParsedItem = {
  sourceIndex: number;
  raw: string;
  draft: ReturnType<typeof makeDraft>;
  errors: string[];
};

function parseFillBlank(text: string) {
  const answers: Record<string, string> = {};
  let index = 0;
  const stem = text.replace(/\[([^\]]*)\]/g, (_all, answer: string) => {
    index += 1;
    answers['blank_' + index] = String(answer ?? '').trim();
    return '{{blank:' + index + '}}';
  });
  return { stem, answers };
}

function answerSlots(stem: string, answers: Record<string, string>) {
  const keys = Array.from(stem.matchAll(/\{\{blank(?::(\d+))?\}\}/g)).map((match, index) => 'blank_' + (match[1] || index + 1));
  return keys.map((key) => ({ slot_key: key, slot_type: 'number' as const, correct_answer: [answers[key] ?? ''] }));
}

function compactTitle(stem: string, fallback: string) {
  const text = stem.replace(/\{\{blank(?::[^}]+)?\}\}/g, '____').replace(/\s+/g, ' ').trim();
  return text ? (text.length > 28 ? text.slice(0, 28) + '…' : text) : fallback;
}

function splitBlocks(text: string, mode: SplitMode) {
  const source = text.trim();
  if (!source) return [];
  if (mode === 'line') return source.split(/\r?\n/g).map((block) => block.trim()).filter(Boolean);
  return source.split(/\n\s*\n/g).map((block) => block.trim()).filter(Boolean);
}

function makeDraft(block: string, index: number, meta: { gradeLevel: string; difficulty: number; tags: string[] }) {
  const parsed = parseFillBlank(block);
  const question: QuestionDraft = {
    question_type: 'fill_blank',
    stem: parsed.stem,
    answer_slots: answerSlots(parsed.stem, parsed.answers),
  };
  return {
    type: 'question' as const,
    title: compactTitle(parsed.stem, '批量填空题 ' + (index + 1)),
    ...meta,
    question,
  };
}

function validateBlock(block: string, draft: ReturnType<typeof makeDraft>) {
  const errors: string[] = [];
  if (!block.trim()) errors.push('题目为空');
  if (!draft.question.answer_slots.length) errors.push('没有检测到 [答案]，请用英文中括号标注答案');
  if (draft.question.answer_slots.some((slot) => !String(slot.correct_answer[0] ?? '').trim())) errors.push('存在空答案，中括号里不能留空');
  return errors;
}

function toParsedItems(blocks: string[], meta: { gradeLevel: string; difficulty: number; tags: string[] }) {
  return blocks.map((block, index) => {
    const draft = makeDraft(block, index, meta);
    return { sourceIndex: index, raw: block, draft, errors: validateBlock(block, draft) };
  });
}

export function BatchFillBlankPage({ onBack }: { onBack: () => void }) {
  const [text, setText] = useState(DEFAULT_TEXT);
  const [splitMode, setSplitMode] = useState<SplitMode>('blankLine');
  const [edits, setEdits] = useState<Record<number, string>>({});
  const [deleted, setDeleted] = useState<Record<number, boolean>>({});
  const [gradeLevel, setGradeLevel] = useState('二年级');
  const [difficulty, setDifficulty] = useState(1);
  const [tagsText, setTagsText] = useState('数学,填空题');
  const [message, setMessage] = useState('');
  const [saving, setSaving] = useState(false);
  const [savedIds, setSavedIds] = useState<string[]>([]);

  const tags = useMemo(() => tagsText.split(/[,，\n]/).map((item) => item.trim()).filter(Boolean), [tagsText]);
  const sourceBlocks = useMemo(() => splitBlocks(text, splitMode), [text, splitMode]);
  const activeBlocks = useMemo(() => sourceBlocks
    .map((block, index) => ({ block: edits[index] ?? block, index }))
    .filter((item) => !deleted[item.index]), [sourceBlocks, edits, deleted]);
  const parsedItems = useMemo(() => toParsedItems(activeBlocks.map((item) => item.block), { gradeLevel, difficulty: Number(difficulty || 1), tags }), [activeBlocks, gradeLevel, difficulty, tags]);
  const invalidCount = parsedItems.filter((item) => item.errors.length).length;
  const drafts = parsedItems.map((item) => item.draft);

  const updateText = (value: string) => {
    setText(value);
    setEdits({});
    setDeleted({});
    setSavedIds([]);
  };

  const saveAll = async () => {
    if (!drafts.length) { setMessage('请先录入至少一道填空题。'); return; }
    if (invalidCount) { setMessage('存在校验不通过的题目，请先修正或删除。'); return; }
    try {
      setSaving(true);
      setSavedIds([]);
      const ids: string[] = [];
      for (const [index, draft] of drafts.entries()) {
        try {
          const saved = await saveQuestionGroup(draft);
          ids.push(String(saved.id));
        } catch (error) {
          setSavedIds(ids);
          setMessage('已保存 ' + ids.length + ' 道，第 ' + (index + 1) + ' 道保存失败：' + (error instanceof Error ? error.message : String(error)));
          return;
        }
      }
      setSavedIds(ids);
      setMessage('已批量保存 ' + ids.length + ' 道填空题到题库。可返回题库查看。');
    } catch (error) {
      setMessage('批量保存失败：' + (error instanceof Error ? error.message : String(error)));
    } finally {
      setSaving(false);
    }
  };

  return <div className="question-editor-page animate-fadeIn">
    <header className="page-header" style={{ marginBottom: 'var(--space-5)' }}>
      <div className="page-header-left">
        <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-3)' }}>
          <button className="btn btn-ghost btn-sm" onClick={onBack} aria-label="返回题库">←</button>
          <h1 className="page-title">批量录入填空题</h1>
        </div>
        <p className="page-subtitle">把答案写在英文中括号里；可按空行或每行拆题，每道题都能单独校验、编辑和删除。</p>
      </div>
      <div className="page-actions">
        <button className="btn btn-primary btn-sm" onClick={saveAll} disabled={saving || !drafts.length || invalidCount > 0}>{saving ? '保存中...' : '批量保存到题库'}</button>
      </div>
    </header>

    {message && <div className="message-banner success" style={{ marginBottom: 'var(--space-4)' }}>{message}</div>}
    {savedIds.length > 0 && (
      <div className="message-banner info" style={{ marginBottom: 'var(--space-4)' }}>
        已保存题组 ID：{savedIds.join('、')}
        <button className="btn btn-soft btn-sm" style={{ marginLeft: 'var(--space-3)' }} onClick={onBack}>返回题库查看</button>
      </div>
    )}

    <div className="editor-layout">
      <section className="editor-panel">
        <div className="card" style={{ marginBottom: 'var(--space-4)' }}>
          <h2 style={{ fontSize: 'var(--text-lg)', borderBottom: '1px solid var(--border-light)', paddingBottom: 'var(--space-2)', marginBottom: 'var(--space-3)', color: 'var(--text-primary)' }}>1. 批量题目内容</h2>
          <div className="meta-grid">
            <label>年级<input value={gradeLevel} onChange={(e) => setGradeLevel(e.target.value)} /></label>
            <label>难度<input type="number" min={1} max={5} value={difficulty} onChange={(e) => setDifficulty(Number(e.target.value))} /></label>
            <label>标签/知识点<input value={tagsText} onChange={(e) => setTagsText(e.target.value)} /></label>
          </div>
          <label style={{ marginTop: 'var(--space-3)' }}>分题方式</label>
          <select value={splitMode} onChange={(e) => { setSplitMode(e.target.value as SplitMode); setEdits({}); setDeleted({}); }}>
            <option value="blankLine">按空行分隔：适合一道题有多行内容</option>
            <option value="line">每行一道题：适合短填空题快速录入</option>
          </select>
          <label style={{ marginTop: 'var(--space-3)' }}>批量文本</label>
          <textarea style={{ minHeight: 220 }} value={text} onChange={(e) => updateText(e.target.value)} />
          <p className="tip">示例：最大四位数是[9999]。中括号中的内容会作为标准答案；保存前可在下方逐题微调。</p>
        </div>

        <div className="card" style={{ marginBottom: 'var(--space-4)' }}>
          <h2 style={{ fontSize: 'var(--text-lg)', marginBottom: 'var(--space-3)' }}>2. 逐题校验与编辑</h2>
          <div style={{ display: 'grid', gap: 'var(--space-3)' }}>
            {activeBlocks.map((item, activeIndex) => {
              const parsed = parsedItems[activeIndex];
              return <div key={item.index} style={{ border: '1px solid var(--border-default)', borderRadius: 'var(--radius-lg)', padding: 'var(--space-3)', background: parsed?.errors.length ? 'var(--rose-50)' : 'var(--bg-muted)' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', gap: 'var(--space-2)', alignItems: 'center', marginBottom: 'var(--space-2)' }}>
                  <b>第 {activeIndex + 1} 题</b>
                  <button className="btn btn-danger btn-sm" onClick={() => setDeleted((prev) => ({ ...prev, [item.index]: true }))}>删除本题</button>
                </div>
                <textarea style={{ minHeight: 72 }} value={item.block} onChange={(e) => setEdits((prev) => ({ ...prev, [item.index]: e.target.value }))} />
                {parsed?.errors.length ? <p className="tip" style={{ color: 'var(--rose-600)' }}>校验失败：{parsed.errors.join('；')}</p> : <p className="tip" style={{ color: 'var(--emerald-600)' }}>校验通过：{parsed.draft.question.answer_slots.length} 个空</p>}
              </div>;
            })}
            {!activeBlocks.length && <p className="tip">暂无题目，请在上方录入带 [答案] 的文本。</p>}
          </div>
        </div>
      </section>

      <section className="preview-panel">
        <h2 style={{ fontSize: 'var(--text-lg)', paddingBottom: 'var(--space-2)', marginBottom: 'var(--space-3)', color: 'var(--text-primary)' }}>实时预览（{drafts.length} 道）</h2>
        {invalidCount > 0 && <div className="message-banner warning" style={{ marginBottom: 'var(--space-3)' }}>有 {invalidCount} 道题校验不通过。</div>}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-3)' }}>
          {parsedItems.map((item, index) => <section className="preview-paper" key={index} style={{ borderColor: item.errors.length ? 'var(--rose-200)' : undefined }}>
            <h2>{index + 1}. {item.draft.title}</h2>
            <QuestionPreview question={item.draft.question} />
            {item.errors.length > 0 && <p className="tip" style={{ color: 'var(--rose-600)' }}>暂不能保存：{item.errors.join('；')}</p>}
          </section>)}
          {!drafts.length && <div className="empty-state"><p className="empty-state-title">暂无预览</p><p className="empty-state-desc">请在左侧录入带 [答案] 的填空题。</p></div>}
        </div>
      </section>
    </div>
  </div>;
}

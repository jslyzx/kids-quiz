import { useRef, useState } from 'react';
import type { SlotType } from '@kids-quiz/shared-types';
import { AnswerSlotEditor, FillBlankBatchTool } from './BasicEditors';
import { nextBlankNumber } from '../../utils/blanks';

interface Props {
  stem: string;
  slotType: SlotType;
  answers: Record<string, string>;
  onStemChange: (stem: string) => void;
  onAnswersChange: (answers: Record<string, string>) => void;
}

/**
 * 填空题可视化编辑器
 * - 题干区：textarea，工具栏「插入空位」在光标位置插入 {{blank:n}}
 * - 预览区：实时把 {{blank:n}} 渲染为下划线占位，所见即所得
 * - 答案区：与题干空位严格联动（增/删同步）
 * - 批量工具：用 [答案] 语法一键生成（折叠在顶部）
 */
export function FillBlankEditor({ stem, slotType, answers, onStemChange, onAnswersChange }: Props) {
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const [batchOpen, setBatchOpen] = useState(false);

  // 在 textarea 光标位置插入空位占位符
  const insertBlankAtCursor = () => {
    const ta = textareaRef.current;
    if (!ta) {
      // 兜底：追加到末尾
      const num = nextBlankNumber(stem);
      onStemChange(`${stem}{{blank:${num}}}`);
      return;
    }
    const start = ta.selectionStart ?? stem.length;
    const end = ta.selectionEnd ?? stem.length;
    const num = nextBlankNumber(stem);
    const token = `{{blank:${num}}}`;
    const next = stem.slice(0, start) + token + stem.slice(end);
    onStemChange(next);
    // 恢复光标到插入内容之后
    requestAnimationFrame(() => {
      ta.focus();
      const pos = start + token.length;
      ta.setSelectionRange(pos, pos);
    });
  };

  // 预览：把 {{blank:n}} 替换为可视化下划线
  const renderPreview = () => {
    if (!stem.trim()) return <span className="fill-preview-empty">题干预览（输入题干后这里会显示学生看到的样子）</span>;
    const parts: React.ReactNode[] = [];
    const re = /\{\{blank:(\d+)\}\}/g;
    let last = 0;
    let m: RegExpExecArray | null;
    let i = 0;
    while ((m = re.exec(stem))) {
      if (m.index > last) parts.push(<span key={`t-${i}`}>{stem.slice(last, m.index)}</span>);
      parts.push(
        <span className="fill-preview-blank" key={`b-${i}`} title={`空位 blank_${m[1]}`}>
          空{m[1]}
        </span>,
      );
      last = re.lastIndex;
      i += 1;
    }
    if (last < stem.length) parts.push(<span key={`t-end`}>{stem.slice(last)}</span>);
    return parts;
  };

  return (
    <div className="fill-blank-editor">
      {/* 工具栏 */}
      <div className="fill-toolbar">
        <button type="button" className="btn btn-primary btn-sm" onClick={insertBlankAtCursor}>
          ＋ 插入空位
        </button>
        <button type="button" className="btn btn-outline btn-sm" onClick={() => setBatchOpen((v) => !v)}>
          {batchOpen ? '收起批量录入' : '批量录入（用 [答案] 语法）'}
        </button>
      </div>

      {/* 批量录入工具 */}
      {batchOpen && (
        <FillBlankBatchTool
          onApply={(nextStem, nextAnswers) => {
            onStemChange(nextStem);
            onAnswersChange(nextAnswers);
            setBatchOpen(false);
          }}
        />
      )}

      {/* 题干输入 */}
      <label className="fill-label">题干（点「插入空位」在光标处添加填空）</label>
      <textarea
        ref={textareaRef}
        className="fill-stem-textarea"
        value={stem}
        onChange={(e) => onStemChange(e.target.value)}
        placeholder="例：1200 里有 {{blank:1}} 个百，最小四位数是 {{blank:2}}。"
        rows={4}
      />
      <p className="tip">也可直接在题干里输入 <code>{'{{blank:1}}'}</code>、<code>{'{{blank:2}}'}</code> 等，编号从 1 开始。</p>

      {/* 实时预览 */}
      <div className="fill-preview">
        <div className="fill-preview-label">学生看到的题干</div>
        <div className="fill-preview-body">{renderPreview()}</div>
      </div>

      {/* 答案区：与题干联动 */}
      <AnswerSlotEditor
        stem={stem}
        slotType={slotType}
        answers={answers}
        onChange={onAnswersChange}
        onStemChange={onStemChange}
      />
    </div>
  );
}

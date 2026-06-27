import { useState } from 'react';
import type { AppState } from '../../types/editor';
import { FillBlankBatchTool, ChoiceBatchImporter } from './BasicEditors';

type SetAppStateField = <K extends keyof AppState>(key: K, value: AppState[K]) => void;

interface Props {
  state: AppState;
  set: SetAppStateField;
  onApplied: () => void;
}

/**
 * 批量粘贴录入面板
 * 把原本藏在 <details> 里的批量工具提升为独立 Tab，
 * 按题型分组，统一语法提示。
 */
export function BatchEntryPanel({ state, set, onApplied }: Props) {
  const [batchType, setBatchType] = useState<'fill_blank' | 'single_choice' | 'multiple_choice' | 'calculation'>('fill_blank');

  return (
    <div className="batch-entry-panel">
      <div className="card">
        <h2 style={{ fontSize: 'var(--text-lg)', marginBottom: 'var(--space-3)' }}>批量粘贴录入</h2>
        <p className="tip" style={{ marginBottom: 'var(---space-4)' }}>
          把整段题目粘贴进来，系统自动拆分成结构化题目。选择题型后按示例格式粘贴。
        </p>

        {/* 题型切换 */}
        <div className="batch-type-tabs" role="tablist">
          <button role="tab" aria-selected={batchType === 'fill_blank'} className={`batch-type-tab ${batchType === 'fill_blank' ? 'active' : ''}`} onClick={() => setBatchType('fill_blank')}>填空题</button>
          <button role="tab" aria-selected={batchType === 'single_choice'} className={`batch-type-tab ${batchType === 'single_choice' ? 'active' : ''}`} onClick={() => setBatchType('single_choice')}>单选题</button>
          <button role="tab" aria-selected={batchType === 'multiple_choice'} className={`batch-type-tab ${batchType === 'multiple_choice' ? 'active' : ''}`} onClick={() => setBatchType('multiple_choice')}>多选题</button>
          <button role="tab" aria-selected={batchType === 'calculation'} className={`batch-type-tab ${batchType === 'calculation' ? 'active' : ''}`} onClick={() => setBatchType('calculation')}>口算题</button>
        </div>

        <div className="batch-content">
          {batchType === 'fill_blank' && (
            <FillBlankBatchTool
              onApply={(stem, answers) => {
                set('mode', 'fill_blank');
                set('stem', stem);
                set('answers', answers);
              }}
            />
          )}
          {(batchType === 'single_choice' || batchType === 'multiple_choice') && (
            <ChoiceBatchImporter
              multiple={batchType === 'multiple_choice'}
              onApply={(stem, opts, answer) => {
                set('mode', batchType);
                set('choiceStem', stem);
                set('choiceOptionsText', opts.map((o) => `${o.key},${o.text}`).join('\n'));
                set('choiceAnswer', answer);
              }}
            />
          )}
          {batchType === 'calculation' && (
            <div className="batch-tool-content">
              <p className="tip" style={{ marginBottom: 'var(--space-3)' }}>每行一道口算题，格式：题干=答案。例：20×3=60</p>
              <textarea
                style={{ minHeight: 180 }}
                placeholder={'20×3=60\n48÷6=8\n15+27=42\n...'}
                onChange={(e) => { set('mode', 'calculation'); set('calcText', e.target.value); }}
              />
              <p className="tip" style={{ marginTop: 'var(--space-2)' }}>粘贴后切到「单题录入」可继续编辑和预览。</p>
            </div>
          )}
        </div>

        <div className="rowActions" style={{ marginTop: 'var(--space-4)' }}>
          <button className="btn btn-primary" onClick={onApplied}>填入后去单题录入编辑</button>
        </div>
      </div>
    </div>
  );
}

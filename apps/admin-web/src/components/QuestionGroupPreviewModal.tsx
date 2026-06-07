import { CalculationGroupPreview, CompositePreview, QuestionPreview } from '@kids-quiz/question-render';
import { dbGroupToPreviewDraft } from '../utils/dbPreview';

export function QuestionGroupPreviewModal({ group, onClose, onEdit }: { group: any; onClose: () => void; onEdit: (id: string) => void }) {
  if (!group) return null;
  const draft = dbGroupToPreviewDraft(group) as any;

  return <div className="modal-overlay" onClick={onClose}>
    <div className="modal-panel" onClick={(e) => e.stopPropagation()}>
      <div className="modal-header">
        <div><h2>{group.title || '未命名题目'}</h2><p>ID：{group.id} / 类型：{group.groupType}</p></div>
        <div>
          <button className="btn btn-primary btn-sm" onClick={() => onEdit(String(group.id))}>编辑</button>
          <button className="btn btn-secondary btn-sm" style={{ marginLeft: 'var(--space-2)' }} onClick={onClose}>关闭</button>
        </div>
      </div>
      <div className="modal-body">
        {draft.type === 'calculation_group' && <section className="preview-paper"><h2>{draft.title}</h2><CalculationGroupPreview items={draft.items} columns={draft.columns} /></section>}
        {draft.type === 'composite_group' && <CompositePreview title={draft.title} commonStem={draft.commonStem} table={draft.table} materials={draft.materials} children={draft.children} />}
        {draft.type === 'question' && <section className="preview-paper"><h2>{draft.title}</h2><QuestionPreview question={draft.question} /></section>}
        <details className="db-detail" style={{ marginTop: 'var(--space-4)' }}><summary style={{ fontWeight: 800, cursor: 'pointer' }}>原始 JSON</summary><pre className="json-preview">{JSON.stringify(group, null, 2)}</pre></details>
      </div>
    </div>
  </div>;
}

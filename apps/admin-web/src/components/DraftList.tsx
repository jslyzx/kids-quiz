import type { SavedDraft } from '../types/editor';

export function DraftList({
  drafts,
  onLoad,
  onDelete,
}: {
  drafts: SavedDraft[];
  onLoad: (draft: SavedDraft) => void;
  onDelete: (id: string) => void;
}) {
  if (!drafts.length) return <p className="tip">暂无本地草稿，点击“保存草稿”后会显示在这里。</p>;

  return <details className="draftList">
    <summary>本地草稿：{drafts.length} 个</summary>
    {drafts.map((draft) => <div className="draftItem" key={draft.id}>
      <div><b>{draft.name}</b><small>{draft.updatedAt}</small></div>
      <div><button onClick={() => onLoad(draft)}>载入</button><button className="danger" onClick={() => onDelete(draft.id)}>删除</button></div>
    </div>)}
  </details>;
}

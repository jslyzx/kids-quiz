export function DbGroupList({
  groups,
  selected,
  editingId,
  onRefresh,
  onSelect,
  onEdit,
}: {
  groups: any[];
  selected: any;
  editingId: string | null;
  onRefresh: () => void;
  onSelect: (id: string) => void;
  onEdit: (id: string) => void;
}) {
  return <section className="dbList">
    <div className="subHead"><h3>后端题库</h3><button onClick={onRefresh}>刷新</button></div>
    {!groups.length ? <p className="tip">暂无后端题目，请先保存到后端。</p> : groups.map((group) => (
      <div className="draftItem" key={group.id}>
        <div><b>{group.title}</b><small>类型：{group.groupType} / 小题：{group._count?.questions ?? '-'}</small></div>
        <div><button onClick={() => onSelect(group.id)}>查看</button><button onClick={() => onEdit(group.id)}>{editingId === String(group.id) ? '编辑中' : '编辑'}</button></div>
      </div>
    ))}
    {selected && <details className="dbDetail">
      <summary>当前选中：{selected.title}</summary>
      <pre className="json">{JSON.stringify(selected, null, 2)}</pre>
    </details>}
  </section>;
}

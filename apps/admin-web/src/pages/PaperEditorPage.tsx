import { useEffect, useMemo, useState } from 'react';
import { CalculationGroupPreview, CompositePreview, QuestionPreview } from '@kids-quiz/question-render';
import { addPaperQuestionGroup, getPaper, removePaperItem, reorderPaperItems, updatePaper } from '../api/papers';
import { listQuestionGroups } from '../api/questionGroups';
import { dbGroupToPreviewDraft } from '../utils/dbPreview';

type Props = {
  paperId: string;
  onBack: () => void;
  onPreview: () => void;
};

function renderGroupPreview(group: any) {
  const draft = dbGroupToPreviewDraft(group) as any;
  if (draft.type === 'calculation_group') {
    return <section className="preview-paper mini-paper"><h2>{draft.title}</h2><CalculationGroupPreview items={draft.items} columns={draft.columns} /></section>;
  }
  if (draft.type === 'composite_group') {
    return <div className="mini-paper"><CompositePreview title={draft.title} commonStem={draft.commonStem} table={draft.table} materials={draft.materials} children={draft.children} /></div>;
  }
  if (draft.type === 'question') {
    return <section className="preview-paper mini-paper"><h2>{draft.title}</h2><QuestionPreview question={draft.question} /></section>;
  }
  return <pre className="json-preview">{JSON.stringify(group, null, 2)}</pre>;
}

export function PaperEditorPage({ paperId, onBack, onPreview }: Props) {
  const [paper, setPaper] = useState<any>(null);
  const [groups, setGroups] = useState<any[]>([]);
  const [selectedGroupId, setSelectedGroupId] = useState('');
  const [message, setMessage] = useState('');
  const [loading, setLoading] = useState(false);
  const [previewGroup, setPreviewGroup] = useState<any>(null);
  const [metaTitle, setMetaTitle] = useState('');
  const [metaDescription, setMetaDescription] = useState('');

  const selectedIds = useMemo(() => new Set((paper?.items || []).map((item: any) => String(item.groupId))), [paper]);
  const availableGroups = useMemo(() => groups.filter((group) => !selectedIds.has(String(group.id))), [groups, selectedIds]);

  const refresh = async () => {
    try {
      setLoading(true);
      const [paperData, groupData] = await Promise.all([getPaper(paperId), listQuestionGroups()]);
      setPaper(paperData);
      setGroups(groupData);
      setMetaTitle(paperData.title || '');
      setMetaDescription(paperData.description || '');
      setSelectedGroupId(groupData.find((group) => !new Set((paperData.items || []).map((item: any) => String(item.groupId))).has(String(group.id)))?.id?.toString() || '');
      setMessage(`已加载试卷：${paperData.title}`);
    } catch (error) {
      setMessage(`加载失败：${error instanceof Error ? error.message : String(error)}`);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { void refresh(); }, [paperId]);

  const addSelected = async (groupId = selectedGroupId) => {
    if (!groupId) {
      setMessage('请先选择一道题目');
      return;
    }
    try {
      const updated = await addPaperQuestionGroup(paperId, groupId);
      setPaper(updated);
      setMessage('已加入试卷');
    } catch (error) {
      setMessage(`加入失败：${error instanceof Error ? error.message : String(error)}`);
    }
  };

  const remove = async (itemId: string) => {
    if (!confirm(`确认从试卷中移除题目项 ID：${itemId}？`)) return;
    try {
      const updated = await removePaperItem(paperId, itemId);
      setPaper(updated);
      setMessage('已从试卷移除');
    } catch (error) {
      setMessage(`移除失败：${error instanceof Error ? error.message : String(error)}`);
    }
  };

  const saveMeta = async () => {
    try {
      const updated = await updatePaper(paperId, { title: metaTitle, description: metaDescription });
      setPaper(updated);
      setMessage('已保存试卷信息');
    } catch (error) {
      setMessage(`保存失败：${error instanceof Error ? error.message : String(error)}`);
    }
  };

  const moveItem = async (index: number, direction: -1 | 1) => {
    const items = paper?.items || [];
    const targetIndex = index + direction;
    if (targetIndex < 0 || targetIndex >= items.length) return;
    const nextItems = [...items];
    [nextItems[index], nextItems[targetIndex]] = [nextItems[targetIndex], nextItems[index]];
    try {
      const updated = await reorderPaperItems(paperId, nextItems.map((item: any) => String(item.id)));
      setPaper(updated);
      setMessage('已调整题目顺序');
    } catch (error) {
      setMessage(`排序失败：${error instanceof Error ? error.message : String(error)}`);
    }
  };

  return <div className="paper-editor-page animate-fadeIn">
    <header className="page-header" style={{ marginBottom: 'var(--space-5)' }}>
      <div className="page-header-left">
        <h1>Kids Quiz 编辑试卷</h1>
        <p className="page-subtitle">从题库选择题目加入试卷，右侧可查看当前试卷结构。</p>
      </div>
    </header>
    <div className="paper-editor-layout">
      <section className="card" style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-3)' }}>
        <div className="toolbar">
          <button className="btn btn-secondary btn-sm" onClick={onBack}>返回试卷管理</button>
          <button className="btn btn-outline btn-sm" onClick={onPreview}>学生预览</button>
          <button className="btn btn-outline btn-sm" onClick={refresh}>{loading ? '加载中...' : '刷新'}</button>
        </div>
        {message && <p className="message">{message}</p>}
        <div className="paper-meta-box">
          <h2>试卷信息</h2>
          <label>试卷标题</label>
          <input value={metaTitle} onChange={(event) => setMetaTitle(event.target.value)} />
          <label>试卷说明</label>
          <textarea value={metaDescription} onChange={(event) => setMetaDescription(event.target.value)} placeholder="可选，例如：第二单元课后练习" />
          <button className="btn btn-primary btn-sm" style={{ marginTop: 'var(--space-3)' }} onClick={saveMeta}>保存试卷信息</button>
          <small style={{ marginTop: 'var(--space-2)' }}>ID：{paperId} / 题目数：{paper?.items?.length ?? 0}</small>
        </div>

        <h2>加入题目</h2>
        <div className="add-question-box">
          <select value={selectedGroupId} onChange={(event) => setSelectedGroupId(event.target.value)}>
            <option value="">请选择题库题目</option>
            {availableGroups.map((group) => <option key={group.id} value={group.id}>{group.title}（{group.groupType}）</option>)}
          </select>
          <button className="btn btn-primary btn-sm" onClick={() => addSelected()}>加入试卷</button>
        </div>

        <div className="questionPickerList" style={{ display: 'grid', gap: 'var(--space-2)' }}>
          {availableGroups.map((group) => <div className="picker-item" key={group.id}>
            <div>
              <b>{group.title}</b>
              <small>ID：{group.id} / 类型：{group.groupType} / 小题：{group.questions?.length ?? 0}</small>
            </div>
            <div className="rowActions">
              <button className="btn btn-secondary btn-sm" onClick={() => setPreviewGroup(group)}>预览</button>
              <button className="btn btn-primary btn-sm" onClick={() => addSelected(String(group.id))}>加入</button>
            </div>
          </div>)}
          {!availableGroups.length && <p className="tip">题库暂无可加入题目，或所有题目已经加入当前试卷。</p>}
        </div>
      </section>

      <section className="card" style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-3)' }}>
        <h2>当前试卷题目</h2>
        <div className="paperItemList" style={{ display: 'grid', gap: 'var(--space-3)' }}>
          {(paper?.items || []).map((item: any, index: number) => <div className="paper-item" key={item.id}>
            <div className="paper-item-head">
              <div>
                <b>{index + 1}. {item.group?.title || item.question?.stem || '未命名题目'}</b>
                <small>题目项 ID：{item.id} / 题库 ID：{item.groupId || item.questionId} / 类型：{item.group?.groupType || item.question?.questionType}</small>
              </div>
              <div className="rowActions">
                <button className="btn btn-secondary btn-sm" disabled={index === 0} onClick={() => moveItem(index, -1)}>上移</button>
                <button className="btn btn-secondary btn-sm" disabled={index === (paper?.items?.length ?? 0) - 1} onClick={() => moveItem(index, 1)}>下移</button>
                <button className="btn btn-danger btn-sm" onClick={() => remove(String(item.id))}>移除</button>
              </div>
            </div>
            {item.group && renderGroupPreview(item.group)}
          </div>)}
          {!paper?.items?.length && <p className="tip">当前试卷还没有题目，请从左侧题库加入。</p>}
        </div>
      </section>
    </div>

    {previewGroup && <div className="modal-overlay" onClick={() => setPreviewGroup(null)}>
      <div className="modal-panel" onClick={(event) => event.stopPropagation()}>
        <div className="modal-header">
          <div><h2>{previewGroup.title}</h2><p>ID：{previewGroup.id} / 类型：{previewGroup.groupType}</p></div>
          <button className="btn btn-secondary btn-sm" onClick={() => setPreviewGroup(null)}>关闭</button>
        </div>
        <div className="modal-body">{renderGroupPreview(previewGroup)}</div>
      </div>
    </div>}
  </div>;
}

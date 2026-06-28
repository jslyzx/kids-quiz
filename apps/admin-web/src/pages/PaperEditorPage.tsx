import { useEffect, useMemo, useRef, useState } from 'react';
import { CalculationGroupPreview, CompositePreview, QuestionPreview } from '@kids-quiz/question-render';
import { addPaperQuestionGroup, getPaper, removePaperItem, reorderPaperItems, updatePaper } from '../api/papers';
import { getQuestionGroup, listQuestionGroups } from '../api/questionGroups';
import { dbGroupToPreviewDraft } from '../utils/dbPreview';
import { useToast } from '../components/ToastProvider';
import { ConfirmDialog, Modal } from '../components/Modal';

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

function groupStemPreview(group: any) {
  const firstStem = group.questions?.[0]?.stem || group.commonStem || '';
  return String(firstStem)
    .replace(/\{\{blank(?::[^}]+)?\}\}/g, '____')
    .replace(/\{_[0-9]+\}/g, '____')
    .replace(/\{\{math:(.+?)\}\}/g, '$1')
    .replace(/\\\((.+?)\\\)/g, '$1')
    .replace(/\\\[(.+?)\\\]/g, '$1')
    .replace(/\s+/g, ' ')
    .trim();
}

function groupTags(group: any): string[] {
  return Array.isArray(group.tags) ? group.tags.map(String).filter(Boolean) : [];
}

export function PaperEditorPage({ paperId, onBack, onPreview }: Props) {
  const { toast } = useToast();
  const [paper, setPaper] = useState<any>(null);
  const [groups, setGroups] = useState<any[]>([]);
  const [selectedGroupId, setSelectedGroupId] = useState('');
  const [pickerKeyword, setPickerKeyword] = useState('');
  const [pickerType, setPickerType] = useState('ALL');
  const [pickerGrade, setPickerGrade] = useState('');
  const [pickerTag, setPickerTag] = useState('');
  const [loading, setLoading] = useState(false);
  const [previewGroup, setPreviewGroup] = useState<any>(null);
  const [removeTarget, setRemoveTarget] = useState<{ id: string; title: string } | null>(null);
  const [metaTitle, setMetaTitle] = useState('');
  const [metaDescription, setMetaDescription] = useState('');
  const refreshSeqRef = useRef(0);

  const selectedIds = useMemo(() => new Set((paper?.items || []).map((item: any) => String(item.groupId))), [paper]);
  const availableGroups = useMemo(() => groups.filter((group) => !selectedIds.has(String(group.id))), [groups, selectedIds]);
  const pickerFilteredGroups = useMemo(() => {
    const keyword = pickerKeyword.trim().toLowerCase();
    const grade = pickerGrade.trim();
    const tag = pickerTag.trim();
    return availableGroups.filter((group) => {
      const tags = groupTags(group);
      const searchText = [
        group.id,
        group.title,
        group.groupType,
        group.gradeLevel,
        groupStemPreview(group),
        ...tags,
      ].map((item) => String(item ?? '').toLowerCase()).join(' ');
      return (!keyword || searchText.includes(keyword))
        && (pickerType === 'ALL' || group.groupType === pickerType)
        && (!grade || String(group.gradeLevel ?? '').includes(grade))
        && (!tag || tags.some((item) => item.includes(tag)));
    });
  }, [availableGroups, pickerGrade, pickerKeyword, pickerTag, pickerType]);
  const pickerTypes = useMemo(() => Array.from(new Set(availableGroups.map((group) => String(group.groupType || '')).filter(Boolean))), [availableGroups]);
  const pickerGrades = useMemo(() => Array.from(new Set(availableGroups.map((group) => String(group.gradeLevel || '')).filter(Boolean))), [availableGroups]);
  const pickerTags = useMemo(() => Array.from(new Set(availableGroups.flatMap(groupTags))).slice(0, 12), [availableGroups]);

  const refresh = async () => {
    const seq = refreshSeqRef.current + 1;
    refreshSeqRef.current = seq;
    try {
      setLoading(true);
      const [paperData, groupData] = await Promise.all([getPaper(paperId), listQuestionGroups({ limit: 5000 })]);
      if (seq !== refreshSeqRef.current) return;
      setPaper(paperData);
      setGroups(groupData);
      setMetaTitle(paperData.title || '');
      setMetaDescription(paperData.description || '');
      setSelectedGroupId(groupData.find((group) => !new Set((paperData.items || []).map((item: any) => String(item.groupId))).has(String(group.id)))?.id?.toString() || '');
    } catch (error) {
      if (seq === refreshSeqRef.current) toast.danger(`加载失败：${error instanceof Error ? error.message : String(error)}`);
    } finally {
      if (seq === refreshSeqRef.current) setLoading(false);
    }
  };

  useEffect(() => { void refresh(); }, [paperId]);
  useEffect(() => {
    if (!selectedGroupId || pickerFilteredGroups.some((group) => String(group.id) === selectedGroupId)) return;
    setSelectedGroupId(pickerFilteredGroups[0]?.id?.toString() || '');
  }, [pickerFilteredGroups, selectedGroupId]);

  const addSelected = async (groupId = selectedGroupId) => {
    if (!groupId) {
      toast.warning('请先选择一道题目');
      return;
    }
    try {
      const updated = await addPaperQuestionGroup(paperId, groupId);
      setPaper(updated);
      toast.success('已加入试卷');
    } catch (error) {
      toast.danger(`加入失败：${error instanceof Error ? error.message : String(error)}`);
    }
  };

  const previewAvailableGroup = async (groupId: string) => {
    try {
      const group = await getQuestionGroup(groupId);
      setPreviewGroup(group);
    } catch (error) {
      toast.danger(`预览加载失败：${error instanceof Error ? error.message : String(error)}`);
    }
  };

  const confirmRemove = async () => {
    if (!removeTarget) return;
    try {
      const updated = await removePaperItem(paperId, removeTarget.id);
      setPaper(updated);
      toast.success('已从试卷移除');
    } catch (error) {
      toast.danger(`移除失败：${error instanceof Error ? error.message : String(error)}`);
    } finally {
      setRemoveTarget(null);
    }
  };

  const saveMeta = async () => {
    try {
      const updated = await updatePaper(paperId, { title: metaTitle, description: metaDescription });
      setPaper(updated);
      toast.success('已保存试卷信息');
    } catch (error) {
      toast.danger(`保存失败：${error instanceof Error ? error.message : String(error)}`);
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
    } catch (error) {
      toast.danger(`排序失败：${error instanceof Error ? error.message : String(error)}`);
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
        <div className="filter-bar" style={{ display: 'grid', gridTemplateColumns: '1.4fr 1fr 1fr 1fr', gap: 'var(--space-2)' }}>
          <input placeholder="搜索标题、题干、ID、标签" value={pickerKeyword} onChange={(event) => setPickerKeyword(event.target.value)} />
          <select value={pickerType} onChange={(event) => setPickerType(event.target.value)}>
            <option value="ALL">全部类型</option>
            {pickerTypes.map((item) => <option value={item} key={item}>{item}</option>)}
          </select>
          <input list="paper-picker-grades" placeholder="年级" value={pickerGrade} onChange={(event) => setPickerGrade(event.target.value)} />
          <input list="paper-picker-tags" placeholder="标签" value={pickerTag} onChange={(event) => setPickerTag(event.target.value)} />
          <datalist id="paper-picker-grades">{pickerGrades.map((item) => <option value={item} key={item} />)}</datalist>
          <datalist id="paper-picker-tags">{pickerTags.map((item) => <option value={item} key={item} />)}</datalist>
        </div>
        <div className="add-question-box">
          <select value={selectedGroupId} onChange={(event) => setSelectedGroupId(event.target.value)}>
            <option value="">请选择题库题目</option>
            {pickerFilteredGroups.map((group) => <option key={group.id} value={group.id}>{group.title}（{group.groupType}）</option>)}
          </select>
          <button className="btn btn-primary btn-sm" onClick={() => addSelected()}>加入试卷</button>
        </div>
        <small style={{ color: 'var(--text-muted)', fontWeight: 800 }}>可加入 {availableGroups.length} 个，当前筛选 {pickerFilteredGroups.length} 个。</small>

        <div className="questionPickerList" style={{ display: 'grid', gap: 'var(--space-2)' }}>
          {pickerFilteredGroups.map((group) => <div className="picker-item" key={group.id}>
            <div>
              <b>{group.title}</b>
              <small>ID：{group.id} / 类型：{group.groupType} / 年级：{group.gradeLevel || '-'} / 小题：{group.questions?.length ?? 0}</small>
              {groupStemPreview(group) && <small style={{ display: 'block', marginTop: 4, color: 'var(--text-muted)' }}>{groupStemPreview(group).slice(0, 80)}</small>}
            </div>
            <div className="rowActions">
              <button className="btn btn-secondary btn-sm" onClick={() => void previewAvailableGroup(String(group.id))}>预览</button>
              <button className="btn btn-primary btn-sm" onClick={() => addSelected(String(group.id))}>加入</button>
            </div>
          </div>)}
          {!availableGroups.length && <p className="tip">题库暂无可加入题目，或所有题目已经加入当前试卷。</p>}
          {!!availableGroups.length && !pickerFilteredGroups.length && <p className="tip">当前筛选条件下没有可加入题目。</p>}
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
                <button className="btn btn-danger btn-sm" onClick={() => setRemoveTarget({ id: String(item.id), title: item.group?.title || item.question?.stem || '未命名题目' })}>移除</button>
              </div>
            </div>
            {item.group && renderGroupPreview(item.group)}
          </div>)}
          {!paper?.items?.length && <p className="tip">当前试卷还没有题目，请从左侧题库加入。</p>}
        </div>
      </section>
    </div>

    {previewGroup && (
      <Modal
        open={!!previewGroup}
        onClose={() => setPreviewGroup(null)}
        title={previewGroup.title}
        description={`ID：${previewGroup.id} / 类型：${previewGroup.groupType}`}
        width={1100}
      >
        {renderGroupPreview(previewGroup)}
      </Modal>
    )}

    <ConfirmDialog
      open={!!removeTarget}
      title="从试卷移除题目"
      danger
      confirmText="移除"
      description={removeTarget ? `确认从试卷中移除「${removeTarget.title}」？题目本身在题库中不会被删除，可随时再次加入。` : ''}
      onConfirm={confirmRemove}
      onCancel={() => setRemoveTarget(null)}
    />
  </div>;
}

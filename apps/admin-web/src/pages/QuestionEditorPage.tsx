import React, { useEffect, useMemo, useState } from 'react';
import { CalculationGroupPreview, CompositePreview, QuestionPreview } from '@kids-quiz/question-render';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { bulkRemoveQuestionGroupTags, getQuestionGroup, listQuestionGroups, saveQuestionGroup, updateQuestionGroup } from '../api/questionGroups';
import { uploadImage } from '../api/uploads';
import type { AppState, EditorMode, SavedDraft } from '../types/editor';
import { blankKeys } from '../utils/blanks';
import { buildDraft, dbGroupToAppState, defaultState, emptyState } from '../utils/questionDraft';
import { AnswerSlotEditor, CalculationEditor, ChoiceEditor, MatchingEditor, OrderingEditor } from '../components/editors/BasicEditors';
import { CompositeEditor } from '../components/editors/CompositeEditor';
import { RichTextEditor } from '../components/RichTextEditor';

const STORAGE_KEY = 'kids-quiz-admin-question-draft-v1';
const DRAFT_LIST_KEY = 'kids-quiz-admin-question-draft-list-v1';

function loadDraftList(): SavedDraft[] {
  try { return JSON.parse(localStorage.getItem(DRAFT_LIST_KEY) || '[]') as SavedDraft[]; } catch { return []; }
}

function downloadJson(filename: string, data: unknown) {
  const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

function safeFileName(name: string) {
  return name.replace(/[\\/:*?"<>|\s]+/g, '_').replace(/^_+|_+$/g, '') || 'question';
}

export function QuestionEditorPage({ initialEditGroupId, isNew = false, onBack, onOpenPapers }: { initialEditGroupId?: string | null; isNew?: boolean; onBack?: () => void; onOpenPapers?: () => void }) {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const [state, setState] = useState<AppState>(() => {
    if (isNew) return emptyState;
    try {
      const saved = localStorage.getItem(STORAGE_KEY);
      return saved ? { ...defaultState, ...JSON.parse(saved) } : defaultState;
    } catch { return defaultState; }
  });
  const [drafts, setDrafts] = useState<SavedDraft[]>(() => loadDraftList());
  const [message, setMessage] = useState('');
  const [dbGroups, setDbGroups] = useState<any[]>([]);
  const [selectedDbGroup, setSelectedDbGroup] = useState<any>(null);
  const [editingGroupId, setEditingGroupId] = useState<string | null>(null);
  const repairQueue = useMemo(() => (searchParams.get('repairQueue') || '').split(',').map((item) => item.trim()).filter(Boolean), [searchParams]);
  const isRepairMode = repairQueue.length > 0;
  const repairQueueIndex = editingGroupId ? repairQueue.indexOf(editingGroupId) : -1;
  const repairQueueLabel = repairQueueIndex >= 0 ? `${repairQueueIndex + 1}/${repairQueue.length}` : `1/${repairQueue.length}`;
  const nextRepairId = useMemo(() => {
    if (!editingGroupId || !repairQueue.length) return '';
    const index = repairQueue.indexOf(editingGroupId);
    return index >= 0 ? repairQueue[index + 1] || '' : repairQueue.find((id) => id !== editingGroupId) || '';
  }, [editingGroupId, repairQueue]);

  const set = <K extends keyof AppState>(key: K, value: AppState[K]) => setState((prev) => ({ ...prev, [key]: value }));
  const draft = useMemo(() => buildDraft(state), [state]);

  const saveDraft = () => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
    const item: SavedDraft = { id: crypto.randomUUID(), name: state.title || '未命名题目', updatedAt: new Date().toLocaleString(), state };
    const next = [item, ...drafts].slice(0, 30);
    localStorage.setItem(DRAFT_LIST_KEY, JSON.stringify(next));
    setDrafts(next);
    setMessage('已保存到草稿列表');
  };
  const loadSavedDraft = (item: SavedDraft) => {
    setEditingGroupId(null);
    setState({ ...defaultState, ...item.state });
    localStorage.setItem(STORAGE_KEY, JSON.stringify(item.state));
    setMessage(`已加载：${item.name}`);
  };
  const deleteSavedDraft = (id: string) => {
    const next = drafts.filter((item) => item.id !== id);
    localStorage.setItem(DRAFT_LIST_KEY, JSON.stringify(next));
    setDrafts(next);
    setMessage('已删除草稿');
  };
  const newDraft = () => {
    setEditingGroupId(null);
    setSelectedDbGroup(null);
    setState(emptyState);
    localStorage.removeItem(STORAGE_KEY);
    setMessage('已新建空白题目，请选择题型后录入。');
  };
  const resetDraft = () => {
    setEditingGroupId(null);
    setSelectedDbGroup(null);
    setState(defaultState);
    localStorage.removeItem(STORAGE_KEY);
    setMessage('已恢复默认示例');
  };
  const copyJson = async () => { await navigator.clipboard.writeText(JSON.stringify(draft, null, 2)); setMessage('已复制 JSON'); };
  const exportJson = () => { downloadJson(`${safeFileName(state.title)}.json`, draft); setMessage('已导出 JSON 文件'); };
  const validateBeforeSave = () => {
    if (state.mode === 'composite' && !state.title.trim()) return '复合题建议填写标题，便于区分公共题干和小题';
    if (state.mode === 'calculation') {
      const lines = state.calcText.split('\n').map((line) => line.trim()).filter(Boolean);
      if (!lines.length) return '请先录入口算内容';
      if (lines.some((line) => !line.includes('='))) return '口算题每行都需要包含“=”和答案';
      if (lines.some((line) => !line.split('=').slice(1).join('=').trim())) return '口算题存在空答案';
    }
    if ((state.mode === 'fill_blank' || state.mode === 'compare') && !blankKeys(state.stem).length) return '题干里至少需要一个空位';
    if ((state.mode === 'fill_blank' || state.mode === 'compare') && blankKeys(state.stem).some((key) => !String(state.answers[key] ?? '').trim())) return '还有空位没有填写标准答案';
    if (state.mode === 'single_choice' || state.mode === 'multiple_choice') {
      const optionKeys = state.choiceOptionsText.split('\n').map((line, index) => (line.split(',')[0] || String.fromCharCode(65 + index)).trim()).filter(Boolean);
      const answerKeys = state.choiceAnswer.split(',').map((item) => item.trim()).filter(Boolean);
      if (!state.choiceStem.trim()) return '请填写选择题题干';
      if (optionKeys.length < 2) return '选择题至少需要 2 个选项';
      if (!answerKeys.length) return '请填写选择题答案';
      if (answerKeys.some((key) => !optionKeys.includes(key))) return '选择题答案必须匹配已有选项编号';
      if (state.mode === 'single_choice' && answerKeys.length !== 1) return '单选题只能有一个正确答案';
    }
    if (state.mode === 'ordering') {
      const itemKeys = state.orderingText.split('\n').map((line, index) => (line.split(',')[0] || String(index + 1)).trim()).filter(Boolean);
      const answerKeys = state.orderingAnswer.split(',').map((item) => item.trim()).filter(Boolean);
      if (itemKeys.length < 2) return '排序题至少需要 2 个待排序项目';
      if (answerKeys.length !== itemKeys.length) return '排序题答案数量必须和待排序项目数量一致';
      if (answerKeys.some((key) => !itemKeys.includes(key))) return '排序题答案必须使用待排序项目中的序号';
    }
    if (state.mode === 'matching') {
      const left = state.matchingLeft.split('\n').map((line) => line.trim()).filter(Boolean);
      const right = state.matchingRight.split('\n').map((line) => line.trim()).filter(Boolean);
      const pairs = state.matchingAnswer.split('\n').map((line) => line.trim()).filter(Boolean);
      if (!left.length || !right.length) return '连线题左右两侧都需要内容';
      if (!pairs.length) return '连线题需要填写答案连线';
      if (pairs.some((line) => !line.includes('=>'))) return '连线题答案格式应为：左侧=>右侧';
      for (const line of pairs) {
        const [l, r] = line.split('=>').map((item) => item.trim());
        if (!left.includes(l)) return `连线题答案左侧“${l}”不在左侧内容中`;
        if (!right.includes(r)) return `连线题答案右侧“${r}”不在右侧内容中`;
      }
    }
    if (state.mode === 'composite') {
      if (!state.materials.some((item) => item.text.trim() || item.title?.trim())) return '复合题至少需要一段通用材料';
      if (!state.children.length) return '复合题至少需要一个小题';
      for (const [index, child] of state.children.entries()) {
        const keys = blankKeys(child.stem);
        const answers = child.answers ?? { blank_1: child.answer };
        if (!child.stem.trim()) return `第 ${index + 1} 小题题干为空`;
        if (!keys.length) return `第 ${index + 1} 小题至少需要一个空位`;
        if (keys.some((key) => !String(answers[key] ?? '').trim())) return `第 ${index + 1} 小题还有空位没有标准答案`;
      }
    }
    return '';
  };
  const saveToApi = async (options?: { markRepaired?: boolean; goNextRepair?: boolean }) => {
    try {
      const validationError = validateBeforeSave();
      if (validationError) {
        setMessage(`保存前校验失败：${validationError}`);
        return;
      }
      const isEdit = Boolean(editingGroupId);
      const data = isEdit ? await updateQuestionGroup(editingGroupId!, draft) : await saveQuestionGroup(draft);
      setEditingGroupId(String(data.id));
      setSelectedDbGroup(data);
      let nextMessage = `${isEdit ? '已更新' : '已保存'}到后端，题组 ID：${data.id}`;
      if (options?.markRepaired) {
        await bulkRemoveQuestionGroupTags([String(data.id)], ['需修复']);
        nextMessage += '，已标记为修复完成';
      }
      await refreshDbGroups();
      if (options?.goNextRepair) {
        const queue = repairQueue.filter((id) => id !== String(data.id));
        const nextId = nextRepairId || queue[0] || '';
        if (nextId) {
          navigate(`/parent/questions/edit/${nextId}?repairQueue=${encodeURIComponent(queue.join(','))}`);
          return;
        }
        nextMessage += '，修复队列已处理完';
      }
      setMessage(nextMessage);
    } catch (error) {
      setMessage(`保存到后端失败：${error instanceof Error ? error.message : String(error)}`);
    }
  };
  const skipCurrentRepair = () => {
    if (!editingGroupId || !repairQueue.length) return;
    const queue = repairQueue.filter((id) => id !== editingGroupId);
    const nextId = nextRepairId || queue[0] || '';
    if (nextId) {
      navigate(`/parent/questions/edit/${nextId}?repairQueue=${encodeURIComponent(queue.join(','))}`);
      return;
    }
    navigate('/parent/questions/audit');
  };
  const previewValidation = useMemo(() => validateBeforeSave(), [state]);
  const refreshDbGroups = async () => {
    try {
      const data = await listQuestionGroups();
      setDbGroups(data);
      setMessage(`已读取数据库题组：${data.length} 条`);
    } catch (error) {
      setMessage(`读取数据库题组失败：${error instanceof Error ? error.message : String(error)}`);
    }
  };
  const loadDbGroupDetail = async (id: string) => {
    try {
      const data = await getQuestionGroup(id);
      setSelectedDbGroup(data);
      setMessage(`已加载数据库题组详情：${data.title}`);
      return data;
    } catch (error) {
      setMessage(`读取题组详情失败：${error instanceof Error ? error.message : String(error)}`);
      return null;
    }
  };
  const loadDbGroupForEdit = async (id: string) => {
    const data = await loadDbGroupDetail(id);
    if (!data) return;
    const nextState = dbGroupToAppState(data);
    setState(nextState);
    setEditingGroupId(String(data.id));
    localStorage.setItem(STORAGE_KEY, JSON.stringify(nextState));
    setMessage(`已载入编辑：${data.title}。再次点击“保存到后端”会更新原题组。`);
  };

  useEffect(() => {
    if (initialEditGroupId) {
      void loadDbGroupForEdit(initialEditGroupId);
      return;
    }
    if (isNew) {
      setEditingGroupId(null);
      setSelectedDbGroup(null);
      setState(emptyState);
      localStorage.removeItem(STORAGE_KEY);
      setMessage('');
    }
  }, [initialEditGroupId, isNew]);

  return <div className="question-editor-page animate-fadeIn">
    <header className="page-header" style={{ marginBottom: 'var(--space-5)' }}>
      <div className="page-header-left">
        <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-3)' }}>
          {onBack && <button className="btn btn-ghost btn-sm" onClick={onBack} aria-label="返回题库">←</button>}
          <h1 className="page-title">录题工作台</h1>
        </div>
        <p className="page-subtitle">表单录入 → 自动生成结构化题目 → 右侧实时预览学生端效果</p>
      </div>
    </header>
    <div className="editor-layout">
      <section className="editor-panel">
        {(editingGroupId || message) && <div className="editor-status">
          {editingGroupId && <span>{`\u7f16\u8f91\u4e2d\uff1a${state.title || '\u672a\u547d\u540d\u9898\u76ee'}\uff08ID ${editingGroupId}\uff09`}</span>}
          {message && <em>{message}</em>}
        </div>}
        {isRepairMode && <div className="editor-repair-banner">
          <div>
            <b>修复队列模式</b>
            <span>当前第 {repairQueueLabel} 道。保存后可以直接标记“需修复”为完成，并跳到下一道。</span>
          </div>
          <div className="editor-repair-actions">
            <button className="btn btn-outline btn-sm" onClick={() => navigate('/parent/questions/audit')}>返回审核中心</button>
            {nextRepairId && <button className="btn btn-secondary btn-sm" onClick={() => navigate(`/parent/questions/edit/${nextRepairId}?repairQueue=${encodeURIComponent(repairQueue.join(','))}`)}>跳到下一道</button>}
            {editingGroupId && <button className="btn btn-soft btn-sm" onClick={skipCurrentRepair}>暂不处理</button>}
          </div>
        </div>}
        

        <div className="card" style={{ marginBottom: 'var(--space-4)' }}>
          <h2 style={{ fontSize: 'var(--text-lg)', borderBottom: '1px solid var(--border-light)', paddingBottom: 'var(--space-2)', marginBottom: 'var(--space-3)', color: 'var(--text-primary)' }}>1. 题目基本信息</h2>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 2fr', gap: 'var(--space-3)', marginBottom: 'var(--space-3)' }}>
            <div>
              <label>题型选择</label>
              <select value={state.mode} onChange={(e) => set('mode', e.target.value as EditorMode)}>
                <option value="fill_blank">填空题</option>
                <option value="calculation">口算题组</option>
                <option value="compare">比较符号题</option>
                <option value="single_choice">单选题</option>
                <option value="multiple_choice">多选题</option>
                <option value="ordering">排序题</option>
                <option value="matching">连线题</option>
                <option value="composite">复合题/通用题干</option>
              </select>
            </div>
            <div>
              <label>{state.mode === 'composite' ? '复合题标题' : '题目名称（可选）'}</label>
              <input
                value={state.title}
                onChange={(e) => set('title', e.target.value)}
              />
            </div>
          </div>
          <div className="meta-grid">
            <label>年级<input value={state.gradeLevel} onChange={(e) => set('gradeLevel', e.target.value)} placeholder="例如：二年级" /></label>
            <label>难度<input type="number" min={1} max={5} value={state.difficulty} onChange={(e) => set('difficulty', Number(e.target.value))} /></label>
            <label>标签/知识点<input value={state.tagsText} onChange={(e) => set('tagsText', e.target.value)} placeholder="逗号分隔，例如：乘法,第二单元" /></label>
          </div>
        </div>

        <div className="card" style={{ marginBottom: 'var(--space-4)' }}>
          <h2 style={{ fontSize: 'var(--text-lg)', borderBottom: '1px solid var(--border-light)', paddingBottom: 'var(--space-2)', marginBottom: 'var(--space-3)', color: 'var(--text-primary)' }}>2. 题目内容编辑</h2>
          {state.mode === 'calculation' && <CalculationEditor value={state.calcText} columns={state.calcColumns} onColumnsChange={(value) => set('calcColumns', value)} onChange={(value) => set('calcText', value)} />}
          {(state.mode === 'fill_blank' || state.mode === 'compare') && <>
            <label>题干配置（使用“插入空”插入填空位置）</label>
            <textarea value={state.stem} onChange={(e) => set('stem', e.target.value)} placeholder="例：树上有 5 只小鸟，飞走了 {{blank:1}} 只，还剩 3 只。" />
            <button className="btn btn-outline btn-sm" style={{ alignSelf: 'flex-start', marginTop: 'var(--space-2)', marginBottom: 'var(--space-3)' }} onClick={() => set('stem', state.stem + '{{blank:' + (blankKeys(state.stem).length + 1) + '}}')}>插入空位</button>
            <AnswerSlotEditor stem={state.stem} slotType={state.mode === 'compare' ? 'compare_symbol' : 'number'} answers={state.answers} onChange={(answers) => set('answers', answers)} />
          </>}
          {(state.mode === 'single_choice' || state.mode === 'multiple_choice') && <ChoiceEditor state={state} set={set} multiple={state.mode === 'multiple_choice'} />}
          {state.mode === 'ordering' && <OrderingEditor state={state} set={set} />}
          {state.mode === 'matching' && <MatchingEditor state={state} set={set} />}
          {state.mode !== 'calculation' && state.mode !== 'composite' && (
            <div style={{ marginTop: 'var(--space-4)' }}>
              <label>解题解析（可选，孩子做错后查看）</label>
              <RichTextEditor value={state.explanationHtml} onChange={(value) => set('explanationHtml', value)} uploadImage={uploadImage} />
            </div>
          )}
          {state.mode === 'composite' && <CompositeEditor state={state} setState={setState} />}
        </div>
      </section>
      <section className="preview-panel">
        <h2 style={{ fontSize: 'var(--text-lg)', paddingBottom: 'var(--space-2)', marginBottom: 'var(--space-3)', color: 'var(--text-primary)' }}>实时效果预览</h2>
        <div className={previewValidation ? 'editor-check-card warning' : 'editor-check-card success'}>
          <b>{previewValidation ? '保存前还需要处理' : '当前题目可以保存'}</b>
          <span>{previewValidation || '题型、答案和结构校验通过。建议再看一眼右侧预览效果。'}</span>
        </div>
        <Preview draft={draft} explicitTitle={state.title.trim()} />
        <div className="editor-save-bar">
          <span>
            {editingGroupId ? `正在编辑 ID ${editingGroupId}` : '新题目保存后会进入题库'}
            {isRepairMode ? ` · 修复队列 ${repairQueueLabel}` : ''}
          </span>
          <button className="btn btn-primary" onClick={() => void saveToApi()} disabled={Boolean(previewValidation)}>{editingGroupId ? '更新到后端' : '保存到后端'}</button>
          {isRepairMode && editingGroupId && (
            <>
              <button className="btn btn-secondary" onClick={() => void saveToApi({ markRepaired: true })} disabled={Boolean(previewValidation)}>保存并标记修复完成</button>
              <button className="btn btn-warning" onClick={() => void saveToApi({ markRepaired: true, goNextRepair: true })} disabled={Boolean(previewValidation)}>
                {nextRepairId ? '保存并编辑下一道' : '保存并完成队列'}
              </button>
            </>
          )}
        </div>
      </section>
    </div>
  </div>;
}

function Preview({ draft, explicitTitle }: { draft: ReturnType<typeof buildDraft>; explicitTitle: string }) {
  const d = draft as any;
  if (d.type === 'calculation_group') {
    return <section className="preview-paper"><h2>{d.title}</h2><CalculationGroupPreview items={d.items} columns={d.columns} /></section>;
  }
  if (d.type === 'composite_group') {
    return <CompositePreview title={d.title} commonStem={d.commonStem} table={d.table} materials={d.materials} children={d.children} />;
  }
  return <section className="preview-paper">{explicitTitle && <h2>{d.title}</h2>}<QuestionPreview question={d.question} /></section>;
}

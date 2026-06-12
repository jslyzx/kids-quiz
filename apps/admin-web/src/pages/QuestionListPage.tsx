import { useEffect, useMemo, useState } from 'react';
import { bulkAddQuestionGroupTags, bulkUpdateQuestionGroupStatus, exportQuestionBank, getQuestionGroup, listQuestionGroups, updateQuestionGroupStatus } from '../api/questionGroups';
import { QuestionGroupPreviewModal } from '../components/QuestionGroupPreviewModal';

type Props = {
  onCreate: () => void;
  onEdit: (id: string) => void;
  onOpenPapers: () => void;
  onOpenWrongBook: () => void;
  onOpenKidHome: () => void;
  onOpenTaskSettings: () => void;
  onBatchFillBlank: () => void;
  onImportJson: () => void;
  onOpenImportBatches: () => void;
};

const typeLabel: Record<string, string> = {
  PRACTICE_SET: '单题/练习题',
  MENTAL_MATH: '口算题组',
  COMPOSITE: '复合题',
  FILL_BLANK_GROUP: '填空题组',
  MATCHING_GROUP: '连线题组',
  WORKSHEET_SECTION: '试卷分区',
};

function stemPreview(group: any) {
  const firstStem = group.questions?.[0]?.stem || group.commonStem || '';
  const text = String(firstStem)
    .replace(/\{\{blank(?::[^}]+)?\}\}/g, '____')
    .replace(/\{_[0-9]+\}/g, '____')
    .replace(/\{\{math:(.+?)\}\}/g, '$1')
    .replace(/\\\((.+?)\\\)/g, '$1')
    .replace(/\\\[(.+?)\\\]/g, '$1')
    .replace(/\s+/g, ' ')
    .trim();
  return text.length > 70 ? text.slice(0, 70) + '…' : text;
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

export function QuestionListPage({ onCreate, onEdit, onOpenPapers, onOpenWrongBook, onOpenKidHome, onOpenTaskSettings, onBatchFillBlank, onImportJson, onOpenImportBatches }: Props) {
  const [groups, setGroups] = useState<any[]>([]);
  const [keyword, setKeyword] = useState('');
  const [type, setType] = useState('ALL');
  const [grade, setGrade] = useState('');
  const [tag, setTag] = useState('');
  const [statusFilter, setStatusFilter] = useState('ALL');
  const [explanationFilter, setExplanationFilter] = useState('ALL');
  const [message, setMessage] = useState('');
  const [loading, setLoading] = useState(false);
  const [previewGroup, setPreviewGroup] = useState<any>(null);
  const [selectedIds, setSelectedIds] = useState<Record<string, boolean>>({});
  const [bulkTagsText, setBulkTagsText] = useState('');
  const [detailMeta, setDetailMeta] = useState<Record<string, { hasExplanation: boolean }>>({});

  const refresh = async () => {
    try {
      setLoading(true);
      const [data, bank] = await Promise.all([listQuestionGroups({ includeDisabled: true }), exportQuestionBank().catch(() => null)]);
      setGroups(data);
      if (bank?.groups) {
        setDetailMeta(Object.fromEntries(bank.groups.map((group: any) => [
          String(group.id),
          { hasExplanation: (group.questions ?? []).some((question: any) => Boolean(question.explanation || question.content?.explanationHtml)) },
        ])));
      }
      setMessage(`已加载 ${data.length} 个题组`);
    } catch (error) {
      setMessage(`加载失败：${error instanceof Error ? error.message : String(error)}`);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { void refresh(); }, []);

  const selectedIdList = useMemo(() => Object.entries(selectedIds).filter(([, selected]) => selected).map(([id]) => id), [selectedIds]);
  const filtered = useMemo(() => groups.filter((group) => {
    const keywordValue = keyword.trim();
    const tags: string[] = Array.isArray(group.tags) ? group.tags.map((item: unknown) => String(item)) : [];
    const matchKeyword = !keywordValue || String(group.title ?? '').includes(keywordValue) || String(group.id).includes(keywordValue) || stemPreview(group).includes(keywordValue) || tags.some((item) => item.includes(keywordValue));
    const matchType = type === 'ALL' || group.groupType === type;
    const matchGrade = !grade.trim() || String(group.gradeLevel ?? '').includes(grade.trim());
    const matchTag = !tag.trim() || tags.some((item) => item.includes(tag.trim()));
    const matchStatus = statusFilter === 'ALL' || group.status === statusFilter;
    const hasExplanation = Boolean(detailMeta[String(group.id)]?.hasExplanation);
    const matchExplanation = explanationFilter === 'ALL' || (explanationFilter === 'YES' ? hasExplanation : !hasExplanation);
    return matchKeyword && matchType && matchGrade && matchTag && matchStatus && matchExplanation;
  }), [groups, keyword, type, grade, tag, statusFilter, explanationFilter, detailMeta]);

  const preview = async (id: string) => {
    try {
      const data = await getQuestionGroup(id);
      setPreviewGroup(data);
    } catch (error) {
      setMessage(`读取详情失败：${error instanceof Error ? error.message : String(error)}`);
    }
  };

  const toggleSelected = (id: string, checked: boolean) => setSelectedIds((prev) => ({ ...prev, [id]: checked }));
  const toggleAllFiltered = (checked: boolean) => setSelectedIds((prev) => {
    const next = { ...prev };
    filtered.forEach((group) => { next[String(group.id)] = checked; });
    return next;
  });
  const clearSelection = () => setSelectedIds({});
  const bulkUpdateStatus = async (status: 'ENABLED' | 'DISABLED') => {
    if (!selectedIdList.length) { setMessage('请先选择题组'); return; }
    try {
      const result = await bulkUpdateQuestionGroupStatus(selectedIdList, status);
      setGroups((prev) => prev.map((group) => selectedIdList.includes(String(group.id)) ? { ...group, status } : group));
      clearSelection();
      setMessage('已批量' + (status === 'ENABLED' ? '启用' : '停用') + ' ' + result.count + ' 个题组');
    } catch (error) {
      setMessage('批量操作失败：' + (error instanceof Error ? error.message : String(error)));
    }
  };
  const bulkAddTags = async () => {
    const tags = bulkTagsText.split(/[,，\n]/).map((item) => item.trim()).filter(Boolean);
    if (!selectedIdList.length) { setMessage('请先选择题组'); return; }
    if (!tags.length) { setMessage('请输入要追加的标签'); return; }
    try {
      const result = await bulkAddQuestionGroupTags(selectedIdList, tags);
      setGroups((prev) => prev.map((group) => {
        if (!selectedIdList.includes(String(group.id))) return group;
        const merged = Array.from(new Set([...(Array.isArray(group.tags) ? group.tags.map(String) : []), ...tags]));
        return { ...group, tags: merged };
      }));
      setBulkTagsText('');
      clearSelection();
      setMessage('已为 ' + result.count + ' 个题组追加标签：' + tags.join('、'));
    } catch (error) {
      setMessage('追加标签失败：' + (error instanceof Error ? error.message : String(error)));
    }
  };

  const toggleStatus = async (group: any) => {
    const disabled = group.status === 'DISABLED';
    const nextStatus = disabled ? 'ENABLED' : 'DISABLED';
    const action = disabled ? '启用' : '停用';
    try {
      const updated = await updateQuestionGroupStatus(String(group.id), nextStatus);
      setGroups((prev) => prev.map((item) => String(item.id) === String(group.id) ? { ...item, ...updated } : item));
      setMessage('已' + action + '题组 ID：' + group.id);
    } catch (error) {
      setMessage(action + '失败：' + (error instanceof Error ? error.message : String(error)));
    }
  };
  const exportAll = async () => {
    try {
      const data = await exportQuestionBank();
      const date = new Date().toISOString().slice(0, 10);
      downloadJson(`kids-quiz-question-bank-${date}.json`, data);
      setMessage(`已导出题库：${data.count ?? groups.length} 个题组`);
    } catch (error) {
      setMessage(`导出失败：${error instanceof Error ? error.message : String(error)}`);
    }
  };

  const gridTemplate = '44px 64px 1.2fr 3.6fr 1.6fr 170px';

  return (
    <div className="question-list-page animate-fadeIn">
      {/* 头部区域 */}
      <header className="page-header" style={{ marginBottom: 'var(--space-5)' }}>
        <div className="page-header-left">
          <h1 className="page-title">题库管理</h1>
          <p className="page-subtitle">管理所有练习和题组，为组装试卷提供强大的资源库。</p>
        </div>
        <div className="page-actions">
          <button className="btn btn-secondary btn-sm" onClick={exportAll} disabled={!groups.length}>
            导出整个题库
          </button>
          <button className="btn btn-outline btn-sm" onClick={onBatchFillBlank}>
            批量录入填空题
          </button>
          <button className="btn btn-outline btn-sm" onClick={onImportJson}>
            导入题目 JSON
          </button>
          <button className="btn btn-outline btn-sm" onClick={onOpenImportBatches}>
            最近导入批次
          </button>
          <button className="btn btn-primary btn-sm" onClick={onCreate}>
            新建题目
          </button>
        </div>
      </header>

      {/* 消息提示 */}
      {message && <div className="message-banner success" style={{ marginBottom: 'var(--space-4)' }}>{message}</div>}

      {/* 过滤筛选栏 */}
      <div className="filter-bar" style={{ display: 'grid', gridTemplateColumns: 'repeat(6, minmax(120px, 1fr))', gap: 'var(--space-3)', marginBottom: 'var(--space-5)' }}>
        <input placeholder="按标题或 ID 搜索..." value={keyword} onChange={(e) => setKeyword(e.target.value)} />
        <input placeholder="年级筛选（如：二年级）" value={grade} onChange={(e) => setGrade(e.target.value)} />
        <input placeholder="标签/知识点筛选..." value={tag} onChange={(e) => setTag(e.target.value)} />
        <select value={type} onChange={(e) => setType(e.target.value)}>
          <option value="ALL">全部题型</option>
          <option value="PRACTICE_SET">单题/练习题</option>
          <option value="MENTAL_MATH">口算题组</option>
          <option value="COMPOSITE">复合题</option>
          <option value="FILL_BLANK_GROUP">填空题组</option>
          <option value="MATCHING_GROUP">连线题组</option>
          <option value="WORKSHEET_SECTION">试卷分区</option>
        </select>
        <select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)}>
          <option value="ALL">全部状态</option>
          <option value="ENABLED">启用</option>
          <option value="DISABLED">停用</option>
        </select>
        <select value={explanationFilter} onChange={(e) => setExplanationFilter(e.target.value)}>
          <option value="ALL">全部解析</option>
          <option value="YES">有解析</option>
          <option value="NO">无解析</option>
        </select>
      </div>

      {selectedIdList.length > 0 && (
        <div className="bulk-actions-card" style={{ marginBottom: 'var(--space-4)' }}>
          <b>已选择 {selectedIdList.length} 个题组</b>
          <button className="btn btn-primary btn-sm" onClick={() => void bulkUpdateStatus('ENABLED')}>批量启用</button>
          <button className="btn btn-warning btn-sm" onClick={() => void bulkUpdateStatus('DISABLED')}>批量停用</button>
          <input
            placeholder="追加标签，多个用逗号或换行分隔"
            value={bulkTagsText}
            onChange={(e) => setBulkTagsText(e.target.value)}
          />
          <button className="btn btn-outline btn-sm" onClick={() => void bulkAddTags()}>追加标签</button>
          <button className="btn btn-soft btn-sm" onClick={clearSelection}>取消选择</button>
        </div>
      )}

      {/* 题目表格 */}
      <div className="data-table">
        <div className="table-row table-head" style={{ gridTemplateColumns: gridTemplate }}>
          <span><input type="checkbox" checked={filtered.length > 0 && filtered.every((group) => selectedIds[String(group.id)])} onChange={(e) => toggleAllFiltered(e.target.checked)} aria-label="全选当前筛选结果" /></span>
          <span>ID</span>
          <span>标题</span>
          <span>题干内容</span>
          <span>元数据</span>
          <span style={{ textAlign: 'right', paddingRight: 'var(--space-4)' }}>操作</span>
        </div>
        
        {filtered.map((group) => (
          <div className="table-row" style={{ gridTemplateColumns: gridTemplate, opacity: group.status === 'DISABLED' ? 0.68 : 1 }} key={group.id}>
            <span><input type="checkbox" checked={Boolean(selectedIds[String(group.id)])} onChange={(e) => toggleSelected(String(group.id), e.target.checked)} aria-label={`选择题组 ${group.id}`} /></span>
            <span style={{ fontFamily: 'var(--font-mono)', fontSize: 'var(--text-sm)', color: 'var(--text-muted)' }}>{group.id}</span>
            <b style={{ color: 'var(--text-primary)', fontSize: 'var(--text-base)' }}>{group.title || '未命名'}</b>
            <span title={stemPreview(group)} style={{ color: 'var(--text-secondary)', fontSize: 'var(--text-sm)', lineHeight: 1.55, overflow: 'hidden', display: '-webkit-box', WebkitLineClamp: 3, WebkitBoxOrient: 'vertical' as any }}>
              {stemPreview(group) || '-'}
            </span>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '2px', fontSize: 'var(--text-xs)', color: 'var(--text-secondary)' }}>
              <span>{group.gradeLevel || '未设年级'} / 难度 {group.difficulty ?? '-'}</span>
              <div style={{ display: 'flex', gap: '4px', flexWrap: 'wrap', marginTop: '4px' }}>
                <span className={group.status === 'DISABLED' ? 'badge badge-warning' : 'badge badge-success'}>{group.status === 'DISABLED' ? '已停用' : '已启用'}</span>
                <span className={detailMeta[String(group.id)]?.hasExplanation ? 'badge badge-success' : 'badge badge-muted'}>{detailMeta[String(group.id)]?.hasExplanation ? '有解析' : '无解析'}</span>
                {Array.isArray(group.tags) && group.tags.includes('待验收') && <span className="badge badge-muted">待验收</span>}
                {Array.isArray(group.tags) && group.tags.includes('需修复') && <span className="badge badge-warning">需修复</span>}
              </div>
              {Array.isArray(group.tags) && group.tags.length > 0 && (
                <div style={{ display: 'flex', gap: '4px', flexWrap: 'wrap', marginTop: '4px' }}>
                  {group.tags.map((t: string) => <span key={t} className="badge badge-muted" style={{ padding: '2px 6px' }}>{t}</span>)}
                </div>
              )}
            </div>
            <div className="table-actions" style={{ justifyContent: 'flex-end' }}>
              <button className="btn btn-soft btn-sm" style={{ padding: '4px 10px' }} onClick={() => preview(String(group.id))}>查看</button>
              <button className="btn btn-outline btn-sm" style={{ padding: '4px 10px' }} onClick={() => onEdit(String(group.id))}>编辑</button>
              <button className={group.status === 'DISABLED' ? 'btn btn-primary btn-sm' : 'btn btn-warning btn-sm'} style={{ padding: '4px 10px' }} onClick={() => toggleStatus(group)}>{group.status === 'DISABLED' ? '启用' : '停用'}</button>
            </div>
          </div>
        ))}
        
        {!filtered.length && (
          <div className="empty-state">
            <span className="empty-state-icon">🔍</span>
            <p className="empty-state-title">未找到匹配的题目</p>
            <p className="empty-state-desc">你可以尝试更换搜索条件，或者点击上方“新建题目”开始录入。</p>
          </div>
        )}
      </div>

      {previewGroup && (
        <QuestionGroupPreviewModal 
          group={previewGroup} 
          onClose={() => setPreviewGroup(null)} 
          onEdit={(id) => { setPreviewGroup(null); onEdit(id); }} 
        />
      )}
    </div>
  );
}

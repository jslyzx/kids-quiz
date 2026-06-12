import { useEffect, useMemo, useState } from 'react';
import { getImportBatch, type ImportBatchDetail, type ImportBatchGroup, type ImportBatchKnowledgePoint } from '../api/importBatches';

type Props = {
  batchId: string;
  onBack: () => void;
  onOpenAudit: () => void;
  onOpenPaper: (paperId: string) => void;
  onStartPaper: (paperId: string) => void;
  onEditQuestion: (groupId: string) => void;
};

type BatchStats = {
  total?: number;
  saved?: number;
  failed?: number;
  invalid?: number;
  duplicateSkipped?: number;
  reviewPaperId?: string;
  groupIds?: string[];
};

function toStats(value: unknown): BatchStats {
  return value && typeof value === 'object' ? value as BatchStats : {};
}

function toNumber(value: unknown) {
  const num = Number(value);
  return Number.isFinite(num) ? num : 0;
}

function formatDate(value?: string | null) {
  if (!value) return '-';
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? value : date.toLocaleString();
}

function statusText(status: ImportBatchDetail['status']) {
  if (status === 'COMPLETED') return '已完成';
  if (status === 'FAILED') return '有失败';
  if (status === 'IMPORTING') return '导入中';
  return '草稿';
}

function statusBadgeClass(status: ImportBatchDetail['status']) {
  if (status === 'COMPLETED') return 'badge badge-success';
  if (status === 'FAILED') return 'badge badge-warning';
  if (status === 'IMPORTING') return 'badge badge-primary';
  return 'badge badge-muted';
}

function compactText(value: unknown, max = 90) {
  const text = String(value ?? '').replace(/\s+/g, ' ').trim();
  return text.length > max ? `${text.slice(0, max)}...` : text;
}

function tagList(value: unknown) {
  if (Array.isArray(value)) return value.map(String).filter(Boolean);
  if (typeof value === 'string') return value.split(/[|,，;；、]/).map((item) => item.trim()).filter(Boolean);
  return [];
}

function addCount(map: Map<string, number>, key: string) {
  map.set(key, (map.get(key) ?? 0) + 1);
}

function sortedCounts(map: Map<string, number>) {
  return Array.from(map.entries()).sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]));
}

function knowledgePointLabel(point: ImportBatchKnowledgePoint) {
  return point.path || point.name || `知识点 ${point.id}`;
}

function addKnowledgePoint(points: Map<string, ImportBatchKnowledgePoint>, point?: ImportBatchKnowledgePoint | null) {
  if (!point?.id) return;
  points.set(String(point.id), point);
}

function groupKnowledgePoints(group: ImportBatchGroup) {
  const points = new Map<string, ImportBatchKnowledgePoint>();
  addKnowledgePoint(points, group.knowledgePoint);
  for (const link of group.knowledgePointLinks ?? []) addKnowledgePoint(points, link.knowledgePoint);
  for (const question of group.questions) {
    addKnowledgePoint(points, question.knowledgePoint);
    for (const link of question.knowledgePointLinks ?? []) addKnowledgePoint(points, link.knowledgePoint);
  }
  return Array.from(points.values()).sort((a, b) => knowledgePointLabel(a).localeCompare(knowledgePointLabel(b)));
}

function statCards(stats: BatchStats, batch: ImportBatchDetail) {
  return [
    ['本次处理', toNumber(stats.total) || batch.groupCount],
    ['成功导入', toNumber(stats.saved) || batch.groupCount],
    ['保存失败', toNumber(stats.failed)],
    ['校验跳过', toNumber(stats.invalid)],
    ['重复跳过', toNumber(stats.duplicateSkipped)],
  ];
}

function groupQuestionTypes(group: ImportBatchGroup) {
  return group.questions.map((question) => question.questionType).filter(Boolean);
}

function CountPills({ title, items }: { title: string; items: [string, number][] }) {
  return (
    <div className="card" style={{ display: 'grid', gap: 'var(--space-2)' }}>
      <b>{title}</b>
      {items.length ? (
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 'var(--space-2)' }}>
          {items.map(([label, count]) => <span key={label} className="badge badge-muted">{label} · {count}</span>)}
        </div>
      ) : <span className="tip">暂无数据</span>}
    </div>
  );
}

export function ImportBatchDetailPage({ batchId, onBack, onOpenAudit, onOpenPaper, onStartPaper, onEditQuestion }: Props) {
  const [batch, setBatch] = useState<ImportBatchDetail | null>(null);
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState('');

  const refresh = async () => {
    try {
      setLoading(true);
      const row = await getImportBatch(batchId);
      setBatch(row);
      setMessage(`已加载导入批次 ${row.id}`);
    } catch (error) {
      setMessage(`加载导入批次失败：${error instanceof Error ? error.message : String(error)}`);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { void refresh(); }, [batchId]);

  const stats = toStats(batch?.stats);
  const reviewPaperId = stats.reviewPaperId ? String(stats.reviewPaperId) : '';
  const failureLines = String(batch?.notes ?? '').split(/\r?\n/).map((line) => line.trim()).filter(Boolean);
  const hasReviewPaper = Boolean(reviewPaperId);
  const needsPaper = toNumber(stats.saved) > 0 && !hasReviewPaper;

  const computed = useMemo(() => {
    const byType = new Map<string, number>();
    const byGrade = new Map<string, number>();
    const byDifficulty = new Map<string, number>();
    const byTag = new Map<string, number>();
    const byKnowledgePoint = new Map<string, number>();
    for (const group of batch?.questionGroups ?? []) {
      for (const type of groupQuestionTypes(group)) addCount(byType, type);
      addCount(byGrade, group.gradeLevel || '未标年级');
      addCount(byDifficulty, `难度 ${group.difficulty ?? '-'}`);
      for (const tag of tagList(group.tags)) addCount(byTag, tag);
      for (const point of groupKnowledgePoints(group)) addCount(byKnowledgePoint, knowledgePointLabel(point));
    }
    return {
      byType: sortedCounts(byType),
      byGrade: sortedCounts(byGrade),
      byDifficulty: sortedCounts(byDifficulty),
      byTag: sortedCounts(byTag).slice(0, 20),
      byKnowledgePoint: sortedCounts(byKnowledgePoint).slice(0, 20),
    };
  }, [batch]);

  return (
    <div className="question-list-page animate-fadeIn">
      <header className="page-header" style={{ marginBottom: 'var(--space-5)' }}>
        <div className="page-header-left">
          <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-3)' }}>
            <button className="btn btn-ghost btn-sm" onClick={onBack} aria-label="返回批次列表">←</button>
            <h1 className="page-title">导入批次详情</h1>
            {batch && <span className={statusBadgeClass(batch.status)}>{statusText(batch.status)}</span>}
          </div>
          <p className="page-subtitle">
            {batch ? `${batch.title} · 来源 ${batch.sourceType || 'json'}${batch.sourceName ? ` / ${batch.sourceName}` : ''}` : '查看本批导题、失败备注和验收状态。'}
          </p>
        </div>
        <div className="page-actions">
          <button className="btn btn-outline btn-sm" onClick={() => void refresh()} disabled={loading}>{loading ? '刷新中...' : '刷新'}</button>
          <button className="btn btn-outline btn-sm" onClick={onOpenAudit}>去体检中心</button>
          {reviewPaperId && <button className="btn btn-soft btn-sm" onClick={() => onOpenPaper(reviewPaperId)}>查看验收卷</button>}
          {reviewPaperId && <button className="btn btn-primary btn-sm" onClick={() => onStartPaper(reviewPaperId)}>孩子端验收</button>}
        </div>
      </header>

      {message && <div className="message-banner info" style={{ marginBottom: 'var(--space-4)' }}>{message}</div>}

      {batch && <>
        <section style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', gap: 'var(--space-3)', marginBottom: 'var(--space-5)' }}>
          {statCards(stats, batch).map(([label, value]) => (
            <div key={label} className="card">
              <b style={{ display: 'block', fontSize: 'var(--text-xl)' }}>{value}</b>
              <span>{label}</span>
            </div>
          ))}
          <div className={hasReviewPaper ? 'editor-check-card success' : needsPaper ? 'editor-check-card warning' : 'editor-check-card info'}>
            <b>{hasReviewPaper ? reviewPaperId : needsPaper ? '待生成' : '-'}</b>
            <span>验收试卷</span>
          </div>
        </section>

        <section style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: 'var(--space-3)', marginBottom: 'var(--space-5)' }}>
          <CountPills title="题型统计" items={computed.byType} />
          <CountPills title="年级统计" items={computed.byGrade} />
          <CountPills title="难度统计" items={computed.byDifficulty} />
          <CountPills title="标签 Top 20" items={computed.byTag} />
          <CountPills title="知识点 Top 20" items={computed.byKnowledgePoint} />
        </section>

        <section className="card" style={{ marginBottom: 'var(--space-5)', display: 'grid', gap: 'var(--space-2)' }}>
          <b>批次信息</b>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: 'var(--space-3)', color: 'var(--text-secondary)' }}>
            <span>批次 ID：{batch.id}</span>
            <span>创建时间：{formatDate(batch.createdAt)}</span>
            <span>完成时间：{formatDate(batch.completedAt)}</span>
            <span>题组数量：{batch.groupCount}</span>
          </div>
          {failureLines.length > 0 && (
            <div className="message-banner warning" style={{ alignItems: 'flex-start' }}>
              <b>失败备注</b>
              <span style={{ whiteSpace: 'pre-wrap' }}>{failureLines.join('\n')}</span>
            </div>
          )}
          {needsPaper && <div className="message-banner warning">这批题已经导入，但还没有关联验收试卷。</div>}
        </section>

        <section style={{ display: 'grid', gap: 'var(--space-3)' }}>
          {batch.questionGroups.map((group, index) => {
            const types = groupQuestionTypes(group);
            const tags = tagList(group.tags);
            const knowledgePoints = groupKnowledgePoints(group);
            return (
              <article key={group.id} className="card" style={{ display: 'grid', gap: 'var(--space-3)' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', gap: 'var(--space-3)', flexWrap: 'wrap' }}>
                  <div style={{ display: 'grid', gap: '6px' }}>
                    <b>{index + 1}. {group.title}</b>
                    <span style={{ color: 'var(--text-secondary)' }}>
                      题组 ID {group.id} · {group.groupType} · {group.gradeLevel || '未标年级'} · 难度 {group.difficulty ?? '-'} · {types.join(' / ') || '未识别题型'}
                    </span>
                  </div>
                  <div style={{ display: 'flex', gap: 'var(--space-2)', flexWrap: 'wrap' }}>
                    <button className="btn btn-outline btn-sm" onClick={() => onEditQuestion(group.id)}>编辑题组</button>
                  </div>
                </div>

                {tags.length > 0 && <div style={{ display: 'flex', gap: 'var(--space-2)', flexWrap: 'wrap' }}>{tags.map((tag) => <span key={tag} className="badge badge-muted">{tag}</span>)}</div>}
                {knowledgePoints.length > 0 && (
                  <div style={{ display: 'flex', gap: 'var(--space-2)', flexWrap: 'wrap' }}>
                    {knowledgePoints.map((point) => <span key={point.id} className="badge badge-primary">{knowledgePointLabel(point)}</span>)}
                  </div>
                )}

                <div style={{ display: 'grid', gap: 'var(--space-2)' }}>
                  {group.questions.map((question) => (
                    <div key={question.id} className="editor-check-card info">
                      <b>{question.questionType} · 题目 {question.id}</b>
                      <span>{compactText(question.stem)}</span>
                      {question.explanation && <span style={{ color: 'var(--text-secondary)' }}>解析：{compactText(question.explanation, 120)}</span>}
                    </div>
                  ))}
                </div>
              </article>
            );
          })}

          {!batch.questionGroups.length && <div className="empty-state"><b>这个批次还没有落库题组</b><p>如果是失败批次，可以查看上方失败备注。</p></div>}
        </section>
      </>}
    </div>
  );
}

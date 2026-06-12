import { useEffect, useMemo, useState } from 'react';
import { listImportBatches, type ImportBatchSummary } from '../api/importBatches';

type Props = {
  onBack: () => void;
  onImportJson: () => void;
  onOpenAudit: () => void;
  onOpenPaper: (paperId: string) => void;
  onStartPaper: (paperId: string) => void;
  onOpenBatch: (batchId: string) => void;
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

function statusText(status: ImportBatchSummary['status']) {
  if (status === 'COMPLETED') return '已完成';
  if (status === 'FAILED') return '有失败';
  if (status === 'IMPORTING') return '导入中';
  return '草稿';
}

function statusBadgeClass(status: ImportBatchSummary['status']) {
  if (status === 'COMPLETED') return 'badge badge-success';
  if (status === 'FAILED') return 'badge badge-warning';
  if (status === 'IMPORTING') return 'badge badge-primary';
  return 'badge badge-muted';
}

function needsAttention(batch: ImportBatchSummary, stats: BatchStats) {
  const reviewPaperId = stats.reviewPaperId ? String(stats.reviewPaperId) : '';
  const saved = toNumber(stats.saved);
  const failed = toNumber(stats.failed);
  const invalid = toNumber(stats.invalid);
  return failed > 0 || invalid > 0 || (saved > 0 && !reviewPaperId);
}

export function ImportBatchListPage({ onBack, onImportJson, onOpenAudit, onOpenPaper, onStartPaper, onOpenBatch }: Props) {
  const [batches, setBatches] = useState<ImportBatchSummary[]>([]);
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState('');
  const [keyword, setKeyword] = useState('');
  const [statusFilter, setStatusFilter] = useState<'ALL' | ImportBatchSummary['status']>('ALL');
  const [paperFilter, setPaperFilter] = useState<'ALL' | 'WITH_PAPER' | 'WITHOUT_PAPER'>('ALL');
  const [attentionFilter, setAttentionFilter] = useState<'ALL' | 'NEEDS_ATTENTION' | 'CLEAN'>('ALL');

  const refresh = async () => {
    try {
      setLoading(true);
      const rows = await listImportBatches();
      setBatches(rows);
      setMessage(`已加载 ${rows.length} 个最近导入批次。`);
    } catch (error) {
      setMessage(`加载导入批次失败：${error instanceof Error ? error.message : String(error)}`);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void refresh();
  }, []);

  const summary = useMemo(() => {
    const totals = { all: batches.length, completed: 0, failed: 0, importing: 0, groups: 0 };
    for (const batch of batches) {
      totals.groups += toNumber(batch.groupCount);
      if (batch.status === 'COMPLETED') totals.completed += 1;
      else if (batch.status === 'FAILED') totals.failed += 1;
      else if (batch.status === 'IMPORTING') totals.importing += 1;
    }
    return totals;
  }, [batches]);

  const filtered = useMemo(() => batches.filter((batch) => {
    const stats = toStats(batch.stats);
    const reviewPaperId = stats.reviewPaperId ? String(stats.reviewPaperId) : '';
    const haystack = [
      String(batch.id),
      batch.title,
      batch.sourceType,
      batch.sourceName,
      batch.notes,
    ].filter(Boolean).join(' ').toLowerCase();
    const query = keyword.trim().toLowerCase();
    const matchKeyword = !query || haystack.includes(query);
    const matchStatus = statusFilter === 'ALL' || batch.status === statusFilter;
    const matchPaper = paperFilter === 'ALL'
      || (paperFilter === 'WITH_PAPER' ? Boolean(reviewPaperId) : !reviewPaperId);
    const batchNeedsAttention = needsAttention(batch, stats);
    const matchAttention = attentionFilter === 'ALL'
      || (attentionFilter === 'NEEDS_ATTENTION' ? batchNeedsAttention : !batchNeedsAttention);
    return matchKeyword && matchStatus && matchPaper && matchAttention;
  }), [attentionFilter, batches, keyword, paperFilter, statusFilter]);

  const filteredSummary = useMemo(() => {
    return filtered.reduce((acc, batch) => {
      const stats = toStats(batch.stats);
      const reviewPaperId = stats.reviewPaperId ? String(stats.reviewPaperId) : '';
      const failed = toNumber(stats.failed);
      const invalid = toNumber(stats.invalid);
      const saved = toNumber(stats.saved);
      if (failed > 0 || invalid > 0) acc.failed += 1;
      if (saved > 0 && !reviewPaperId) acc.pendingPaper += 1;
      if (reviewPaperId) acc.withPaper += 1;
      return acc;
    }, { failed: 0, pendingPaper: 0, withPaper: 0 });
  }, [filtered]);

  return (
    <div className="question-list-page animate-fadeIn">
      <header className="page-header" style={{ marginBottom: 'var(--space-5)' }}>
        <div className="page-header-left">
          <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-3)' }}>
            <button className="btn btn-ghost btn-sm" onClick={onBack} aria-label="返回题库">←</button>
            <h1 className="page-title">导入批次</h1>
          </div>
          <p className="page-subtitle">回看最近导题结果，优先处理失败项、缺验收卷的批次，以及仍需人工复核的导入。</p>
        </div>
        <div className="page-actions">
          <button className="btn btn-outline btn-sm" onClick={() => void refresh()} disabled={loading}>{loading ? '刷新中...' : '刷新'}</button>
          <button className="btn btn-outline btn-sm" onClick={onOpenAudit}>去体检中心</button>
          <button className="btn btn-primary btn-sm" onClick={onImportJson}>继续导题</button>
        </div>
      </header>

      {message && <div className="message-banner info" style={{ marginBottom: 'var(--space-4)' }}>{message}</div>}

      <section style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: 'var(--space-3)', marginBottom: 'var(--space-5)' }}>
        <div className="card">
          <b style={{ display: 'block', fontSize: 'var(--text-xl)' }}>{summary.all}</b>
          <span>最近批次</span>
        </div>
        <div className="card">
          <b style={{ display: 'block', fontSize: 'var(--text-xl)' }}>{summary.completed}</b>
          <span>已完成</span>
        </div>
        <div className="card">
          <b style={{ display: 'block', fontSize: 'var(--text-xl)' }}>{summary.failed}</b>
          <span>有失败</span>
        </div>
        <div className="card">
          <b style={{ display: 'block', fontSize: 'var(--text-xl)' }}>{summary.groups}</b>
          <span>累计导入题组</span>
        </div>
      </section>

      <section className="card" style={{ marginBottom: 'var(--space-5)' }}>
        <div className="filter-bar" style={{ display: 'grid', gridTemplateColumns: '1.4fr 180px 180px 220px', gap: 'var(--space-3)', marginBottom: 'var(--space-3)' }}>
          <input value={keyword} onChange={(event) => setKeyword(event.target.value)} placeholder="按批次标题、来源、ID 搜索..." />
          <select value={statusFilter} onChange={(event) => setStatusFilter(event.target.value as any)}>
            <option value="ALL">全部状态</option>
            <option value="COMPLETED">已完成</option>
            <option value="FAILED">有失败</option>
            <option value="IMPORTING">导入中</option>
            <option value="DRAFT">草稿</option>
          </select>
          <select value={paperFilter} onChange={(event) => setPaperFilter(event.target.value as any)}>
            <option value="ALL">全部验收卷</option>
            <option value="WITH_PAPER">已有验收卷</option>
            <option value="WITHOUT_PAPER">未生成验收卷</option>
          </select>
          <select value={attentionFilter} onChange={(event) => setAttentionFilter(event.target.value as any)}>
            <option value="ALL">全部批次</option>
            <option value="NEEDS_ATTENTION">只看需处理</option>
            <option value="CLEAN">只看已收口</option>
          </select>
        </div>

        <div style={{ display: 'flex', gap: 'var(--space-2)', flexWrap: 'wrap', alignItems: 'center' }}>
          <button className="btn btn-outline btn-sm" onClick={() => { setStatusFilter('FAILED'); setAttentionFilter('NEEDS_ATTENTION'); }}>只看失败批次</button>
          <button className="btn btn-outline btn-sm" onClick={() => { setPaperFilter('WITHOUT_PAPER'); setAttentionFilter('NEEDS_ATTENTION'); }}>只看未生成验收卷</button>
          <button className="btn btn-outline btn-sm" onClick={() => { setKeyword('excel'); setStatusFilter('ALL'); setPaperFilter('ALL'); setAttentionFilter('ALL'); }}>只看 Excel 导入</button>
          <button className="btn btn-soft btn-sm" onClick={() => { setKeyword(''); setStatusFilter('ALL'); setPaperFilter('ALL'); setAttentionFilter('ALL'); }}>清空筛选</button>
          <span style={{ color: 'var(--text-secondary)', marginLeft: 'auto' }}>
            当前显示 {filtered.length} 个批次，其中失败 {filteredSummary.failed} 个，未生成验收卷 {filteredSummary.pendingPaper} 个，已有验收卷 {filteredSummary.withPaper} 个。
          </span>
        </div>
      </section>

      <section style={{ display: 'grid', gap: 'var(--space-4)' }}>
        {filtered.map((batch) => {
          const stats = toStats(batch.stats);
          const reviewPaperId = stats.reviewPaperId ? String(stats.reviewPaperId) : '';
          const saved = toNumber(stats.saved);
          const failed = toNumber(stats.failed);
          const invalid = toNumber(stats.invalid);
          const duplicateSkipped = toNumber(stats.duplicateSkipped);
          const total = toNumber(stats.total) || batch.groupCount;
          const batchNeedsAttention = needsAttention(batch, stats);
          return (
            <article key={batch.id} className="card" style={{ display: 'grid', gap: 'var(--space-3)' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', gap: 'var(--space-3)', alignItems: 'flex-start', flexWrap: 'wrap' }}>
                <div style={{ display: 'grid', gap: '6px' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-2)', flexWrap: 'wrap' }}>
                    <b style={{ fontSize: 'var(--text-lg)' }}>{batch.title || `导入批次 ${batch.id}`}</b>
                    <span className={statusBadgeClass(batch.status)}>{statusText(batch.status)}</span>
                    {batchNeedsAttention && <span className="badge badge-warning">需处理</span>}
                    {!reviewPaperId && saved > 0 && <span className="badge badge-muted">待生成验收卷</span>}
                  </div>
                  <span style={{ color: 'var(--text-secondary)' }}>
                    批次 ID {batch.id} · 来源 {batch.sourceType || 'json'}{batch.sourceName ? ` / ${batch.sourceName}` : ''}
                  </span>
                </div>

                <div style={{ display: 'flex', gap: 'var(--space-2)', flexWrap: 'wrap' }}>
                  <button className="btn btn-outline btn-sm" onClick={() => onOpenBatch(String(batch.id))}>查看详情</button>
                  <button className="btn btn-outline btn-sm" onClick={onOpenAudit}>看待验收题</button>
                  {reviewPaperId && <button className="btn btn-soft btn-sm" onClick={() => onOpenPaper(reviewPaperId)}>查看验收卷</button>}
                  {reviewPaperId && <button className="btn btn-primary btn-sm" onClick={() => onStartPaper(reviewPaperId)}>孩子端验收</button>}
                </div>
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(130px, 1fr))', gap: 'var(--space-3)' }}>
                <div className="editor-check-card success">
                  <b>{saved}</b>
                  <span>成功导入</span>
                </div>
                <div className={failed ? 'editor-check-card warning' : 'editor-check-card success'}>
                  <b>{failed}</b>
                  <span>保存失败</span>
                </div>
                <div className={invalid ? 'editor-check-card warning' : 'editor-check-card success'}>
                  <b>{invalid}</b>
                  <span>校验失败跳过</span>
                </div>
                <div className={duplicateSkipped ? 'editor-check-card warning' : 'editor-check-card success'}>
                  <b>{duplicateSkipped}</b>
                  <span>重复题跳过</span>
                </div>
                <div className="editor-check-card info">
                  <b>{total}</b>
                  <span>本次处理题数</span>
                </div>
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: 'var(--space-3)', color: 'var(--text-secondary)' }}>
                <span>创建时间：{formatDate(batch.createdAt)}</span>
                <span>完成时间：{formatDate(batch.completedAt)}</span>
                <span>已落库题组：{batch.groupCount}</span>
              </div>

              {!!batch.notes && <div className="tip" style={{ whiteSpace: 'pre-wrap' }}>{batch.notes}</div>}
              {!reviewPaperId && saved > 0 && (
                <div className="tip">
                  这批题已经导入，但还没有关联验收试卷。可以回到导入页重新生成，或者去体检中心按“待验收题”批量生成。
                </div>
              )}
            </article>
          );
        })}

        {!filtered.length && !loading && (
          <div className="empty-state">
            <b>{batches.length ? '当前筛选下没有批次' : '还没有导入批次'}</b>
            <p>{batches.length ? '可以换个筛选条件继续查。' : '先从 JSON / Excel 导一批题，批次记录就会出现在这里。'}</p>
          </div>
        )}
      </section>
    </div>
  );
}

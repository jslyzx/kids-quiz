import { useEffect, useMemo, useRef, useState } from 'react';
import { useLocation } from 'react-router-dom';
import { listStudentWrongAnswers, listWrongAnswers } from '../api/submissions';
import { renderMathHtml, renderMathText } from '../utils/mathText';
import { useSelectedStudentId } from '../utils/useSelectedStudent';

type Props = {
  onBack: () => void;
  onOpenPaperRecords: (paperId: string) => void;
  onPracticePaper: (paperId: string) => void;
  onRetryWrong: () => void;
  onRetryTag: (tag: string) => void;
  onPrintWrong: () => void;
};

function formatValue(value: unknown): string {
  if (value === null || value === undefined) return '-';
  if (Array.isArray(value)) return value.map(formatValue).join(', ');
  if (typeof value === 'object') return JSON.stringify(value);
  return String(value);
}

function formatDuration(seconds: unknown): string {
  const safe = Math.max(0, Math.floor(Number(seconds || 0)));
  if (!safe) return '-';
  const minutes = Math.floor(safe / 60);
  const rest = safe % 60;
  return minutes ? `${minutes}分${String(rest).padStart(2, '0')}秒` : `${rest}秒`;
}

function sourceLabel(source: string | undefined): string {
  return source === 'WRONG_RETRY' ? '错题重练' : '试卷练习';
}

function recordTags(record: any): string[] {
  const tags = [...(Array.isArray(record.question?.tags) ? record.question.tags : []), ...(Array.isArray(record.question?.group?.tags) ? record.question.group.tags : [])];
  return Array.from(new Set(tags.map((tag) => String(tag).trim()).filter(Boolean)));
}

function explanationHtml(record: any): string {
  return String(record.question?.content?.explanationHtml ?? '').trim();
}

function plainExplanation(record: any): string {
  return String(record.question?.explanation ?? '').trim();
}

export function WrongBookPage({ onBack, onOpenPaperRecords, onPracticePaper, onRetryWrong, onRetryTag, onPrintWrong }: Props) {
  const location = useLocation();
  const isKidRoute = location.pathname.startsWith('/kid');
  const selectedStudentId = useSelectedStudentId();
  const [records, setRecords] = useState<any[]>([]);
  const [keyword, setKeyword] = useState('');
  const [message, setMessage] = useState('');
  const [loading, setLoading] = useState(false);
  const refreshSeqRef = useRef(0);

  const refresh = async () => {
    const seq = refreshSeqRef.current + 1;
    refreshSeqRef.current = seq;
    try {
      setLoading(true);
      const data = await (isKidRoute ? listStudentWrongAnswers() : listWrongAnswers());
      if (seq !== refreshSeqRef.current) return;
      setRecords(data);
      setMessage(`已加载 ${data.length} 条错题`);
    } catch (error) {
      if (seq === refreshSeqRef.current) setMessage(`加载失败：${error instanceof Error ? error.message : String(error)}`);
    } finally {
      if (seq === refreshSeqRef.current) setLoading(false);
    }
  };

  useEffect(() => { void refresh(); }, [selectedStudentId, isKidRoute]);

  const filtered = useMemo(() => {
    const value = keyword.trim();
    if (!value) return records;
    return records.filter((record) => [
      record.question?.stem,
      record.paper?.title,
      record.student?.name,
      record.questionId,
      record.paperId,
      ...recordTags(record),
    ].some((item) => String(item ?? '').includes(value)));
  }, [records, keyword]);

  const byPaper = useMemo(() => {
    const map = new Map<string, number>();
    records.forEach((record) => map.set(String(record.paperId), (map.get(String(record.paperId)) || 0) + 1));
    return Array.from(map.entries()).map(([paperId, count]) => ({
      paperId,
      count,
      title: records.find((record) => String(record.paperId) === paperId)?.paper?.title || `试卷 ${paperId}`,
    }));
  }, [records]);

  const byTag = useMemo(() => {
    const map = new Map<string, number>();
    records.forEach((record) => {
      const tags = recordTags(record);
      (tags.length ? tags : ['未分类']).forEach((tag) => map.set(tag, (map.get(tag) || 0) + 1));
    });
    return Array.from(map.entries()).map(([tag, count]) => ({ tag, count })).sort((a, b) => b.count - a.count);
  }, [records]);

  return (
    <div className="wrong-book-page animate-fadeIn">
      {/* 头部区域 */}
      <header className="page-header" style={{ marginBottom: 'var(--space-5)' }}>
        <div className="page-header-left">
          <h1 className="page-title">错题复习本</h1>
          <p className="page-subtitle">汇总所有试卷与练习中的错题，支持按知识点和试卷智能聚类，助孩子集中复盘。</p>
        </div>
        <div className="page-actions" style={{ gap: 'var(--space-2)' }}>
          <button className="btn btn-secondary btn-sm" onClick={onBack}>返回题库</button>
          <button className="btn btn-primary btn-sm" onClick={onRetryWrong} disabled={!records.length}>
            🚀 错题重练
          </button>
          <button className="btn btn-secondary btn-sm" onClick={onPrintWrong} disabled={!records.length}>
            🖨️ 打印错题
          </button>
          <button className="btn btn-ghost btn-sm" onClick={refresh} disabled={loading}>
            {loading ? '同步中...' : '刷新'}
          </button>
        </div>
      </header>

      {/* 消息提示 */}
      {message && <div className="message-banner success" style={{ marginBottom: 'var(--space-4)' }}>{message}</div>}

      {/* 错题数据汇总大卡片 */}
      <div className="stat-grid stat-grid-auto animate-fadeInUp stagger-1" style={{ marginBottom: 'var(--space-5)' }}>
        <div className="stat-card"><span className="stat-value danger">{records.length}</span><span className="stat-label">错题总数</span></div>
        <div className="stat-card"><span className="stat-value">{byPaper.length}</span><span className="stat-label">涉及试卷</span></div>
        <div className="stat-card"><span className="stat-value accent">{byTag.length}</span><span className="stat-label">涉及知识点</span></div>
        <div className="stat-card"><span className="stat-value success">{filtered.length}</span><span className="stat-label">当前显示</span></div>
        <div className="stat-card">
          <span className="stat-value orange" style={{ fontSize: 'var(--text-lg)', paddingTop: '6px' }}>
            {records[0]?.submittedAt ? new Date(records[0].submittedAt).toLocaleDateString() : '-'}
          </span>
          <span className="stat-label">最近错题时间</span>
        </div>
      </div>

      {/* 搜索过滤框 */}
      <div className="card animate-fadeInUp stagger-2" style={{ padding: 'var(--space-3)', marginBottom: 'var(--space-5)' }}>
        <input 
          style={{ width: '100%', padding: 'var(--space-3) var(--space-4)', borderRadius: 'var(--radius-lg)', border: '1px solid var(--border-default)', fontSize: 'var(--text-base)', outline: 'none' }}
          placeholder="🔍 输入题干、知识点、试卷或 ID 过滤检索错题..." 
          value={keyword} 
          onChange={(event) => setKeyword(event.target.value)} 
        />
      </div>

      {/* 左右聚类汇总分栏 */}
      <div className="report-insight-grid animate-fadeInUp stagger-3" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 'var(--space-5)', marginBottom: 'var(--space-5)', alignItems: 'start' }}>
        {/* 按知识点汇总 */}
        {!!byTag.length && (
          <div className="card" style={{ padding: 'var(--space-5)', display: 'flex', flexDirection: 'column', gap: 'var(--space-3)' }}>
            <h3 style={{ fontSize: 'var(--text-base)', fontWeight: 800, margin: 0, color: 'var(--text-primary)', borderBottom: '1px solid var(--border-light)', paddingBottom: 'var(--space-2)' }}>
              🏷️ 按知识点汇总
            </h3>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-2)' }}>
              {byTag.map((item) => (
                <div key={item.tag} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: 'var(--space-2) var(--space-3)', background: 'var(--bg-muted)', borderRadius: 'var(--radius-lg)' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-2)' }}>
                    <span className="badge badge-primary">{item.tag}</span>
                    <small style={{ color: 'var(--text-secondary)', fontWeight: 700 }}>{item.count} 道错题</small>
                  </div>
                  <div style={{ display: 'flex', gap: '4px' }}>
                    <button className="btn btn-ghost btn-sm" style={{ padding: '2px 8px', fontSize: 'var(--text-xs)' }} onClick={() => setKeyword(item.tag)}>查看</button>
                    <button className="btn btn-soft btn-sm" style={{ padding: '2px 8px', fontSize: 'var(--text-xs)' }} onClick={() => onRetryTag(item.tag)}>重练</button>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* 按试卷汇总 */}
        {!!byPaper.length && (
          <div className="card" style={{ padding: 'var(--space-5)', display: 'flex', flexDirection: 'column', gap: 'var(--space-3)' }}>
            <h3 style={{ fontSize: 'var(--text-base)', fontWeight: 800, margin: 0, color: 'var(--text-primary)', borderBottom: '1px solid var(--border-light)', paddingBottom: 'var(--space-2)' }}>
              📄 按试卷汇总
            </h3>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-2)' }}>
              {byPaper.map((paper) => (
                <div key={paper.paperId} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: 'var(--space-2) var(--space-3)', background: 'var(--bg-muted)', borderRadius: 'var(--radius-lg)' }}>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '2px' }}>
                    <b style={{ fontSize: 'var(--text-sm)', color: 'var(--text-primary)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', maxWidth: '160px' }} title={paper.title}>{paper.title}</b>
                    <small style={{ color: 'var(--rose-600)', fontWeight: 700, fontSize: 'var(--text-xs)' }}>{paper.count} 道错题</small>
                  </div>
                  <div style={{ display: 'flex', gap: '4px' }}>
                    <button className="btn btn-ghost btn-sm" style={{ padding: '2px 8px', fontSize: 'var(--text-xs)' }} onClick={() => onOpenPaperRecords(paper.paperId)}>记录</button>
                    <button className="btn btn-soft btn-sm" style={{ padding: '2px 8px', fontSize: 'var(--text-xs)' }} onClick={() => onPracticePaper(paper.paperId)}>练习</button>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>

      <h2 style={{ fontSize: 'var(--text-lg)', fontWeight: 800, margin: '0 0 var(--space-4)', color: 'var(--text-primary)' }}>
        🔍 错题详情明细
      </h2>

      {/* 错题卡片流 */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-4)' }} className="animate-fadeInUp stagger-4">
        {filtered.map((record) => (
          <div 
            className="card card-hover" 
            style={{ 
              borderLeft: '5px solid var(--color-danger)',
              background: 'linear-gradient(180deg, var(--bg-card) 0%, rgba(244, 63, 94, 0.01) 100%)',
              padding: 'var(--space-5)',
              display: 'flex',
              flexDirection: 'column',
              gap: 'var(--space-4)',
              textAlign: 'left'
            }} 
            key={record.id}
          >
            {/* 卡片头部 */}
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 'var(--space-3)' }}>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                <h3 style={{ fontSize: 'var(--text-lg)', fontWeight: 800, margin: 0, color: 'var(--text-primary)' }}>
                  {record.question?.stem || `题目 ${record.questionId}`}
                </h3>
                <small style={{ color: 'var(--text-secondary)', fontSize: 'var(--text-xs)', fontWeight: 500 }}>
                  <span className="badge badge-danger" style={{ marginRight: '6px' }}>错题反馈</span>
                  试卷：<b style={{ color: 'var(--text-primary)' }}>{record.paper?.title || record.paperId}</b>
                  <span style={{ margin: '0 6px', color: 'var(--border-default)' }}>|</span>
                  来源：{sourceLabel(record.source)}
                  <span style={{ margin: '0 6px', color: 'var(--border-default)' }}>|</span>
                  时间：{record.submittedAt ? new Date(record.submittedAt).toLocaleString() : '-'}
                </small>
              </div>
              
              <span className="badge badge-danger badge-lg" style={{ fontSize: 'var(--text-sm)', padding: '5px 12px' }}>
                需复习
              </span>
            </div>

            {/* 卡片元数据表格 */}
            <div 
              style={{ 
                display: 'grid', 
                gridTemplateColumns: 'repeat(5, 1fr)', 
                gap: 'var(--space-3)', 
                padding: 'var(--space-3) var(--space-4)', 
                background: 'var(--slate-50)', 
                borderRadius: 'var(--radius-lg)',
                border: '1px solid var(--border-light)'
              }}
            >
              <div style={{ display: 'flex', flexDirection: 'column', gap: '2px' }}>
                <span style={{ fontSize: 'var(--text-xs)', color: 'var(--text-muted)' }}>得分情况</span>
                <b style={{ fontSize: 'var(--text-base)', color: 'var(--color-danger)' }}>{record.score} / {record.maxScore} 分</b>
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '2px' }}>
                <span style={{ fontSize: 'var(--text-xs)', color: 'var(--text-muted)' }}>作答耗时</span>
                <b style={{ fontSize: 'var(--text-base)', color: 'var(--text-primary)' }}>{formatDuration(record.durationSeconds)}</b>
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '2px' }}>
                <span style={{ fontSize: 'var(--text-xs)', color: 'var(--text-muted)' }}>题目 ID</span>
                <b style={{ fontSize: 'var(--text-base)', color: 'var(--text-secondary)', fontFamily: 'var(--font-mono)' }}>{record.questionId}</b>
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '2px' }}>
                <span style={{ fontSize: 'var(--text-xs)', color: 'var(--text-muted)' }}>关联试卷 ID</span>
                <b style={{ fontSize: 'var(--text-base)', color: 'var(--text-secondary)', fontFamily: 'var(--font-mono)' }}>{record.paperId}</b>
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '2px', gridColumn: 'span 1' }}>
                <span style={{ fontSize: 'var(--text-xs)', color: 'var(--text-muted)' }}>匹配知识点</span>
                <b style={{ fontSize: 'var(--text-base)', color: 'var(--color-primary)', textOverflow: 'ellipsis', overflow: 'hidden', whiteSpace: 'nowrap' }} title={recordTags(record).join('、')}>
                  {recordTags(record).join('、') || '暂无分类'}
                </b>
              </div>
            </div>

            {/* 作答空位明细红批 */}
            <div style={{ display: 'flex', flexDirection: 'column', border: '1px solid var(--border-default)', borderRadius: 'var(--radius-lg)', background: 'var(--bg-card)', overflow: 'hidden' }}>
              {(record.details || []).map((detail: any) => (
                <div 
                  key={detail.id} 
                  style={{ 
                    display: 'grid', 
                    gridTemplateColumns: '120px 1.5fr 1.5fr 60px', 
                    gap: 'var(--space-3)', 
                    alignItems: 'center', 
                    padding: 'var(--space-2) var(--space-4)', 
                    borderBottom: '1px solid var(--border-light)',
                    fontSize: 'var(--text-sm)',
                    background: detail.isCorrect ? 'transparent' : 'rgba(244, 63, 94, 0.02)'
                  }}
                >
                  <span style={{ fontFamily: 'var(--font-mono)', color: 'var(--text-secondary)' }}>填空位: {detail.slotKey}</span>
                  <span style={{ color: detail.isCorrect ? 'var(--text-primary)' : 'var(--rose-600)', textDecoration: detail.isCorrect ? 'none' : 'line-through' }}>
                    学生答案：<b>{renderMathText(formatValue(detail.studentValue))}</b>
                  </span>
                  <span style={{ color: 'var(--emerald-600)' }}>
                    正确答案：<b>{renderMathText(formatValue(detail.correctValue))}</b>
                  </span>
                  <span 
                    style={{ 
                      fontWeight: 800, 
                      textAlign: 'right', 
                      color: detail.isCorrect ? 'var(--color-success)' : 'var(--color-danger)' 
                    }}
                  >
                    {detail.isCorrect ? '对' : '错'}
                  </span>
                </div>
              ))}
              {!(record.details || []).length && (
                <div style={{ padding: 'var(--space-3) var(--space-4)', fontSize: 'var(--text-sm)', color: 'var(--text-secondary)' }}>
                  本题型直接匹配答案正误，暂无更深空位填报。
                </div>
              )}
            </div>

            {(explanationHtml(record) || plainExplanation(record)) && (
              <div className="question-explanation wrong-explanation">
                <div className="question-explanation-title">错题解析</div>
                {explanationHtml(record)
                  ? <div dangerouslySetInnerHTML={{ __html: renderMathHtml(explanationHtml(record)) }} />
                  : <div>{renderMathText(plainExplanation(record))}</div>}
              </div>
            )}
          </div>
        ))}
        
        {!filtered.length && (
          <div className="empty-state">
            <span className="empty-state-icon">🔍</span>
            <p className="empty-state-title">未发现匹配的错题</p>
            <p className="empty-state-desc">你可以重新输入搜索关键词，或者前往孩子首页做题来生成新的错题。</p>
          </div>
        )}
      </div>
    </div>
  );
}

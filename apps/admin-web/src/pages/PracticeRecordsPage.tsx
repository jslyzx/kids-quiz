import { useEffect, useMemo, useState } from 'react';
import { useLocation } from 'react-router-dom';
import { getPracticeAttempt, getStudentPracticeAttempt, listPaperPracticeAttempts, listPracticeAttempts, listStudentPaperPracticeAttempts, listStudentPracticeAttempts } from '../api/submissions';
import { useSelectedStudentId } from '../utils/useSelectedStudent';

type Props = {
  paperId?: string;
  onBack: () => void;
  onPreview?: () => void;
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
  if (source === 'WRONG_RETRY') return '错题重练';
  if (source === 'PRACTICE') return '专项练习';
  if (source === 'TASK') return '任务练习';
  return '试卷练习';
}

export function PracticeRecordsPage({ paperId, onBack, onPreview }: Props) {
  const location = useLocation();
  const isKidRoute = location.pathname.startsWith('/kid');
  const selectedStudentId = useSelectedStudentId();
  const [attempts, setAttempts] = useState<any[]>([]);
  const [attemptDetails, setAttemptDetails] = useState<Record<string, any>>({});
  const [detailLoadingId, setDetailLoadingId] = useState<string | null>(null);
  const [message, setMessage] = useState('');
  const [loading, setLoading] = useState(false);
  const [wrongOnly, setWrongOnly] = useState(false);
  const [expandedAttemptId, setExpandedAttemptId] = useState<string | null>(null);

  const refresh = async () => {
    try {
      setLoading(true);
      const attemptData = paperId
        ? await (isKidRoute ? listStudentPaperPracticeAttempts(paperId) : listPaperPracticeAttempts(paperId))
        : await (isKidRoute ? listStudentPracticeAttempts() : listPracticeAttempts());
      setAttempts(attemptData);
      setAttemptDetails({});
      setExpandedAttemptId(null);
      setMessage(`已加载 ${attemptData.length} 次练习`);
    } catch (error) {
      setMessage(`加载失败：${error instanceof Error ? error.message : String(error)}`);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { void refresh(); }, [paperId, selectedStudentId, isKidRoute]);

  const toggleAttempt = async (attemptId: string) => {
    if (expandedAttemptId === attemptId) {
      setExpandedAttemptId(null);
      return;
    }
    setExpandedAttemptId(attemptId);
    if (attemptDetails[attemptId]) return;
    try {
      setDetailLoadingId(attemptId);
      const detail = await (isKidRoute ? getStudentPracticeAttempt(attemptId) : getPracticeAttempt(attemptId));
      setAttemptDetails((prev) => ({ ...prev, [attemptId]: detail }));
    } catch (error) {
      setMessage(`加载本次练习详情失败：${error instanceof Error ? error.message : String(error)}`);
    } finally {
      setDetailLoadingId(null);
    }
  };

  const summary = useMemo(() => {
    const total = attempts.reduce((sum, item) => sum + Number(item.totalCount || 0), 0);
    const correct = attempts.reduce((sum, item) => sum + Number(item.correctCount || 0), 0);
    const wrong = attempts.reduce((sum, item) => sum + Number(item.wrongCount || 0), 0);
    const duration = attempts.reduce((sum, item) => sum + Number(item.durationSeconds || 0), 0);
    const rate = total ? Math.round((correct / total) * 100) : 0;
    return { attempts: attempts.length, total, correct, wrong, rate, duration };
  }, [attempts]);

  const visibleAttempts = wrongOnly ? attempts.filter((attempt) => Number(attempt.wrongCount || 0) > 0) : attempts;

  return (
    <div className="practice-records-page animate-fadeIn">
      {/* 头部区域 */}
      <header className="page-header" style={{ marginBottom: 'var(--space-5)' }}>
        <div className="page-header-left">
          <h1 className="page-title">{paperId ? '试卷练习记录' : '全部练习记录'}</h1>
          <p className="page-subtitle">
            {paperId ? '按这套试卷的每一次提交进行汇总，支持展开查看每一道题的作答明细。' : '汇总所有试卷练习和错题重练的记录，方便追踪孩子的练习表现与进步轨迹。'}
          </p>
        </div>
        <div className="page-actions" style={{ gap: 'var(--space-2)' }}>
          <button className="btn btn-secondary btn-sm" onClick={onBack}>
            {paperId ? '返回试卷管理' : '返回上一页'}
          </button>
          {onPreview && (
            <button className="btn btn-soft btn-sm" onClick={onPreview}>
              模拟学生答题
            </button>
          )}
          <button className="btn btn-ghost btn-sm" onClick={refresh} disabled={loading}>
            {loading ? '同步中...' : '刷新'}
          </button>
          <button 
            className={`btn btn-sm ${wrongOnly ? 'btn-danger' : 'btn-outline'}`} 
            onClick={() => setWrongOnly((value) => !value)}
          >
            {wrongOnly ? '显示全部记录' : '⚠️ 只看有错题'}
          </button>
        </div>
      </header>

      {/* 消息提示 */}
      {message && <div className="message-banner success" style={{ marginBottom: 'var(--space-4)' }}>{message}</div>}

      {/* 练习记录统计网格 */}
      <div className="stat-grid stat-grid-auto animate-fadeInUp stagger-1" style={{ marginBottom: 'var(--space-5)' }}>
        <div className="stat-card"><span className="stat-value">{summary.attempts}</span><span className="stat-label">提交次数</span></div>
        <div className="stat-card"><span className="stat-value">{summary.total}</span><span className="stat-label">累计题次</span></div>
        <div className="stat-card"><span className="stat-value success">{summary.correct}</span><span className="stat-label">答对题数</span></div>
        <div className="stat-card"><span className="stat-value danger">{summary.wrong}</span><span className="stat-label">答错题数</span></div>
        <div className="stat-card"><span className="stat-value accent">{summary.rate}%</span><span className="stat-label">综合正确率</span></div>
        <div className="stat-card"><span className="stat-value orange">{formatDuration(summary.duration)}</span><span className="stat-label">练习累计用时</span></div>
      </div>

      <h2 style={{ fontSize: 'var(--text-lg)', fontWeight: 800, margin: '0 0 var(--space-4)', color: 'var(--text-primary)' }}>
        {wrongOnly ? '⚠️ 有错题的提交记录' : '📝 练习提交历史'}
      </h2>

      {/* 提交卡片流 */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-4)' }} className="animate-fadeInUp stagger-2">
        {visibleAttempts.map((attempt) => {
          const isBad = Number(attempt.wrongCount || 0) > 0;
          const expanded = expandedAttemptId === String(attempt.id);
          const details = attemptDetails[String(attempt.id)]?.answers || [];
          return (
            <div 
              className="card card-hover" 
              style={{ 
                borderLeft: isBad ? '5px solid var(--color-danger)' : '5px solid var(--color-success)',
                background: isBad ? 'linear-gradient(180deg, var(--bg-card) 0%, rgba(244, 63, 94, 0.01) 100%)' : 'linear-gradient(180deg, var(--bg-card) 0%, rgba(16, 185, 129, 0.01) 100%)',
                padding: 'var(--space-5)',
                display: 'flex',
                flexDirection: 'column',
                gap: 'var(--space-4)',
                textAlign: 'left'
              }} 
              key={attempt.id}
            >
              {/* 卡片头部 */}
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 'var(--space-3)' }}>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                  <h3 style={{ fontSize: 'var(--text-lg)', fontWeight: 800, margin: 0, color: 'var(--text-primary)' }}>
                    {attempt.paper?.title || `试卷 ${attempt.paperId}`}
                  </h3>
                  <small style={{ color: 'var(--text-secondary)', fontSize: 'var(--text-xs)', fontWeight: 500 }}>
                    <span className="badge badge-muted" style={{ marginRight: '6px' }}>{sourceLabel(attempt.source)}</span>
                    学生：<b style={{ color: 'var(--text-primary)' }}>{attempt.student?.name || attempt.studentId}</b>
                    <span style={{ margin: '0 6px', color: 'var(--border-default)' }}>|</span>
                    提交时间：{attempt.submittedAt ? new Date(attempt.submittedAt).toLocaleString() : '-'}
                  </small>
                </div>
                
                <span className={`badge badge-lg ${isBad ? 'badge-danger' : 'badge-success'}`} style={{ fontSize: 'var(--text-lg)', padding: '6px 14px' }}>
                  {Number(attempt.accuracy || 0)}% 正确率
                </span>
              </div>

              {/* 卡片元数据表格 */}
              <div 
                style={{ 
                  display: 'grid', 
                  gridTemplateColumns: 'repeat(4, 1fr)', 
                  gap: 'var(--space-3)', 
                  padding: 'var(--space-3) var(--space-4)', 
                  background: 'var(--slate-50)', 
                  borderRadius: 'var(--radius-lg)',
                  border: '1px solid var(--border-light)'
                }}
              >
                <div style={{ display: 'flex', flexDirection: 'column', gap: '2px' }}>
                  <span style={{ fontSize: 'var(--text-xs)', color: 'var(--text-muted)' }}>答对题数 / 总题数</span>
                  <b style={{ fontSize: 'var(--text-base)', color: 'var(--text-primary)' }}>{attempt.correctCount} / {attempt.totalCount} 道</b>
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '2px' }}>
                  <span style={{ fontSize: 'var(--text-xs)', color: 'var(--text-muted)' }}>错题数目</span>
                  <b style={{ fontSize: 'var(--text-base)', color: isBad ? 'var(--color-danger)' : 'var(--text-primary)' }}>{attempt.wrongCount} 道</b>
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '2px' }}>
                  <span style={{ fontSize: 'var(--text-xs)', color: 'var(--text-muted)' }}>练习得分</span>
                  <b style={{ fontSize: 'var(--text-base)', color: 'var(--text-primary)' }}>{attempt.score} / {attempt.maxScore} 分</b>
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '2px' }}>
                  <span style={{ fontSize: 'var(--text-xs)', color: 'var(--text-muted)' }}>练习耗时</span>
                  <b style={{ fontSize: 'var(--text-base)', color: 'var(--color-orange)' }}>{formatDuration(attempt.durationSeconds)}</b>
                </div>
              </div>

              {/* 展开/折叠按钮 */}
              <div>
                <button 
                  className={`btn btn-sm ${expanded ? 'btn-secondary' : 'btn-soft'}`} 
                  style={{ display: 'inline-flex', alignItems: 'center', gap: '4px' }}
                  onClick={() => void toggleAttempt(String(attempt.id))}
                >
                  {expanded ? '▲ 收起作答明细' : '▼ 展开单题答题明细'}
                </button>
              </div>

              {/* 展开的单题详情区块 */}
              {expanded && (
                <div 
                  style={{ 
                    borderTop: '1px solid var(--border-light)', 
                    paddingTop: 'var(--space-4)', 
                    display: 'flex', 
                    flexDirection: 'column', 
                    gap: 'var(--space-3)' 
                  }}
                >
                  {detailLoadingId === String(attempt.id) && (
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px', padding: '20px 0', color: 'var(--text-muted)', justifyContent: 'center' }}>
                      <span className="btn-loading" style={{ color: 'var(--color-primary)' }} />
                      正在加载本次练习详情...
                    </div>
                  )}
                  
                  {details.map((record: any) => (
                    <div 
                      key={record.id} 
                      style={{ 
                        border: '1px solid var(--border-default)', 
                        borderRadius: 'var(--radius-lg)', 
                        background: 'var(--bg-card)', 
                        overflow: 'hidden' 
                      }}
                    >
                      {/* 题目头部 */}
                      <div 
                        style={{ 
                          display: 'flex', 
                          justifyContent: 'space-between', 
                          alignItems: 'center', 
                          padding: 'var(--space-3) var(--space-4)', 
                          background: record.isCorrect ? 'rgba(16, 185, 129, 0.05)' : 'rgba(244, 63, 94, 0.05)',
                          borderBottom: '1px solid var(--border-light)'
                        }}
                      >
                        <b style={{ color: 'var(--text-primary)', fontSize: 'var(--text-sm)', display: 'flex', alignItems: 'center', gap: '6px' }}>
                          <span style={{ fontSize: '16px' }}>{record.isCorrect ? '✅' : '❌'}</span>
                          {record.question?.stem || `题目 ${record.questionId}`}
                        </b>
                        <span className={`badge ${record.isCorrect ? 'badge-success' : 'badge-danger'}`}>
                          {record.isCorrect ? '本题答对' : '本题答错'}
                        </span>
                      </div>
                      
                      {/* 输入空（Slot）作答表格行 */}
                      <div style={{ display: 'flex', flexDirection: 'column' }}>
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
                              fontSize: 'var(--text-sm)'
                            }}
                          >
                            <span style={{ fontFamily: 'var(--font-mono)', color: 'var(--text-secondary)' }}>填空位: {detail.slotKey}</span>
                            <span style={{ color: detail.isCorrect ? 'var(--text-primary)' : 'var(--rose-600)', textDecoration: detail.isCorrect ? 'none' : 'line-through' }}>
                              学生答案：<b>{formatValue(detail.studentValue)}</b>
                            </span>
                            <span style={{ color: 'var(--emerald-600)' }}>
                              正确答案：<b>{formatValue(detail.correctValue)}</b>
                            </span>
                            <span 
                              style={{ 
                                fontWeight: 800, 
                                textAlign: 'right', 
                                color: detail.isCorrect ? 'var(--color-success)' : 'var(--color-danger)' 
                              }}
                            >
                              {detail.isCorrect ? '正确' : '错误'}
                            </span>
                          </div>
                        ))}
                        
                        {/* 无小空 */}
                        {!(record.details || []).length && (
                          <div style={{ padding: 'var(--space-3) var(--space-4)', fontSize: 'var(--text-sm)', color: 'var(--text-secondary)' }}>
                            本题型直接匹配答案正误，暂无更深空位填报。
                          </div>
                        )}
                      </div>
                    </div>
                  ))}
                  
                  {!details.length && <p style={{ color: 'var(--text-muted)', fontSize: 'var(--text-sm)', textAlign: 'center', margin: '14px 0' }}>暂无单题作答细节明细。</p>}
                </div>
              )}
            </div>
          );
        })}
        
        {!visibleAttempts.length && (
          <div className="empty-state">
            <span className="empty-state-icon">📝</span>
            <p className="empty-state-title">未发现任何练习提交记录</p>
            <p className="empty-state-desc">
              {wrongOnly ? '当前条件下没有带有错题的提交记录。' : '孩子还没有进行过答题提交。可以前去提交一次练习！'}
            </p>
          </div>
        )}
      </div>
    </div>
  );
}

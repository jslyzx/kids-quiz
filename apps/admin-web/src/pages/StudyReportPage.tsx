import { useEffect, useMemo, useState } from 'react';
import { useLocation } from 'react-router-dom';
import { listPapers, listStudentPapers } from '../api/papers';
import { getStudentWrongStats, getWrongStats, listPaperStats, listPracticeAttempts, listRecentAttempts, listStudentPaperStats, listStudentPracticeAttempts, listStudentRecentAttempts, listStudentTagStats, listStudentWrongAnswers, listTagStats, listWrongAnswers } from '../api/submissions';
import { useSelectedStudentId } from '../utils/useSelectedStudent';

type Props = {
  onBack: () => void;
  onTaskCenter: () => void;
  onWrongBook: () => void;
  onStartPaper: (paperId: string) => void;
  onOpenRecords: () => void;
};

function formatDate(value: Date) {
  return `${value.getMonth() + 1}/${value.getDate()}`;
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

function dayKey(value: unknown) {
  const date = value ? new Date(String(value)) : new Date();
  return `${date.getFullYear()}-${date.getMonth() + 1}-${date.getDate()}`;
}

export function StudyReportPage({ onBack, onTaskCenter, onWrongBook, onStartPaper, onOpenRecords }: Props) {
  const location = useLocation();
  const isKidRoute = location.pathname.startsWith('/kid');
  const selectedStudentId = useSelectedStudentId();
  const [papers, setPapers] = useState<any[]>([]);
  const [stats, setStats] = useState<any[]>([]);
  const [wrongAnswers, setWrongAnswers] = useState<any[]>([]);
  const [wrongStats, setWrongStats] = useState<any>(null);
  const [tagStats, setTagStats] = useState<any[]>([]);
  const [recentAttempts, setRecentAttempts] = useState<any[]>([]);
  const [practiceAttempts, setPracticeAttempts] = useState<any[]>([]);
  const [message, setMessage] = useState('');
  const [loading, setLoading] = useState(false);

  const refresh = async () => {
    try {
      setLoading(true);
      const [paperData, statData, wrongData, wrongStatData, tagStatData, recentData, attemptData] = await Promise.all([
        isKidRoute ? listStudentPapers() : listPapers(),
        isKidRoute ? listStudentPaperStats() : listPaperStats(),
        isKidRoute ? listStudentWrongAnswers() : listWrongAnswers(),
        isKidRoute ? getStudentWrongStats() : getWrongStats(),
        isKidRoute ? listStudentTagStats() : listTagStats(),
        isKidRoute ? listStudentRecentAttempts() : listRecentAttempts(),
        isKidRoute ? listStudentPracticeAttempts() : listPracticeAttempts(),
      ]);
      setPapers(paperData);
      setStats(statData);
      setWrongAnswers(wrongData);
      setWrongStats(wrongStatData);
      setTagStats(tagStatData);
      setRecentAttempts(recentData);
      setPracticeAttempts(attemptData);
      setMessage('学习报告已更新');
    } catch (error) {
      setMessage(`加载报告失败：${error instanceof Error ? error.message : String(error)}`);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { void refresh(); }, [selectedStudentId, isKidRoute]);

  const summary = useMemo(() => {
    const total = stats.reduce((sum, item) => sum + Number(item.total || 0), 0);
    const correct = stats.reduce((sum, item) => sum + Number(item.correct || 0), 0);
    const duration = practiceAttempts.reduce((sum, item) => sum + Number(item.durationSeconds || 0), 0);
    const practicedDays = new Set(practiceAttempts.map((item) => dayKey(item.submittedAt))).size;
    return {
      total,
      correct,
      wrong: Number(wrongStats?.unresolvedSlots ?? wrongAnswers.length),
      masteredWrong: Number(wrongStats?.masteredSlots ?? 0),
      duration,
      practicedDays,
      accuracy: total ? Math.round((correct / total) * 100) : 0,
    };
  }, [stats, wrongAnswers.length, wrongStats, practiceAttempts]);

  const last7Days = useMemo(() => {
    const today = new Date();
    const map = new Map<string, { date: Date; total: number; correct: number; duration: number }>();
    for (let i = 6; i >= 0; i -= 1) {
      const date = new Date(today);
      date.setDate(today.getDate() - i);
      map.set(dayKey(date), { date, total: 0, correct: 0, duration: 0 });
    }
    practiceAttempts.forEach((record) => {
      const key = dayKey(record.submittedAt);
      const item = map.get(key);
      if (!item) return;
      item.total += Number(record.totalCount || 0);
      item.correct += Number(record.correctCount || 0);
      item.duration += Number(record.durationSeconds || 0);
    });
    return Array.from(map.values());
  }, [practiceAttempts]);

  const paperRows = useMemo(() => papers.map((paper) => {
    const stat = stats.find((item) => String(item.paperId) === String(paper.id));
    return {
      paper,
      stat,
      accuracy: stat ? Number(stat.accuracy || 0) : 0,
      status: !stat ? '未练习' : Number(stat.accuracy || 0) >= 90 ? '已达标' : '需巩固',
    };
  }), [papers, stats]);

  const strongest = paperRows.filter((item) => item.stat).sort((a, b) => b.accuracy - a.accuracy)[0];
  const weakest = paperRows.filter((item) => item.stat).sort((a, b) => a.accuracy - b.accuracy)[0];
  const weakTags = tagStats.filter((item) => Number(item.total || 0) >= 1).slice(0, 5);
  const strongTags = [...tagStats].filter((item) => Number(item.total || 0) >= 3).sort((a, b) => Number(b.accuracy || 0) - Number(a.accuracy || 0)).slice(0, 5);
  const reportGeneratedAt = useMemo(() => new Date().toLocaleString(), [selectedStudentId, isKidRoute, practiceAttempts.length]);
  const reportStudentLabel = isKidRoute ? '当前学生' : selectedStudentId ? `学生 ID ${selectedStudentId}` : '当前选中学生';
  const dailyAdvice = useMemo(() => {
    if (summary.wrong > 0) return `先重练 ${summary.wrong} 个当前错题，再做一套短练习。`;
    const weak = weakTags[0];
    if (weak) return `今天优先练「${weak.tag}」，目标正确率提升到 90%。`;
    if (paperRows.some((item) => !item.stat)) return '可以挑一套还没练过的试卷，先建立基础数据。';
    return '整体状态不错，今天做 10 分钟保持手感就好。';
  }, [summary.wrong, weakTags, paperRows]);

  return (
    <div className="study-report-page animate-fadeIn">
      {/* 头部区域 */}
      <header className="page-header" style={{ marginBottom: 'var(--space-5)' }}>
        <div className="page-header-left">
          <h1 className="page-title">学习报告</h1>
          <p className="page-subtitle">汇总最近练习表现，分析各知识点和试卷掌握情况，助力孩子精准提升。</p>
        </div>
        <div className="page-actions">
          <button className="btn btn-soft btn-sm" onClick={refresh}>
            {loading ? '生成中...' : '刷新报告'}
          </button>
          <button className="btn btn-outline btn-sm" onClick={() => window.print()}>
            打印报告
          </button>
        </div>
      </header>

      {/* 消息提示 */}
      {message && <div className="message-banner success" style={{ marginBottom: 'var(--space-4)' }}>{message}</div>}

      <section className="reportPrintMeta">
        <span><b>报告对象</b>{reportStudentLabel}</span>
        <span><b>统计范围</b>累计数据 + 最近 7 天趋势</span>
        <span><b>生成时间</b>{reportGeneratedAt}</span>
      </section>

      {/* 总体数据大卡片统计网格 */}
      <div className="stat-grid stat-grid-auto animate-fadeInUp stagger-1" style={{ marginBottom: 'var(--space-5)' }}>
        <div className="stat-card"><span className="stat-value">{summary.total}</span><span className="stat-label">累计题次</span></div>
        <div className="stat-card"><span className="stat-value accent">{summary.accuracy}%</span><span className="stat-label">总体正确率</span></div>
        <div className="stat-card"><span className="stat-value danger">{summary.wrong}</span><span className="stat-label">当前错题</span></div>
        <div className="stat-card"><span className="stat-value success">{summary.masteredWrong}</span><span className="stat-label">已掌握错点</span></div>
        <div className="stat-card"><span className="stat-value orange">{summary.practicedDays} 天</span><span className="stat-label">最近练习天数</span></div>
        <div className="stat-card"><span className="stat-value warning">{formatDuration(summary.duration)}</span><span className="stat-label">累计用时</span></div>
      </div>

      {/* 掌握洞察 */}
      <div className="report-insight-grid animate-fadeInUp stagger-2" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 'var(--space-4)', marginBottom: 'var(--space-5)' }}>
        <div className="report-insight good" style={{ padding: 'var(--space-5)', borderRadius: 'var(--radius-xl)' }}>
          <span className="badge badge-success">掌握最好</span>
          <b style={{ fontSize: 'var(--text-lg)', margin: '10px 0 4px', display: 'block', color: 'var(--text-primary)' }}>{strongest?.paper.title || '暂无数据'}</b>
          <p style={{ margin: 0, fontSize: 'var(--text-sm)' }}>
            {strongest ? `正确率已达到 ${strongest.accuracy}%` : '孩子完成一次练习后会在此生成智能分析。'}
          </p>
        </div>
        <div className="report-insight warn" style={{ padding: 'var(--space-5)', borderRadius: 'var(--radius-xl)' }}>
          <span className="badge badge-warning">优先巩固</span>
          <b style={{ fontSize: 'var(--text-lg)', margin: '10px 0 4px', display: 'block', color: 'var(--text-primary)' }}>{weakest?.paper.title || '暂无数据'}</b>
          <p style={{ margin: 0, fontSize: 'var(--text-sm)' }}>
            {weakest ? `正确率仅 ${weakest.accuracy}%，建议加入今日重点计划。` : '暂无明显薄弱的试卷，继续保持！'}
          </p>
        </div>
      </div>

      <div className="message-banner info animate-fadeInUp stagger-2" style={{ marginBottom: 'var(--space-5)' }}>
        <b>今日建议：</b>
        <span>{dailyAdvice}</span>
        {summary.wrong > 0 ? <button className="btn btn-primary btn-sm" onClick={onWrongBook}>去错题本</button> : <button className="btn btn-primary btn-sm" onClick={onTaskCenter}>打开今日任务</button>}
      </div>

      {/* 知识点掌握情况 */}
      <div className="tag-stats-grid animate-fadeInUp stagger-3" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 'var(--space-4)', marginBottom: 'var(--space-5)' }}>
        {/* 薄弱点 */}
        <div className="tag-stats-box warn" style={{ padding: 'var(--space-5)', borderRadius: 'var(--radius-xl)' }}>
          <h3 style={{ fontSize: 'var(--text-base)', fontWeight: 800, margin: '0 0 var(--space-3)' }}>⚠️ 优先巩固薄弱项</h3>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-2)' }}>
            {weakTags.map((item) => (
              <div className="tag-stat-row" key={item.tag} style={{ margin: 0, padding: 'var(--space-3)', border: '1px solid var(--border-default)', background: 'var(--bg-card)' }}>
                <b>{item.tag}</b>
                <span className="stat-value danger" style={{ fontSize: 'var(--text-lg)' }}>{item.accuracy}%</span>
                <small style={{ color: 'var(--text-secondary)' }}>{item.correct}/{item.total} 正确，待复习错题数：{item.wrong} 道</small>
              </div>
            ))}
            {!weakTags.length && <p style={{ color: 'var(--text-muted)', fontSize: 'var(--text-sm)', textAlign: 'center', margin: '20px 0' }}>暂无知识点分析，录入题目标签后会逐步形成。</p>}
          </div>
        </div>

        {/* 优势点 */}
        <div className="tag-stats-box good" style={{ padding: 'var(--space-5)', borderRadius: 'var(--radius-xl)' }}>
          <h3 style={{ fontSize: 'var(--text-base)', fontWeight: 800, margin: '0 0 var(--space-3)' }}>🎉 掌握较好优势项</h3>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-2)' }}>
            {strongTags.map((item) => (
              <div className="tag-stat-row" key={item.tag} style={{ margin: 0, padding: 'var(--space-3)', border: '1px solid var(--border-default)', background: 'var(--bg-card)' }}>
                <b>{item.tag}</b>
                <span className="stat-value success" style={{ fontSize: 'var(--text-lg)' }}>{item.accuracy}%</span>
                <small style={{ color: 'var(--text-secondary)' }}>{item.correct}/{item.total} 正确，涵盖高频练习 {item.questionCount} 道题</small>
              </div>
            ))}
            {!strongTags.length && <p style={{ color: 'var(--text-muted)', fontSize: 'var(--text-sm)', textAlign: 'center', margin: '20px 0' }}>练习同类标签超过 3 次且正确率优秀后在此展示。</p>}
          </div>
        </div>
      </div>

      {/* 柱状图活跃分析 */}
      <div className="card animate-fadeInUp stagger-4" style={{ marginBottom: 'var(--space-5)', padding: 'var(--space-5)' }}>
        <h3 style={{ fontSize: 'var(--text-base)', fontWeight: 800, margin: '0 0 var(--space-4)', color: 'var(--text-primary)' }}>📈 最近 7 天练习活跃趋势</h3>
        <div className="week-report" style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', gap: 'var(--space-4)', padding: 'var(--space-2)' }}>
          {last7Days.map((item) => {
            const rate = item.total ? Math.round((item.correct / item.total) * 100) : 0;
            return (
              <div className="day-report" key={item.date.toISOString()} style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '6px' }}>
                <b style={{ color: 'var(--text-secondary)', fontSize: 'var(--text-xs)' }}>{formatDate(item.date)}</b>
                <div className="day-bar" style={{ height: '120px', width: '20px', background: 'var(--slate-100)', borderRadius: 'var(--radius-full)', display: 'flex', alignItems: 'flex-end', overflow: 'hidden' }}>
                  <i style={{ height: `${Math.max(6, rate)}%`, width: '100%', background: rate >= 90 ? 'linear-gradient(180deg, var(--emerald-400), var(--emerald-500))' : 'linear-gradient(180deg, var(--blue-400), var(--violet-500))', borderRadius: 'var(--radius-full)' }} />
                </div>
                <span style={{ fontSize: 'var(--text-xs)', fontWeight: 800, color: item.total ? 'var(--color-primary)' : 'var(--text-muted)' }}>
                  {item.total ? `${rate}%` : '未练'}
                </span>
                <small style={{ color: 'var(--text-muted)', fontSize: '10px' }}>{item.total} 题次</small>
              </div>
            );
          })}
        </div>
      </div>

      {/* 试卷掌握明细 */}
      <div className="card animate-fadeInUp stagger-5" style={{ marginBottom: 'var(--space-5)', padding: 'var(--space-5)' }}>
        <h3 style={{ fontSize: 'var(--text-base)', fontWeight: 800, margin: '0 0 var(--space-4)', color: 'var(--text-primary)' }}>📄 试卷掌握度列表</h3>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-2)' }}>
          {paperRows.map(({ paper, stat, accuracy, status }) => {
            const isOk = status === '已达标';
            const isWarn = status === '需巩固';
            return (
              <div 
                key={paper.id} 
                style={{ 
                  display: 'flex', 
                  alignItems: 'center', 
                  justifyContent: 'space-between', 
                  padding: 'var(--space-3) var(--space-4)', 
                  background: isOk ? 'var(--emerald-50)' : isWarn ? 'var(--orange-50)' : 'var(--bg-muted)', 
                  borderRadius: 'var(--radius-lg)',
                  borderLeft: isOk ? '4px solid var(--color-success)' : isWarn ? '4px solid var(--color-orange)' : '4px solid var(--slate-300)',
                  transition: 'all var(--transition-normal)'
                }}
              >
                <div style={{ display: 'flex', flexDirection: 'column', gap: '2px', flex: 1 }}>
                  <b style={{ fontSize: 'var(--text-base)', color: 'var(--text-primary)' }}>{paper.title}</b>
                  <small style={{ color: 'var(--text-secondary)', fontSize: 'var(--text-xs)' }}>{paper.description || '暂无说明'}</small>
                </div>
                
                <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-6)', marginRight: 'var(--space-4)' }}>
                  <span className={`badge ${isOk ? 'badge-success' : isWarn ? 'badge-warning' : 'badge-muted'}`}>
                    {status}
                  </span>
                  <span style={{ fontSize: 'var(--text-sm)', fontWeight: 700, minWidth: '80px', color: 'var(--text-secondary)' }}>
                    {stat ? `正确率 ${accuracy}%` : '正确率 -'}
                  </span>
                  <span style={{ fontSize: 'var(--text-sm)', fontWeight: 700, minWidth: '70px', color: 'var(--text-secondary)' }}>
                    {stat ? `错题 ${stat.wrong} 道` : '未开始'}
                  </span>
                </div>
                
                <button 
                  className="btn btn-soft btn-sm" 
                  style={{ padding: '4px 10px' }}
                  onClick={() => onStartPaper(String(paper.id))}
                >
                  {stat ? '再次巩固' : '开始练习'}
                </button>
              </div>
            );
          })}
          {!paperRows.length && (
            <div className="empty-state" style={{ padding: 'var(--space-6) 0' }}>
              <span className="empty-state-icon">📄</span>
              <p className="empty-state-title">暂无试卷</p>
              <p className="empty-state-desc">请前往家长后台创建试卷，给孩子安排今日练习。</p>
            </div>
          )}
        </div>
      </div>

      {/* 最近记录 */}
      <div className="card animate-fadeInUp stagger-6" style={{ padding: 'var(--space-5)' }}>
        <div className="card-header" style={{ paddingBottom: 'var(--space-2)', borderBottom: '1px solid var(--border-light)', marginBottom: 'var(--space-4)' }}>
          <h3 className="card-title" style={{ fontSize: 'var(--text-base)', fontWeight: 800, color: 'var(--text-primary)' }}>🕐 孩子最近做题记录</h3>
          <button className="btn btn-ghost btn-sm" onClick={onOpenRecords}>查看全部记录</button>
        </div>
        
        <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-2)' }}>
          {recentAttempts.slice(0, 8).map((record) => (
            <div key={record.id} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: 'var(--space-2) var(--space-3)', background: 'var(--bg-muted)', borderRadius: 'var(--radius-lg)' }}>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '2px', flex: 1, marginRight: 'var(--space-3)' }}>
                <b style={{ fontSize: 'var(--text-base)', color: 'var(--text-primary)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', maxWidth: '400px' }} title={record.question?.stem || `题目 ${record.questionId}`}>
                  {record.question?.stem || `题目 ${record.questionId}`}
                </b>
                <small style={{ color: 'var(--text-muted)' }}>
                  {sourceLabel(record.source)} / {record.paper?.title || `试卷 ${record.paperId}`} / {record.submittedAt ? new Date(record.submittedAt).toLocaleString() : '-'}
                </small>
              </div>
              <span className={`badge ${record.isCorrect ? 'badge-success' : 'badge-danger'}`}>
                {record.isCorrect ? '答对' : '需复习'}
              </span>
            </div>
          ))}
          {!recentAttempts.length && <p style={{ color: 'var(--text-muted)', textAlign: 'center', margin: '20px 0' }}>还没有任何练习记录。</p>}
        </div>
      </div>
    </div>
  );
}

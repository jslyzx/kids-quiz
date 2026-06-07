import { useEffect, useMemo, useState } from 'react';
import { listPapers } from '../api/papers';
import { listQuestionGroups } from '../api/questionGroups';
import { getWrongStats, listPaperStats, listPracticeAttempts, listRecentAttempts, listTagStats, listWrongAnswers } from '../api/submissions';
import { badgeLabels, readRewardState } from '../utils/rewards';
import { readTaskPlanSettings } from '../utils/taskPlan';
import { renderMathText } from '../utils/mathText';

type Props = {
  onKidHome: () => void;
  onQuestions: () => void;
  onPapers: () => void;
  onTaskSettings: () => void;
  onTaskCenter: () => void;
  onReport: () => void;
  onWrongBook: () => void;
  onRewards: () => void;
  onStartPaper: (paperId: string) => void;
  onOpenRecords: () => void;
};

function formatDuration(seconds: unknown): string {
  const safe = Math.max(0, Math.floor(Number(seconds || 0)));
  if (!safe) return '-';
  const minutes = Math.floor(safe / 60);
  const rest = safe % 60;
  return minutes ? `${minutes}分${String(rest).padStart(2, '0')}秒` : `${rest}秒`;
}

function isToday(value: unknown) {
  if (!value) return false;
  const date = new Date(String(value));
  const now = new Date();
  return date.getFullYear() === now.getFullYear() && date.getMonth() === now.getMonth() && date.getDate() === now.getDate();
}

function isBrokenText(value: unknown) {
  const text = String(value ?? '').trim();
  return !text || /^\?+$/.test(text) || /�/.test(text);
}

function displayText(value: unknown, fallback: string) {
  return isBrokenText(value) ? fallback : String(value);
}

function displayStem(value: unknown, fallback: string) {
  return displayText(value, fallback)
    .replace(/\{\{blank:[^}]+\}\}/g, '□')
    .replace(/\{_\d+\}/g, '□');
}

export function ParentDashboardPage({ onQuestions, onPapers, onTaskSettings, onTaskCenter, onReport, onWrongBook, onRewards, onStartPaper, onOpenRecords }: Props) {
  const [papers, setPapers] = useState<any[]>([]);
  const [groups, setGroups] = useState<any[]>([]);
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
      const [paperData, groupData, statData, wrongData, wrongStatData, tagStatData, recentData, attemptData] = await Promise.all([
        listPapers(),
        listQuestionGroups(),
        listPaperStats(),
        listWrongAnswers(),
        getWrongStats(),
        listTagStats(),
        listRecentAttempts(),
        listPracticeAttempts(),
      ]);
      setPapers(paperData);
      setGroups(groupData);
      setStats(statData);
      setWrongAnswers(wrongData);
      setWrongStats(wrongStatData);
      setTagStats(tagStatData);
      setRecentAttempts(recentData);
      setPracticeAttempts(attemptData);
      setMessage('家长仪表盘已更新');
    } catch (error) {
      setMessage(`加载失败：${error instanceof Error ? error.message : String(error)}`);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { void refresh(); }, []);

  const reward = readRewardState();
  const taskSettings = readTaskPlanSettings();

  const summary = useMemo(() => {
    const total = stats.reduce((sum, item) => sum + Number(item.total || 0), 0);
    const correct = stats.reduce((sum, item) => sum + Number(item.correct || 0), 0);
    const todayAttempts = practiceAttempts.filter((item) => isToday(item.submittedAt));
    const todayCorrect = todayAttempts.reduce((sum, item) => sum + Number(item.correctCount || 0), 0);
    const todayTotal = todayAttempts.reduce((sum, item) => sum + Number(item.totalCount || 0), 0);
    const duration = practiceAttempts.reduce((sum, item) => sum + Number(item.durationSeconds || 0), 0);
    return {
      total,
      correct,
      accuracy: total ? Math.round((correct / total) * 100) : 0,
      todayTotal,
      todayAccuracy: todayTotal ? Math.round((todayCorrect / todayTotal) * 100) : 0,
      wrongSlots: Number(wrongStats?.unresolvedSlots ?? wrongAnswers.length),
      masteredSlots: Number(wrongStats?.masteredSlots ?? 0),
      duration,
    };
  }, [stats, practiceAttempts, wrongStats, wrongAnswers.length]);

  const weakPapers = useMemo(() => papers.map((paper) => {
    const stat = stats.find((item) => String(item.paperId) === String(paper.id));
    return {
      paper,
      stat,
      accuracy: stat ? Number(stat.accuracy || 0) : -1,
      wrong: stat ? Number(stat.wrong || 0) : 0,
    };
  }).sort((a, b) => {
    if (a.accuracy < 0 && b.accuracy >= 0) return -1;
    if (b.accuracy < 0 && a.accuracy >= 0) return 1;
    return a.accuracy - b.accuracy;
  }).slice(0, 4), [papers, stats]);

  const taskPaperCount = taskSettings.paperIds.length || papers.length;
  const weakTags = tagStats
    .filter((item) => Number(item.total || 0) >= 1 && !isBrokenText(item.tag))
    .slice(0, 4);

  return (
    <div className="dashboard-page animate-fadeIn">
      <header className="page-header" style={{ marginBottom: 'var(--space-5)' }}>
        <div className="page-header-left">
          <h1 className="page-title">家长仪表盘</h1>
          <p className="page-subtitle">统一管理题库、试卷、今日任务、学习报告和奖励情况。</p>
        </div>
        <div className="page-actions">
          <button className="btn btn-soft btn-sm" onClick={refresh}>
            {loading ? '更新中...' : '刷新数据'}
          </button>
        </div>
      </header>

      {message && <div className="message-banner success" style={{ marginBottom: 'var(--space-4)' }}>{message}</div>}

      <div className="card card-gradient animate-fadeInUp stagger-1" style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 'var(--space-4)', padding: 'var(--space-6)', marginBottom: 'var(--space-5)' }}>
        <div>
          <span className="badge badge-warning" style={{ background: 'rgba(255, 255, 255, 0.2)', color: '#fff', border: 'none', marginBottom: 'var(--space-2)' }}>今日概览</span>
          <h2 style={{ margin: 'var(--space-1) 0', fontSize: 'var(--text-xl)', color: '#fff' }}>
            {summary.todayTotal ? `今天已练 ${summary.todayTotal} 题次` : '今天还没开始练习'}
          </h2>
          <p style={{ margin: 0, opacity: 0.9, color: 'rgba(255, 255, 255, 0.9)' }}>
            {summary.todayTotal ? `今日正确率 ${summary.todayAccuracy}%，继续保持。` : '可以先让孩子从“今日任务”开始。'}
          </p>
        </div>
        <button className="btn" style={{ background: '#fff', color: 'var(--blue-600)', border: 'none' }} onClick={onTaskCenter}>安排孩子开始练习</button>
      </div>

      <div className="stat-grid stat-grid-auto animate-fadeInUp stagger-2" style={{ marginBottom: 'var(--space-5)' }}>
        <div className="stat-card"><span className="stat-value">{groups.length}</span><span className="stat-label">题组</span></div>
        <div className="stat-card"><span className="stat-value">{papers.length}</span><span className="stat-label">试卷</span></div>
        <div className="stat-card"><span className="stat-value accent">{summary.accuracy}%</span><span className="stat-label">累计正确率</span></div>
        <div className="stat-card"><span className="stat-value danger">{summary.wrongSlots}</span><span className="stat-label">当前错题</span></div>
        <div className="stat-card"><span className="stat-value success">{summary.masteredSlots}</span><span className="stat-label">已掌握错点</span></div>
        <div className="stat-card"><span className="stat-value orange">{formatDuration(summary.duration)}</span><span className="stat-label">最近用时</span></div>
        <div className="stat-card"><span className="stat-value warning">{reward.stars}</span><span className="stat-label">星星</span></div>
      </div>

      <div className="card-grid card-grid-auto animate-fadeInUp stagger-3" style={{ marginBottom: 'var(--space-6)' }}>
        <button className="card card-hover card-clickable" style={{ textAlign: 'left', display: 'flex', flexDirection: 'column', gap: 'var(--space-2)', border: '1px solid var(--border-default)', background: 'var(--bg-card)' }} onClick={onQuestions}>
          <span style={{ fontSize: '24px' }}>📚</span>
          <b style={{ fontSize: 'var(--text-lg)', color: 'var(--text-primary)' }}>题库管理</b>
          <span style={{ color: 'var(--text-muted)', fontSize: 'var(--text-sm)', fontWeight: 500 }}>录入、编辑、预览题目</span>
        </button>
        <button className="card card-hover card-clickable" style={{ textAlign: 'left', display: 'flex', flexDirection: 'column', gap: 'var(--space-2)', border: '1px solid var(--border-default)', background: 'var(--bg-card)' }} onClick={onPapers}>
          <span style={{ fontSize: '24px' }}>📝</span>
          <b style={{ fontSize: 'var(--text-lg)', color: 'var(--text-primary)' }}>试卷管理</b>
          <span style={{ color: 'var(--text-muted)', fontSize: 'var(--text-sm)', fontWeight: 500 }}>组卷、调整题目顺序</span>
        </button>
        <button className="card card-hover card-clickable" style={{ textAlign: 'left', display: 'flex', flexDirection: 'column', gap: 'var(--space-2)', border: '1px solid var(--border-default)', background: 'var(--bg-card)' }} onClick={onTaskSettings}>
          <span style={{ fontSize: '24px' }}>📌</span>
          <b style={{ fontSize: 'var(--text-lg)', color: 'var(--text-primary)' }}>任务设置</b>
          <span style={{ color: 'var(--text-muted)', fontSize: 'var(--text-sm)', fontWeight: 500 }}>{taskPaperCount} 套试卷参与，目标 {taskSettings.targetAccuracy}%</span>
        </button>
        <button className="card card-hover card-clickable" style={{ textAlign: 'left', display: 'flex', flexDirection: 'column', gap: 'var(--space-2)', border: '1px solid var(--border-default)', background: 'var(--bg-card)' }} onClick={onWrongBook}>
          <span style={{ fontSize: '24px' }}>❌</span>
          <b style={{ fontSize: 'var(--text-lg)', color: 'var(--text-primary)' }}>错题本</b>
          <span style={{ color: 'var(--text-muted)', fontSize: 'var(--text-sm)', fontWeight: 500 }}>{summary.wrongSlots} 个待复习，{summary.masteredSlots} 个已掌握</span>
        </button>
        <button className="card card-hover card-clickable" style={{ textAlign: 'left', display: 'flex', flexDirection: 'column', gap: 'var(--space-2)', border: '1px solid var(--border-default)', background: 'var(--bg-card)' }} onClick={onRewards}>
          <span style={{ fontSize: '24px' }}>⭐</span>
          <b style={{ fontSize: 'var(--text-lg)', color: 'var(--text-primary)' }}>奖励中心</b>
          <span style={{ color: 'var(--text-muted)', fontSize: 'var(--text-sm)', fontWeight: 500 }}>{reward.badges.length} 枚徽章：{reward.badges[0] ? badgeLabels[reward.badges[0]] : '暂无'}</span>
        </button>
      </div>

      <div className="report-insight-grid animate-fadeInUp stagger-4">
        <div className="card" style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-3)' }}>
          <div className="card-header" style={{ paddingBottom: 'var(--space-2)', borderBottom: '1px solid var(--border-light)', marginBottom: 0 }}>
            <h2 className="card-title">优先关注</h2>
            <button className="btn btn-ghost btn-sm" onClick={onReport}>完整报告</button>
          </div>

          {!!weakTags.length && (
            <div style={{ background: 'var(--color-danger-soft)', borderRadius: 'var(--radius-lg)', padding: 'var(--space-3)', display: 'flex', flexDirection: 'column', gap: 'var(--space-2)' }}>
              <b style={{ color: 'var(--rose-700)', fontSize: 'var(--text-sm)' }}>薄弱知识点</b>
              <div style={{ display: 'flex', gap: 'var(--space-2)', flexWrap: 'wrap' }}>
                {weakTags.map((item) => (
                  <span className="badge badge-danger" key={item.tag}>
                    {item.tag} {item.accuracy}%
                  </span>
                ))}
              </div>
            </div>
          )}

          <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-2)' }}>
            {weakPapers.map(({ paper, stat, accuracy, wrong }) => (
              <div key={paper.id} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: 'var(--space-2) var(--space-3)', background: 'var(--bg-muted)', borderRadius: 'var(--radius-lg)' }}>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '2px' }}>
                  <b style={{ fontSize: 'var(--text-base)', color: 'var(--text-primary)' }}>{displayText(paper.title, `试卷 ${paper.id}`)}</b>
                  <small style={{ color: 'var(--text-muted)' }}>
                    {stat ? `正确率 ${accuracy}% / 错题 ${wrong}` : '还未练习'}
                  </small>
                </div>
                <button className="btn btn-soft btn-sm" onClick={() => onStartPaper(String(paper.id))}>
                  {stat ? '巩固' : '开始'}
                </button>
              </div>
            ))}
            {!weakPapers.length && <p style={{ color: 'var(--text-muted)', textAlign: 'center', margin: 'var(--space-4) 0' }}>暂无试卷，请先创建试卷。</p>}
          </div>
        </div>

        <div className="card" style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-3)' }}>
          <div className="card-header" style={{ paddingBottom: 'var(--space-2)', borderBottom: '1px solid var(--border-light)', marginBottom: 0 }}>
            <h2 className="card-title">最近动态</h2>
            <button className="btn btn-ghost btn-sm" onClick={onOpenRecords}>全部记录</button>
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-2)' }}>
            {recentAttempts.slice(0, 5).map((record) => {
              const stem = displayStem(record.question?.stem, `题目 ${record.questionId}`);
              const paperTitle = displayText(record.paper?.title, record.paperId ? `试卷 ${record.paperId}` : '自由练习');
              return (
                <div key={record.id} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: 'var(--space-2) var(--space-3)', background: 'var(--bg-muted)', borderRadius: 'var(--radius-lg)' }}>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '2px', flex: 1, marginRight: 'var(--space-3)' }}>
                    <b style={{ fontSize: 'var(--text-base)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', maxWidth: '240px', color: 'var(--text-primary)' }} title={stem}>
                      {renderMathText(stem)}
                    </b>
                    <small style={{ color: 'var(--text-muted)' }}>
                      {paperTitle} / {record.submittedAt ? new Date(record.submittedAt).toLocaleString() : '-'}
                    </small>
                  </div>
                  <span className={`badge ${record.isCorrect ? 'badge-success' : 'badge-danger'}`}>
                    {record.isCorrect ? '答对' : '需复习'}
                  </span>
                </div>
              );
            })}
            {!recentAttempts.length && <p style={{ color: 'var(--text-muted)', textAlign: 'center', margin: 'var(--space-4) 0' }}>还没有练习记录。</p>}
          </div>
        </div>
      </div>
    </div>
  );
}

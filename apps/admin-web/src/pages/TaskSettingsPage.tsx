import { useEffect, useState } from 'react';
import { listPapers } from '../api/papers';
import { getEntertainmentSession, getTaskSettings, resetEntertainmentUsage, saveTaskSettings, type EntertainmentSessionState } from '../api/student';
import { ENTERTAINMENT_GAME_KEYS, ENTERTAINMENT_MAX_LIMIT_SECONDS, normalizeEntertainmentLimitSeconds, readTaskPlanSettings, saveTaskPlanSettings, type TaskPlanSettings } from '../utils/taskPlan';
import { useSelectedStudentId } from '../utils/useSelectedStudent';

type Props = {
  onBack: () => void;
  onOpenTaskCenter: () => void;
};

const ENTERTAINMENT_GAME_LABELS: Record<string, string> = {
  '2048': '2048',
  '24': '24 点',
  sudoku: '数独',
  gomoku: '五子棋',
  memory: '记忆翻牌',
};

function formatMinutes(seconds?: number) {
  const safe = Math.max(0, Math.floor(Number(seconds || 0)));
  const minutes = Math.floor(safe / 60);
  const rest = safe % 60;
  return rest ? `${minutes}分${rest}秒` : `${minutes}分钟`;
}

export function TaskSettingsPage({ onBack, onOpenTaskCenter }: Props) {
  const selectedStudentId = useSelectedStudentId();
  const [papers, setPapers] = useState<any[]>([]);
  const [settings, setSettings] = useState<TaskPlanSettings>(() => readTaskPlanSettings());
  const [entertainmentSession, setEntertainmentSession] = useState<EntertainmentSessionState | null>(null);
  const [message, setMessage] = useState('');
  const [loading, setLoading] = useState(false);

  const refresh = async () => {
    try {
      setLoading(true);
      const [data, remoteSettings, remoteEntertainmentSession] = await Promise.all([
        listPapers(),
        getTaskSettings().catch(() => null),
        getEntertainmentSession().catch(() => null),
      ]);
      setPapers(data);
      if (remoteSettings) {
        const next = { ...readTaskPlanSettings(), ...remoteSettings, paperIds: Array.isArray(remoteSettings.paperIds) ? remoteSettings.paperIds.map(String) : [] };
        localStorage.setItem('kidsQuiz.taskPlanSettings', JSON.stringify(next));
        setSettings(next);
      }
      if (remoteEntertainmentSession) setEntertainmentSession(remoteEntertainmentSession);
      setMessage(`已加载 ${data.length} 套试卷`);
    } catch (error) {
      setMessage(`加载失败：${error instanceof Error ? error.message : String(error)}`);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { void refresh(); }, [selectedStudentId]);

  const selected = settings.paperIds.length ? settings.paperIds : papers.map((paper) => String(paper.id));

  const togglePaper = (paperId: string) => {
    const base = settings.paperIds.length ? settings.paperIds : papers.map((paper) => String(paper.id));
    const next = base.includes(paperId) ? base.filter((id) => id !== paperId) : [...base, paperId];
    setSettings((prev) => ({ ...prev, paperIds: next }));
  };

  const movePaper = (paperId: string, offset: -1 | 1) => {
    const base = settings.paperIds.length ? settings.paperIds : papers.map((paper) => String(paper.id));
    const index = base.indexOf(paperId);
    const target = index + offset;
    if (index < 0 || target < 0 || target >= base.length) return;
    const next = [...base];
    [next[index], next[target]] = [next[target], next[index]];
    setSettings((prev) => ({ ...prev, paperIds: next }));
  };

  const save = async () => {
    const allowedGames = settings.entertainmentAllowedGames
      .map(String)
      .filter((key) => (ENTERTAINMENT_GAME_KEYS as readonly string[]).includes(key));
    const normalized = {
      ...settings,
      targetAccuracy: Math.min(100, Math.max(50, Number(settings.targetAccuracy || 90))),
      dailyLimit: Math.min(20, Math.max(1, Number(settings.dailyLimit || 5))),
      entertainmentEnabled: Boolean(settings.entertainmentEnabled),
      entertainmentDailyLimitSeconds: normalizeEntertainmentLimitSeconds(settings.entertainmentDailyLimitSeconds),
      entertainmentAllowedGames: allowedGames.length ? allowedGames : [...ENTERTAINMENT_GAME_KEYS],
    };
    try {
      setLoading(true);
      await saveTaskSettings(normalized);
      saveTaskPlanSettings(normalized);
      setSettings(normalized);
      setMessage('已保存当前学生的今日任务规则');
    } catch (error) {
      setMessage(`保存失败：${error instanceof Error ? error.message : String(error)}`);
    } finally {
      setLoading(false);
    }
  };

  const selectAll = () => {
    setSettings((prev) => ({ ...prev, paperIds: papers.map((paper) => String(paper.id)) }));
  };

  const clearSelection = () => {
    setSettings((prev) => ({ ...prev, paperIds: [] }));
    setMessage('已恢复为默认：所有试卷参与自动安排');
  };

  const resetEntertainment = async () => {
    try {
      setLoading(true);
      const session = await resetEntertainmentUsage();
      setEntertainmentSession(session);
      setMessage('已重置当前学生今天的娱乐时间');
    } catch (error) {
      setMessage(`重置失败：${error instanceof Error ? error.message : String(error)}`);
    } finally {
      setLoading(false);
    }
  };

  const toggleEntertainmentGame = (gameKey: string) => {
    setSettings((prev) => {
      const current = prev.entertainmentAllowedGames.length ? prev.entertainmentAllowedGames : [...ENTERTAINMENT_GAME_KEYS];
      const next = current.includes(gameKey) ? current.filter((key) => key !== gameKey) : [...current, gameKey];
      return { ...prev, entertainmentAllowedGames: next };
    });
  };

  const orderedPapers = selected
    .map((id) => papers.find((paper) => String(paper.id) === id))
    .filter(Boolean)
    .concat(papers.filter((paper) => !selected.includes(String(paper.id))));

  return (
    <div className="task-settings-page animate-fadeIn">
      {/* 头部区域 */}
      <header className="page-header" style={{ marginBottom: 'var(--space-5)' }}>
        <div className="page-header-left">
          <h1 className="page-title">任务设置</h1>
          <p className="page-subtitle">设置孩子每天的练习规则、目标正确率和错题优先逻辑，让学习更有规划。</p>
        </div>
        <div className="page-actions" style={{ gap: 'var(--space-2)' }}>
          <button className="btn btn-secondary btn-sm" onClick={onBack}>返回仪表盘</button>
          <button className="btn btn-soft btn-sm" onClick={onOpenTaskCenter}>预览今日任务</button>
          <button className="btn btn-ghost btn-sm" onClick={refresh} disabled={loading}>
            {loading ? '同步中...' : '刷新试卷'}
          </button>
          <button className="btn btn-primary btn-sm" onClick={save}>保存设置</button>
        </div>
      </header>

      {/* 消息提示 */}
      {message && <div className="message-banner success" style={{ marginBottom: 'var(--space-4)' }}>{message}</div>}

      {/* 规则设置卡片 */}
      <div className="card animate-fadeInUp stagger-1" style={{ marginBottom: 'var(--space-5)', padding: 'var(--space-5)' }}>
        <h3 style={{ fontSize: 'var(--text-lg)', fontWeight: 800, margin: '0 0 var(--space-4)', color: 'var(--text-primary)', borderBottom: '1px solid var(--border-light)', paddingBottom: 'var(--space-2)' }}>
          ⚙️ 每日任务编排规则
        </h3>
        <div style={{ display: 'grid', gridTemplateColumns: '1.2fr 0.9fr 0.9fr', gap: 'var(--space-4)' }}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
            <span style={{ fontSize: 'var(--text-sm)', fontWeight: 700, color: 'var(--text-secondary)' }}>错题复习优先规则</span>
            <select 
              style={{ padding: 'var(--space-2) var(--space-3)', borderRadius: 'var(--radius-md)', border: '1px solid var(--border-default)', fontSize: 'var(--text-sm)', background: 'var(--bg-card)', width: '100%', outline: 'none' }}
              value={settings.requireWrongFirst ? 'yes' : 'no'} 
              onChange={(event) => setSettings((prev) => ({ ...prev, requireWrongFirst: event.target.value === 'yes' }))}
            >
              <option value="yes">优先策略：有错题时强制先做错题重练</option>
              <option value="no">普通策略：错题与普通练习混合放入队列</option>
            </select>
          </div>
          
          <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
            <span style={{ fontSize: 'var(--text-sm)', fontWeight: 700, color: 'var(--text-secondary)' }}>达标正确率 (%)</span>
            <div style={{ position: 'relative', display: 'flex', alignItems: 'center' }}>
              <input 
                type="number" 
                min={50} 
                max={100} 
                style={{ padding: 'var(--space-2) var(--space-3)', borderRadius: 'var(--radius-md)', border: '1px solid var(--border-default)', fontSize: 'var(--text-sm)', width: '100%', outline: 'none' }}
                value={settings.targetAccuracy} 
                onChange={(event) => setSettings((prev) => ({ ...prev, targetAccuracy: Number(event.target.value) }))} 
              />
              <span style={{ position: 'absolute', right: '12px', color: 'var(--text-muted)', fontSize: 'var(--text-xs)', fontWeight: 700 }}>%</span>
            </div>
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
            <span style={{ fontSize: 'var(--text-sm)', fontWeight: 700, color: 'var(--text-secondary)' }}>每日最多显示任务数</span>
            <div style={{ position: 'relative', display: 'flex', alignItems: 'center' }}>
              <input 
                type="number" 
                min={1} 
                max={20} 
                style={{ padding: 'var(--space-2) var(--space-3)', borderRadius: 'var(--radius-md)', border: '1px solid var(--border-default)', fontSize: 'var(--text-sm)', width: '100%', outline: 'none' }}
                value={settings.dailyLimit} 
                onChange={(event) => setSettings((prev) => ({ ...prev, dailyLimit: Number(event.target.value) }))} 
              />
              <span style={{ position: 'absolute', right: '12px', color: 'var(--text-muted)', fontSize: 'var(--text-xs)', fontWeight: 700 }}>项</span>
            </div>
          </div>
        </div>
      </div>

      <div className="card animate-fadeInUp stagger-2" style={{ marginBottom: 'var(--space-5)', padding: 'var(--space-5)' }}>
        <h3 style={{ fontSize: 'var(--text-lg)', fontWeight: 800, margin: '0 0 var(--space-4)', color: 'var(--text-primary)', borderBottom: '1px solid var(--border-light)', paddingBottom: 'var(--space-2)' }}>
          娱乐中心规则
        </h3>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 'var(--space-4)', marginBottom: 'var(--space-4)' }}>
          <label style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 'var(--space-3)', padding: 'var(--space-3)', border: '1px solid var(--border-light)', borderRadius: 'var(--radius-lg)', background: 'var(--bg-muted)' }}>
            <span style={{ fontSize: 'var(--text-sm)', fontWeight: 800, color: 'var(--text-primary)' }}>允许娱乐中心</span>
            <input
              type="checkbox"
              checked={settings.entertainmentEnabled}
              onChange={(event) => setSettings((prev) => ({ ...prev, entertainmentEnabled: event.target.checked }))}
              style={{ width: 20, height: 20, accentColor: 'var(--color-primary)' }}
            />
          </label>
          <label style={{ display: 'grid', gap: 6 }}>
            <span style={{ fontSize: 'var(--text-sm)', fontWeight: 700, color: 'var(--text-secondary)' }}>每日可玩时长</span>
            <div style={{ position: 'relative', display: 'flex', alignItems: 'center' }}>
              <input
                type="number"
                min={1}
                max={ENTERTAINMENT_MAX_LIMIT_SECONDS / 60}
                value={Math.round(Number(settings.entertainmentDailyLimitSeconds || 1800) / 60)}
                onChange={(event) => setSettings((prev) => ({ ...prev, entertainmentDailyLimitSeconds: normalizeEntertainmentLimitSeconds(Number(event.target.value || 30) * 60) }))}
                style={{ padding: 'var(--space-2) var(--space-3)', borderRadius: 'var(--radius-md)', border: '1px solid var(--border-default)', fontSize: 'var(--text-sm)', width: '100%', outline: 'none' }}
              />
              <span style={{ position: 'absolute', right: 12, color: 'var(--text-muted)', fontSize: 'var(--text-xs)', fontWeight: 700 }}>分钟</span>
            </div>
          </label>
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(5, minmax(0, 1fr))', gap: 'var(--space-2)' }}>
          {ENTERTAINMENT_GAME_KEYS.map((gameKey) => {
            const selectedGame = (settings.entertainmentAllowedGames.length ? settings.entertainmentAllowedGames : [...ENTERTAINMENT_GAME_KEYS]).includes(gameKey);
            return (
              <button
                key={gameKey}
                className={selectedGame ? 'btn btn-soft btn-sm' : 'btn btn-outline btn-sm'}
                onClick={() => toggleEntertainmentGame(gameKey)}
                type="button"
              >
                {ENTERTAINMENT_GAME_LABELS[gameKey]}
              </button>
            );
          })}
        </div>
        {entertainmentSession && <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, minmax(0, 1fr)) auto', gap: 'var(--space-3)', alignItems: 'center', marginTop: 'var(--space-4)', paddingTop: 'var(--space-4)', borderTop: '1px solid var(--border-light)' }}>
          <div className="stat-card" style={{ minHeight: 0, padding: 'var(--space-3)' }}><span className="stat-label">今日已用</span><span className="stat-value" style={{ fontSize: 'var(--text-xl)' }}>{formatMinutes(entertainmentSession.usedSeconds)}</span></div>
          <div className="stat-card" style={{ minHeight: 0, padding: 'var(--space-3)' }}><span className="stat-label">今日剩余</span><span className="stat-value accent" style={{ fontSize: 'var(--text-xl)' }}>{formatMinutes(entertainmentSession.remainingSeconds)}</span></div>
          <div className="stat-card" style={{ minHeight: 0, padding: 'var(--space-3)' }}><span className="stat-label">当前状态</span><span className="stat-value" style={{ fontSize: 'var(--text-xl)' }}>{entertainmentSession.locked ? '锁定' : '可玩'}</span></div>
          <button className="btn btn-outline btn-sm" onClick={resetEntertainment} disabled={loading}>重置今日时间</button>
        </div>}
      </div>

      {/* 试卷列表安排 */}
      <div className="card animate-fadeInUp stagger-3" style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-3)', padding: 'var(--space-5)' }}>
        <div className="card-header" style={{ paddingBottom: 'var(--space-2)', borderBottom: '1px solid var(--border-light)', marginBottom: 'var(--space-3)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <div>
            <h3 className="card-title" style={{ fontSize: 'var(--text-lg)', fontWeight: 800, color: 'var(--text-primary)' }}>📝 参与今日任务自动轮转的试卷</h3>
            <p style={{ margin: '4px 0 0', fontSize: 'var(--text-xs)', color: 'var(--text-muted)', fontWeight: 500 }}>只有勾选的试卷才会进入孩子的每日任务池，调整或上/下移可改变轮转的默认先后顺序。</p>
          </div>
          <div style={{ display: 'flex', gap: 'var(--space-2)' }}>
            <button className="btn btn-soft btn-sm" onClick={selectAll}>全选所有</button>
            <button className="btn btn-outline btn-sm" onClick={clearSelection}>恢复默认全部</button>
          </div>
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-2)' }}>
          {orderedPapers.map((paper: any) => {
            const id = String(paper.id);
            const checked = selected.includes(id);
            return (
              <div 
                key={id} 
                style={{ 
                  display: 'flex', 
                  alignItems: 'center', 
                  justifyContent: 'space-between', 
                  padding: 'var(--space-3) var(--space-4)', 
                  background: checked ? 'var(--blue-50)' : 'var(--bg-muted)', 
                  borderRadius: 'var(--radius-lg)',
                  borderLeft: checked ? '4px solid var(--color-primary)' : '4px solid transparent',
                  opacity: checked ? 1 : 0.65,
                  transition: 'all var(--transition-normal)'
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-3)', flex: 1 }}>
                  <input 
                    type="checkbox" 
                    style={{ width: '18px', height: '18px', borderRadius: 'var(--radius-sm)', cursor: 'pointer', accentColor: 'var(--color-primary)' }}
                    checked={checked} 
                    onChange={() => togglePaper(id)} 
                  />
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '2px' }}>
                    <b style={{ fontSize: 'var(--text-base)', color: checked ? 'var(--color-primary)' : 'var(--text-primary)' }}>{paper.title}</b>
                    <small style={{ color: 'var(--text-secondary)', fontSize: 'var(--text-xs)' }}>{paper.description || '暂无说明'}</small>
                  </div>
                </div>
                
                <div className="table-actions" style={{ gap: '4px' }}>
                  <button 
                    className="btn btn-ghost btn-sm" 
                    style={{ padding: '4px 8px', fontSize: 'var(--text-xs)', fontWeight: 800 }}
                    onClick={() => movePaper(id, -1)} 
                    disabled={!checked}
                  >
                    ▲ 上移
                  </button>
                  <button 
                    className="btn btn-ghost btn-sm" 
                    style={{ padding: '4px 8px', fontSize: 'var(--text-xs)', fontWeight: 800 }}
                    onClick={() => movePaper(id, 1)} 
                    disabled={!checked}
                  >
                    ▼ 下移
                  </button>
                </div>
              </div>
            );
          })}
          {!papers.length && (
            <div className="empty-state" style={{ padding: 'var(--space-8) 0' }}>
              <span className="empty-state-icon">📄</span>
              <p className="empty-state-title">未发现任何可用试卷</p>
              <p className="empty-state-desc">请先前往“试卷管理”新建试卷，以便在此进行每日学习任务的编排。</p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

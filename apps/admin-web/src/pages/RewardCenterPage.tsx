import { useEffect, useMemo, useRef, useState } from 'react';
import { useLocation } from 'react-router-dom';
import { confirmRewardRedemption, getChildRewards, getRewards, requestRewardRedemption, saveRewardCatalog, type RewardCatalogItem, type RewardRedemption } from '../api/student';
import { badgeLabels, readRewardState, type RewardState } from '../utils/rewards';
import { useSelectedStudentId } from '../utils/useSelectedStudent';

type Props = {
  onBack: () => void;
  onTaskCenter: () => void;
};

const allBadges = Object.entries(badgeLabels);

function redemptionStatusText(status: RewardRedemption['status']) {
  if (status === 'PENDING') return '待审批';
  if (status === 'APPROVED') return '已批准';
  return '已拒绝';
}

function csvCell(value: unknown) {
  const text = String(value ?? '');
  return `"${text.replace(/"/g, '""')}"`;
}

function downloadCsv(filename: string, rows: string[][]) {
  const csv = rows.map((row) => row.map(csvCell).join(',')).join('\r\n');
  const blob = new Blob([`\uFEFF${csv}`], { type: 'text/csv;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

export function RewardCenterPage({ onBack, onTaskCenter }: Props) {
  const location = useLocation();
  const isKidRoute = location.pathname.startsWith('/kid');
  const selectedStudentId = useSelectedStudentId();
  const [reward, setReward] = useState<RewardState>(() => readRewardState());
  const [message, setMessage] = useState('');
  const [saving, setSaving] = useState(false);
  const [catalogDraft, setCatalogDraft] = useState({ title: '', cost: '20', description: '' });
  const [redemptionStatusFilter, setRedemptionStatusFilter] = useState<'ALL' | RewardRedemption['status']>('ALL');
  const [redemptionKeyword, setRedemptionKeyword] = useState('');
  const refreshSeqRef = useRef(0);

  const refresh = () => {
    const seq = refreshSeqRef.current + 1;
    refreshSeqRef.current = seq;
    setReward(readRewardState());
    setMessage('');
    void (isKidRoute ? getChildRewards() : getRewards()).then((data) => {
      if (seq !== refreshSeqRef.current) return;
      const next = {
        stars: Number(data.stars || 0),
        streakDays: Number(data.streakDays || 0),
        lastPracticeDate: data.lastPracticeDate,
        badges: Array.isArray(data.badges) ? data.badges : [],
        catalog: Array.isArray(data.catalog) ? data.catalog : [],
        redemptions: Array.isArray(data.redemptions) ? data.redemptions : [],
      };
      localStorage.setItem('kidsQuiz.rewardState', JSON.stringify(next));
      setReward(next);
    }).catch((error) => {
      if (seq === refreshSeqRef.current) setMessage(`刷新奖励失败：${error instanceof Error ? error.message : String(error)}`);
    });
  };
  useEffect(() => { refresh(); }, [selectedStudentId, isKidRoute]);

  const nextStarTarget = reward.stars >= 100 ? 200 : 100;
  const starPercent = Math.min(100, Math.round((reward.stars / nextStarTarget) * 100));
  const catalog = reward.catalog ?? [];
  const redemptions = reward.redemptions ?? [];
  const filteredRedemptions = useMemo(() => {
    const keyword = redemptionKeyword.trim().toLowerCase();
    return redemptions.filter((item) => {
      const matchStatus = redemptionStatusFilter === 'ALL' || item.status === redemptionStatusFilter;
      const haystack = [item.id, item.rewardId, item.title, item.status].join(' ').toLowerCase();
      return matchStatus && (!keyword || haystack.includes(keyword));
    });
  }, [redemptionKeyword, redemptionStatusFilter, redemptions]);
  const redemptionSummary = useMemo(() => {
    return redemptions.reduce((acc, item) => {
      acc.total += 1;
      acc.stars += Number(item.cost || 0);
      if (item.status === 'PENDING') acc.pending += 1;
      if (item.status === 'APPROVED') {
        acc.approved += 1;
        acc.approvedStars += Number(item.cost || 0);
      }
      if (item.status === 'REJECTED') acc.rejected += 1;
      return acc;
    }, { total: 0, pending: 0, approved: 0, rejected: 0, stars: 0, approvedStars: 0 });
  }, [redemptions]);

  const applyRewardData = (data: any) => {
    const next = {
      stars: Number(data.stars || 0),
      streakDays: Number(data.streakDays || 0),
      lastPracticeDate: data.lastPracticeDate,
      badges: Array.isArray(data.badges) ? data.badges : [],
      catalog: Array.isArray(data.catalog) ? data.catalog : [],
      redemptions: Array.isArray(data.redemptions) ? data.redemptions : [],
    };
    localStorage.setItem('kidsQuiz.rewardState', JSON.stringify(next));
    setReward(next);
  };

  const redeem = async (item: RewardCatalogItem) => {
    if (!isKidRoute) return;
    setSaving(true);
    try {
      applyRewardData(await requestRewardRedemption(item.id));
      setMessage(`已提交兑换申请：${item.title}`);
    } catch (error) {
      setMessage(`兑换失败：${error instanceof Error ? error.message : String(error)}`);
    } finally {
      setSaving(false);
    }
  };

  const confirm = async (id: string, status: 'APPROVED' | 'REJECTED') => {
    setSaving(true);
    try {
      applyRewardData(await confirmRewardRedemption(id, status));
      setMessage(status === 'APPROVED' ? '兑换已批准，星星已扣除' : '兑换已拒绝');
    } catch (error) {
      setMessage(`处理失败：${error instanceof Error ? error.message : String(error)}`);
    } finally {
      setSaving(false);
    }
  };

  const saveCatalog = async (nextCatalog: RewardCatalogItem[]) => {
    setSaving(true);
    try {
      applyRewardData(await saveRewardCatalog(nextCatalog));
      setMessage('奖励目录已更新');
    } catch (error) {
      setMessage(`保存目录失败：${error instanceof Error ? error.message : String(error)}`);
    } finally {
      setSaving(false);
    }
  };

  const addCatalogItem = () => {
    const title = catalogDraft.title.trim();
    const cost = Math.max(1, Math.floor(Number(catalogDraft.cost || 1)));
    if (!title) { setMessage('请先填写奖励名称'); return; }
    void saveCatalog([...catalog, {
      id: `custom_${Date.now()}`,
      title,
      cost,
      description: catalogDraft.description.trim(),
      enabled: true,
    }]);
    setCatalogDraft({ title: '', cost: '20', description: '' });
  };

  const exportRedemptions = () => {
    const rows = [
      ['兑换 ID', '奖励 ID', '奖励名称', '星星', '状态', '申请时间', '处理时间'],
      ...filteredRedemptions.map((item) => [
        item.id,
        item.rewardId,
        item.title,
        String(item.cost),
        redemptionStatusText(item.status),
        item.requestedAt ? new Date(item.requestedAt).toLocaleString() : '',
        item.confirmedAt ? new Date(item.confirmedAt).toLocaleString() : '',
      ]),
    ];
    downloadCsv(`reward-redemptions-${new Date().toISOString().slice(0, 10)}.csv`, rows);
    setMessage(`已导出 ${filteredRedemptions.length} 条兑换记录`);
  };

  return (
    <div className="reward-center-page animate-fadeIn">
      {/* 头部区域 */}
      <header className="page-header" style={{ marginBottom: 'var(--space-5)' }}>
        <div className="page-header-left">
          <h1 className="page-title">奖励与成就中心</h1>
          <p className="page-subtitle">回看你的每一颗星星和荣誉徽章，见证你的坚持与每一步成长！</p>
        </div>
        <div className="page-actions" style={{ gap: 'var(--space-2)' }}>
          <button className="btn btn-secondary btn-sm" onClick={onBack}>返回首页</button>
          <button className="btn btn-primary btn-sm" onClick={onTaskCenter}>去做今日任务 🚀</button>
          <button className="btn btn-ghost btn-sm" onClick={refresh}>刷新成就</button>
        </div>
      </header>

      {message && <div className="message-banner info" style={{ marginBottom: 'var(--space-4)' }}>{message}</div>}

      {/* 黄金星空成就大卡片 */}
      <div 
        className="card card-gradient animate-fadeInUp stagger-1" 
        style={{ 
          background: 'linear-gradient(135deg, var(--amber-500) 0%, var(--orange-500) 50%, var(--violet-600) 100%)', 
          boxShadow: '0 20px 50px rgba(245, 158, 11, 0.25)',
          border: 'none',
          padding: 'var(--space-6)',
          display: 'grid',
          gridTemplateColumns: '140px 1fr',
          gap: 'var(--space-5)',
          alignItems: 'center',
          textAlign: 'left',
          marginBottom: 'var(--space-6)'
        }}
      >
        <div className="reward-planet" style={{ width: '120px', height: '120px', fontSize: '64px', animation: 'starPop 0.6s var(--ease-spring)' }}>
          ⭐
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-2)' }}>
          <span className="badge badge-warning" style={{ background: 'rgba(255, 255, 255, 0.22)', color: '#fff', border: 'none', alignSelf: 'flex-start' }}>我的荣誉星空</span>
          <h2 style={{ fontSize: 'var(--text-3xl)', fontWeight: 800, color: '#fff', margin: 0 }}>
            已收集 <span style={{ fontSize: 'var(--text-4xl)', color: '#fffbeb', textShadow: '0 0 12px rgba(255,255,255,0.6)' }}>{reward.stars}</span> 颗星星
          </h2>
          <p style={{ margin: 0, opacity: 0.95, color: '#fff', fontWeight: 600, fontSize: 'var(--text-base)' }}>
            🔥 连续练习达到 <b>{reward.streakDays}</b> 天！已获得 <b>{reward.badges.length}</b> / <b>{allBadges.length}</b> 枚至尊荣誉徽章。
          </p>
          
          <div style={{ marginTop: 'var(--space-2)' }}>
            <div className="progress-bar" style={{ background: 'rgba(255, 255, 255, 0.25)', height: '12px' }}>
              <div className="progress-fill" style={{ width: `${starPercent}%`, background: '#fffbeb', boxShadow: '0 0 8px #fff' }} />
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: '6px', color: '#fff', opacity: 0.9, fontSize: 'var(--text-xs)', fontWeight: 700 }}>
              <span>距离 {nextStarTarget} 颗星目标</span>
              <span>还差 {Math.max(0, nextStarTarget - reward.stars)} 颗</span>
            </div>
          </div>
        </div>
      </div>

      <div className="reward-redemption-grid animate-fadeInUp stagger-2">
        <section className="card reward-redemption-card">
          <h2 className="card-title">星星兑换</h2>
          <div className="reward-catalog-list">
            {catalog.filter((item) => item.enabled || !isKidRoute).map((item) => {
              const disabled = saving || !item.enabled || reward.stars < item.cost;
              return <div className="reward-catalog-item" key={item.id}>
                <div>
                  <b>{item.title}</b>
                  <span>{item.description || '家长确认后完成兑换'}</span>
                </div>
                <strong>{item.cost} 星</strong>
                {isKidRoute ? <button className="btn btn-primary btn-sm" disabled={disabled} onClick={() => void redeem(item)}>
                  {reward.stars < item.cost ? '星星不足' : '申请兑换'}
                </button> : <button className="btn btn-soft btn-sm" disabled={saving} onClick={() => void saveCatalog(catalog.map((row) => row.id === item.id ? { ...row, enabled: !row.enabled } : row))}>
                  {item.enabled ? '停用' : '启用'}
                </button>}
              </div>;
            })}
            {!catalog.length && <p className="loginEmpty">还没有可兑换奖励</p>}
          </div>
        </section>

        {!isKidRoute && <section className="card reward-redemption-card">
          <h2 className="card-title">兑换审批</h2>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(110px, 1fr))', gap: 'var(--space-2)', marginBottom: 'var(--space-3)' }}>
            <div className="editor-check-card info"><b>{redemptionSummary.total}</b><span>全部申请</span></div>
            <div className="editor-check-card warning"><b>{redemptionSummary.pending}</b><span>待审批</span></div>
            <div className="editor-check-card success"><b>{redemptionSummary.approved}</b><span>已批准</span></div>
            <div className="editor-check-card info"><b>{redemptionSummary.approvedStars}</b><span>已兑现星星</span></div>
          </div>
          <div className="filter-bar" style={{ display: 'grid', gridTemplateColumns: '1fr 140px auto', gap: 'var(--space-2)', marginBottom: 'var(--space-3)' }}>
            <input placeholder="按奖励名称 / ID 搜索" value={redemptionKeyword} onChange={(event) => setRedemptionKeyword(event.target.value)} />
            <select value={redemptionStatusFilter} onChange={(event) => setRedemptionStatusFilter(event.target.value as any)}>
              <option value="ALL">全部状态</option>
              <option value="PENDING">待审批</option>
              <option value="APPROVED">已批准</option>
              <option value="REJECTED">已拒绝</option>
            </select>
            <button className="btn btn-outline btn-sm" disabled={!filteredRedemptions.length} onClick={exportRedemptions}>导出 CSV</button>
          </div>
          <div className="reward-redemption-list">
            {filteredRedemptions.map((item) => <div className={`reward-redemption-item ${item.status.toLowerCase()}`} key={item.id}>
              <div>
                <b>{item.title}</b>
                <span>{item.cost} 星 / {new Date(item.requestedAt).toLocaleString()}</span>
              </div>
              <em>{redemptionStatusText(item.status)}</em>
              {item.status === 'PENDING' && <div className="reward-redemption-actions">
                <button className="btn btn-primary btn-sm" disabled={saving} onClick={() => void confirm(item.id, 'APPROVED')}>批准</button>
                <button className="btn btn-secondary btn-sm" disabled={saving} onClick={() => void confirm(item.id, 'REJECTED')}>拒绝</button>
              </div>}
            </div>)}
            {!filteredRedemptions.length && <p className="loginEmpty">{redemptions.length ? '当前筛选下没有兑换申请' : '暂无兑换申请'}</p>}
          </div>

          <div className="reward-catalog-form">
            <input placeholder="奖励名称" value={catalogDraft.title} onChange={(event) => setCatalogDraft((draft) => ({ ...draft, title: event.target.value }))} />
            <input placeholder="星星" type="number" min="1" value={catalogDraft.cost} onChange={(event) => setCatalogDraft((draft) => ({ ...draft, cost: event.target.value }))} />
            <input placeholder="说明" value={catalogDraft.description} onChange={(event) => setCatalogDraft((draft) => ({ ...draft, description: event.target.value }))} />
            <button className="btn btn-outline btn-sm" disabled={saving} onClick={addCatalogItem}>新增奖励</button>
          </div>
        </section>}
      </div>

      {/* 徽章墙 */}
      <h2 style={{ fontSize: 'var(--text-lg)', fontWeight: 800, margin: '0 0 var(--space-4)', color: 'var(--text-primary)' }}>
        🏅 荣誉勋章陈列墙
      </h2>
      <div className="badge-grid animate-fadeInUp stagger-2" style={{ marginBottom: 'var(--space-6)' }}>
        {allBadges.map(([key, label]) => {
          const unlocked = reward.badges.includes(key);
          return (
            <div 
              className={`badge-card ${unlocked ? 'unlocked' : ''}`} 
              style={{
                background: unlocked ? 'var(--amber-50)' : 'rgba(255,255,255,0.4)',
                border: unlocked ? '1.5px solid var(--amber-200)' : '1.5px dashed var(--border-default)',
                borderRadius: 'var(--radius-xl)',
                padding: 'var(--space-5)',
                textAlign: 'center',
                opacity: unlocked ? 1 : 0.5,
                boxShadow: unlocked ? 'var(--shadow-sm)' : 'none',
                transition: 'all var(--transition-normal)',
                backdropFilter: 'blur(8px)'
              }}
              key={key}
            >
              <div 
                className="badge-icon" 
                style={{ 
                  fontSize: '44px', 
                  marginBottom: 'var(--space-2)',
                  filter: unlocked ? 'drop-shadow(0 4px 8px rgba(245,158,11,0.2))' : 'grayscale(100%)'
                }}
              >
                {unlocked ? '🏅' : '🔒'}
              </div>
              <b style={{ color: unlocked ? 'var(--amber-800)' : 'var(--text-muted)', display: 'block', fontSize: 'var(--text-base)' }}>{label}</b>
              <span 
                className={`badge ${unlocked ? 'badge-warning' : 'badge-muted'}`} 
                style={{ marginTop: 'var(--space-2)' }}
              >
                {unlocked ? '已解锁' : '待获取'}
              </span>
            </div>
          );
        })}
      </div>

      {/* 星星获取秘诀 */}
      <div className="card card-primary animate-fadeInUp stagger-3" style={{ padding: 'var(--space-5)', textAlign: 'left' }}>
        <h3 style={{ fontSize: 'var(--text-lg)', fontWeight: 800, margin: '0 0 var(--space-3)', color: 'var(--color-primary)' }}>
          💡 怎么获得更多的星星和徽章？
        </h3>
        <ul style={{ margin: 0, paddingLeft: '20px', display: 'flex', flexDirection: 'column', gap: '8px', fontSize: 'var(--text-base)', color: 'var(--text-secondary)', fontWeight: 600 }}>
          <li>完成一次<b>试卷练习</b>或<b>错题重练</b>，即可收获海量星星。</li>
          <li><b>答对的题数越多</b>，累积获得的星星就越多。</li>
          <li>单次练习正确率达到 <b>90%</b> 或 <b>100%</b>，会触发连胜暴击，收获额外惊喜星礼！</li>
          <li><b>每天坚持练习</b>是真正的强者印记，可以解锁专属的连续活跃荣誉徽章。</li>
        </ul>
      </div>
    </div>
  );
}

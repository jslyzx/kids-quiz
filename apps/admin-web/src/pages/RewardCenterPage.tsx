import { useEffect, useState } from 'react';
import { getRewards } from '../api/student';
import { badgeLabels, readRewardState, type RewardState } from '../utils/rewards';

type Props = {
  onBack: () => void;
  onTaskCenter: () => void;
};

const allBadges = Object.entries(badgeLabels);

export function RewardCenterPage({ onBack, onTaskCenter }: Props) {
  const [reward, setReward] = useState<RewardState>(() => readRewardState());

  const refresh = () => {
    setReward(readRewardState());
    void getRewards().then((data) => {
      const next = { stars: Number(data.stars || 0), streakDays: Number(data.streakDays || 0), lastPracticeDate: data.lastPracticeDate, badges: Array.isArray(data.badges) ? data.badges : [] };
      localStorage.setItem('kidsQuiz.rewardState', JSON.stringify(next));
      setReward(next);
    }).catch(() => undefined);
  };
  useEffect(() => { refresh(); }, []);

  const nextStarTarget = reward.stars >= 100 ? 200 : 100;
  const starPercent = Math.min(100, Math.round((reward.stars / nextStarTarget) * 100));

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

import { useEffect, useMemo, useRef, useState } from 'react';
import { listStudentPapers as listPapers } from '../api/papers';
import { listStudentQuestionGroups as listQuestionGroups } from '../api/questionGroups';
import { listStudentPaperStats as listPaperStats, listStudentRecentAttempts as listRecentAttempts, listStudentWrongAnswers as listWrongAnswers } from '../api/submissions';
import { getChildStudentProfile as getStudentProfile, getChildTaskSettings, saveChildStudentProfile as saveStudentProfileApi } from '../api/student';
import { readRewardState } from '../utils/rewards';

type Props = {
  onBackAdmin: () => void;
  onStartPaper: (paperId: string) => void;
  onOpenWrongBook: () => void;
  onRetryWrong: () => void;
  onOpenTaskCenter: () => void;
  onOpenReport: () => void;
  onOpenRewards: () => void;
  onOpenRecords: () => void;
  onOpenGames: () => void;
  onStartQuestionGroup: (groupId: string) => void;
  onSwitchStudent: () => void;
};

type KidTab = 'home' | 'practice' | 'wrong' | 'reward' | 'mine';

const TXT = {
  child: '\u5c0f\u670b\u53cb',
  cheer: '\uff0c\u4eca\u5929\u4e5f\u8981\u52a0\u6cb9\uff01',
  parent: '\u5bb6\u957f',
  avatar: '\u5934\u50cf',
  todayRecommend: '\u4eca\u65e5\u63a8\u8350',
  noPractice: '\u8fd8\u6ca1\u6709\u7ec3\u4e60',
  defaultDesc: '\u6bcf\u5929\u7ec3\u4e00\u70b9\uff0c\u6570\u5b66\u66f4\u8f7b\u677e\u3002',
  stars: '\u661f\u661f',
  streak: '\u8fde\u7eed\u5929\u6570',
  accuracy: '\u6b63\u786e\u7387',
  startToday: '\u5f00\u59cb\u4eca\u5929\u7ec3\u4e60',
  none: '\u6682\u65e0\u7ec3\u4e60',
  freePractice: '\u81ea\u7531\u7ec3\u4e60',
  wrongRetry: '\u9519\u9898\u91cd\u7ec3',
  myStars: '\u6211\u7684\u661f\u661f',
  records: '\u7ec3\u4e60\u8bb0\u5f55',
  sets: '\u5957',
  items: '\u9053',
  practiceCenter: '\u7ec3\u4e60\u4e2d\u5fc3',
  choosePaper: '\u9009\u62e9\u4e00\u5957\u5f00\u59cb',
  refreshing: '\u5237\u65b0\u4e2d...',
  refresh: '\u5237\u65b0',
  clickStart: '\u70b9\u51fb\u5f00\u59cb\u7ec3\u4e60',
  bigQuestions: '\u9053\u5927\u9898',
  notPracticed: '\u8fd8\u6ca1\u7ec3\u8fc7',
  noPaper: '\u8fd8\u6ca1\u6709\u8bd5\u5377\uff0c\u8bf7\u5148\u5230\u5bb6\u957f\u540e\u53f0\u521b\u5efa\u3002',
  wrongReview: '\u9519\u9898\u590d\u4e60',
  wrongRemainPrefix: '\u8fd8\u6709 ',
  wrongRemainSuffix: ' \u9053\u9519\u9898',
  wrongTip: '\u5148\u628a\u9519\u9898\u7ec3\u4f1a\uff0c\u518d\u6311\u6218\u65b0\u9898\u3002',
  startWrongRetry: '\u5f00\u59cb\u9519\u9898\u91cd\u7ec3',
  openWrongBook: '\u6253\u5f00\u9519\u9898\u672c',
  viewRecords: '\u67e5\u770b\u7ec3\u4e60\u8bb0\u5f55',
  rewardCenter: '\u67e5\u770b\u5956\u52b1\u4e2d\u5fc3',
  goTask: '\u53bb\u505a\u4eca\u65e5\u4efb\u52a1',
  continuousPractice: '\u8fde\u7eed\u7ec3\u4e60',
  days: '\u5929',
  badgesGot: '\u5df2\u7ecf\u83b7\u5f97',
  badges: '\u679a\u5fbd\u7ae0',
  myProfile: '\u6211\u7684\u8d44\u6599',
  nickname: '\u6635\u79f0',
  avatarUrl: '\u5934\u50cf URL\uff08\u53ef\u9009\uff09',
  saveProfile: '\u4fdd\u5b58\u8d44\u6599',
  totalCount: '\u7d2f\u8ba1\u9898\u6b21',
  needReview: '\u9700\u590d\u4e60',
  correct: '\u7b54\u5bf9',
  noRecords: '\u8fd8\u6ca1\u6709\u7ec3\u4e60\u8bb0\u5f55',
  noRecordsTip: '\u5b8c\u6210\u4e00\u6b21\u7ec3\u4e60\u540e\u4f1a\u663e\u793a\u5728\u8fd9\u91cc\u3002',
  report: '\u5b66\u4e60\u62a5\u544a',
  allRecords: '\u5168\u90e8\u8bb0\u5f55',
  games: '娱乐中心',
  todayPlan: '今天可以这样做',
  doRecommended: '先做推荐练习',
  clearWrong: '再清理错题',
  relaxAfterStudy: '完成后再放松',
  noWrongGreat: '没有错题，保持住',
  minutes: '分钟',
  tapToStart: '点这里开始',
  overview: '学习概览',
  practicedPapers: '已练套数',
  recentRecords: '最近记录',
  keepGoing: '继续挑战新题',
  switchStudent: '切换学生',
  home: '\u9996\u9875',
  practice: '\u7ec3\u4e60',
  wrong: '\u9519\u9898',
  reward: '\u5956\u52b1',
  mine: '\u6211\u7684',
};

function todayText() {
  return new Date().toLocaleDateString('zh-CN', { month: 'long', day: 'numeric', weekday: 'long' });
}

function shortDate(value?: string) {
  if (!value) return '-';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '-';
  return date.toLocaleDateString('zh-CN', { month: 'numeric', day: 'numeric' });
}

function groupTags(group: any) {
  return Array.isArray(group.tags) ? group.tags.filter(Boolean).map(String) : [];
}

function inferSubject(group: any) {
  const legacySubject = group?.content?.legacy?.oldSubject;
  if (legacySubject === 'math') return '\u6570\u5b66';
  if (legacySubject === 'chinese') return '\u8bed\u6587';
  if (legacySubject === 'english') return '\u82f1\u8bed';
  const text = `${group.title || ''}\u3001${groupTags(group).join('\u3001')}`;
  if (text.includes('\u8bed\u6587') || text.includes('\u53e4\u8bd7')) return '\u8bed\u6587';
  if (text.includes('\u82f1\u8bed') || /there|english/i.test(text)) return '\u82f1\u8bed';
  if (text.includes('\u6570\u5b66') || text.includes('\u53e3\u7b97') || text.includes('\u4e58\u6cd5') || text.includes('\u6570\u611f')) return '\u6570\u5b66';
  return '\u5176\u4ed6';
}

function groupSearchText(group: any) {
  return `${group.title || ''}\u3001${group.commonStem || ''}\u3001${groupTags(group).join('\u3001')}`;
}

/** 推断题组的题型图标和名称，用于孩子端卡片直观展示 */
function inferQuestionType(group: any): { icon: string; label: string } {
  const tags = groupTags(group);
  const tagText = tags.join('/');
  const title = String(group.title || '');
  // 按标签/标题优先匹配具体题型
  if (tagText.includes('连词成句') || title.includes('连词成句')) return { icon: '🔤', label: '连词成句' };
  if (tagText.includes('古诗')) return { icon: '📜', label: '古诗' };
  if (tagText.includes('连线')) return { icon: '🔗', label: '连线题' };
  if (tagText.includes('排序')) return { icon: '🔢', label: '排序题' };
  if (tagText.includes('选择')) return { icon: '☑️', label: '选择题' };
  if (tagText.includes('填空')) return { icon: '✏️', label: '填空题' };
  // 按 groupType 兜底
  switch (group.groupType) {
    case 'MENTAL_MATH': return { icon: '⚡', label: '口算' };
    case 'COMPOSITE': return { icon: '📚', label: '复合题' };
    default: return { icon: '📝', label: '练习题' };
  }
}

export function KidHomePage({ onBackAdmin, onStartPaper, onStartQuestionGroup, onOpenWrongBook, onRetryWrong, onOpenTaskCenter, onOpenReport, onOpenRewards, onOpenRecords, onOpenGames, onSwitchStudent }: Props) {
  const [activeTab, setActiveTab] = useState<KidTab>('home');
  const [papers, setPapers] = useState<any[]>([]);
  const [questionGroups, setQuestionGroups] = useState<any[]>([]);
  const [practiceMode, setPracticeMode] = useState<'paper' | 'question'>('paper');
  const [subjectFilter, setSubjectFilter] = useState('ALL');
  const [gradeFilter, setGradeFilter] = useState('');
  const [typeFilter, setTypeFilter] = useState('ALL');
  const [tagFilter, setTagFilter] = useState('');
  const [statsMap, setStatsMap] = useState<Record<string, any>>({});
  const [wrongAnswers, setWrongAnswers] = useState<any[]>([]);
  const [recentAttempts, setRecentAttempts] = useState<any[]>([]);
  const [studentName, setStudentName] = useState(() => localStorage.getItem('kidsQuiz.studentName') || TXT.child);
  const [avatarUrl, setAvatarUrl] = useState(() => localStorage.getItem('kidsQuiz.avatarUrl') || '');
  const [rewardState, setRewardState] = useState(() => readRewardState());
  const [entertainmentSettings, setEntertainmentSettings] = useState({ enabled: true, dailyLimitSeconds: 1800 });
  const [loading, setLoading] = useState(false);
  const [homeMessage, setHomeMessage] = useState('');
  const refreshSeqRef = useRef(0);

  const refresh = async () => {
    const seq = refreshSeqRef.current + 1;
    refreshSeqRef.current = seq;
    try {
      setLoading(true);
      setHomeMessage('');
      const [paperData, groupData, statData, wrongData, recentData, taskSettings, profile] = await Promise.all([
        listPapers(),
        listQuestionGroups(),
        listPaperStats(),
        listWrongAnswers(),
        listRecentAttempts(),
        getChildTaskSettings().catch(() => null),
        getStudentProfile().catch(() => null),
      ]);
      if (seq !== refreshSeqRef.current) return;
      setPapers(paperData);
      setQuestionGroups(groupData);
      setStatsMap(Object.fromEntries(statData.map((item) => [String(item.paperId), item])));
      setWrongAnswers(wrongData);
      setRecentAttempts(recentData);
      setRewardState(readRewardState());
      if (taskSettings) {
        setEntertainmentSettings({
          enabled: taskSettings.entertainmentEnabled !== false,
          dailyLimitSeconds: Math.max(60, Number(taskSettings.entertainmentDailyLimitSeconds || 1800)),
        });
      }
      if (profile) {
        if (profile?.name) setStudentName(profile.name);
        if (profile?.avatarUrl !== undefined) setAvatarUrl(profile.avatarUrl || '');
      }
    } catch (error) {
      if (seq === refreshSeqRef.current) setHomeMessage(`刷新失败：${error instanceof Error ? error.message : String(error)}`);
    } finally {
      if (seq === refreshSeqRef.current) setLoading(false);
    }
  };

  useEffect(() => { void refresh(); }, []);

  useEffect(() => {
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }, [activeTab]);

  const saveProfile = () => {
    const nextName = studentName.trim() || TXT.child;
    const nextAvatar = avatarUrl.trim();
    setStudentName(nextName);
    setAvatarUrl(nextAvatar);
    localStorage.setItem('kidsQuiz.studentName', nextName);
    localStorage.setItem('kidsQuiz.avatarUrl', nextAvatar);
    setHomeMessage('资料保存中...');
    void saveStudentProfileApi({ name: nextName, avatarUrl: nextAvatar })
      .then(() => setHomeMessage('资料已保存'))
      .catch((error) => setHomeMessage(`资料已保存到本机，但同步到服务器失败：${error instanceof Error ? error.message : String(error)}`));
  };

  const recommended = papers[0];
  const entertainmentMinutes = Math.max(1, Math.round(entertainmentSettings.dailyLimitSeconds / 60));
  const totalStats = useMemo(() => {
    const list = Object.values(statsMap);
    const total = list.reduce((sum, item: any) => sum + Number(item.total || 0), 0);
    const correct = list.reduce((sum, item: any) => sum + Number(item.correct || 0), 0);
    return { total, correct, accuracy: total ? Math.round((correct / total) * 100) : 0 };
  }, [statsMap]);
  const practicedPaperCount = useMemo(() => Object.values(statsMap).filter((item: any) => Number(item.total || 0) > 0).length, [statsMap]);


  const typeLabels: Record<string, string> = {
    CALCULATION: '\u53e3\u7b97\u9898\u7ec4',
    COMPOSITE: '\u590d\u5408\u9898',
    SINGLE: '\u5355\u9898',
    PRACTICE_SET: '\u5355\u9898',
  };

  const filteredQuestionGroups = useMemo(() => questionGroups.filter((group) => {
    const matchSubject = subjectFilter === 'ALL' || inferSubject(group) === subjectFilter;
    const matchGrade = !gradeFilter || String(group.gradeLevel || '').includes(gradeFilter);
    const matchType = typeFilter === 'ALL' || group.groupType === typeFilter || (typeFilter === 'SINGLE' && group.groupType === 'PRACTICE_SET');
    const matchTag = !tagFilter || groupSearchText(group).toLowerCase().includes(tagFilter.toLowerCase());
    return matchSubject && matchGrade && matchType && matchTag;
  }), [questionGroups, subjectFilter, gradeFilter, typeFilter, tagFilter]);

  const gradeOptions = Array.from(new Set(questionGroups.map((group) => String(group.gradeLevel || '')).filter(Boolean)));
  const subjectCounts = useMemo(() => questionGroups.reduce((acc, group) => {
    const subject = inferSubject(group);
    acc[subject] = (acc[subject] || 0) + 1;
    return acc;
  }, {} as Record<string, number>), [questionGroups]);
  const questionTypeCounts = useMemo(() => ({
    ALL: questionGroups.length,
    CALCULATION: questionGroups.filter((group) => group.groupType === 'CALCULATION').length,
    COMPOSITE: questionGroups.filter((group) => group.groupType === 'COMPOSITE').length,
    SINGLE: questionGroups.filter((group) => group.groupType === 'SINGLE' || group.groupType === 'PRACTICE_SET').length,
  }), [questionGroups]);
  const keywordCount = (keyword: string) => questionGroups.filter((group) => groupSearchText(group).includes(keyword)).length;

  const startQuestionGroup = (groupId: string) => {
    const ids = filteredQuestionGroups.map((group) => String(group.id));
    const current = filteredQuestionGroups.find((group) => String(group.id) === groupId);
    localStorage.setItem('kidsQuiz.questionPracticeContext', JSON.stringify({
      ids,
      currentId: groupId,
      subject: subjectFilter === 'ALL' ? inferSubject(current) : subjectFilter,
      grade: gradeFilter || current?.gradeLevel || '',
      type: current?.groupType || typeFilter,
      keyword: tagFilter,
      savedAt: Date.now(),
    }));
    onStartQuestionGroup(groupId);
  };

  const renderPaperCard = (paper: any) => {
    const stat = statsMap[String(paper.id)];
    return <button className="kid-practice-card animate-fadeInUp" key={paper.id} onClick={() => onStartPaper(String(paper.id))}>
      <span className="kid-practice-card-top">
        <b>{paper.title}</b>
        <em>{TXT.tapToStart}</em>
      </span>
      <small>{paper.description || TXT.clickStart}</small>
      <span>{paper.itemCount ?? paper.items?.length ?? 0} {TXT.bigQuestions} {'\u00b7'} {stat ? `${TXT.accuracy} ${stat.accuracy}%` : TXT.notPracticed}</span>
    </button>;
  };

  return <div className="kid-layout">
    <header className="kid-header">
      <div className="kid-identity">
        <div className="kid-avatar">{avatarUrl ? <img src={avatarUrl} alt={TXT.avatar} /> : <span>{'\u{1F60A}'}</span>}</div>
        <div>
          <p className="kid-greeting">{todayText()}</p>
          <h1 className="kid-name">{activeTab === 'home' ? `${studentName.trim() || TXT.child}${TXT.cheer}` : ({ practice: TXT.practice, wrong: TXT.wrong, reward: TXT.reward, mine: TXT.mine } as Record<string, string>)[activeTab]}</h1>
        </div>
      </div>
      <button className="kid-parent-btn" onClick={onBackAdmin}>{TXT.parent}</button>
    </header>

    <main className="kid-content">
      {homeMessage && <div className="message-banner info kid-message">{homeMessage}</div>}
      {activeTab === 'home' && <div className="kid-home-grid">
        <section className="kid-hero-card animate-fadeInUp">
          <span className="kid-hero-tag">{TXT.todayRecommend}</span>
          <h2 className="kid-hero-title">{recommended ? recommended.title : TXT.noPractice}</h2>
          <p className="kid-hero-desc">{recommended?.description || TXT.defaultDesc}</p>
          <div className="kid-hero-stats">
            <div className="kid-hero-stat"><b>{rewardState.stars}</b><small>{TXT.stars}</small></div>
            <div className="kid-hero-stat"><b>{rewardState.streakDays}</b><small>{TXT.streak}</small></div>
            <div className="kid-hero-stat"><b>{totalStats.total ? `${totalStats.accuracy}%` : '-'}</b><small>{TXT.accuracy}</small></div>
          </div>
          {recommended ? <button className="kid-hero-action" onClick={() => onStartPaper(String(recommended.id))}>{TXT.startToday}</button> : <button className="kid-hero-action" disabled>{TXT.none}</button>}
        </section>
        <div className="kid-quick-grid">
          <button className="kid-quick-btn animate-fadeInUp stagger-1" onClick={() => setActiveTab('practice')}><b>{TXT.freePractice}</b><span>{papers.length} {TXT.sets}</span></button>
          <button className="kid-quick-btn animate-fadeInUp stagger-2" onClick={() => setActiveTab('wrong')}><b>{TXT.wrongRetry}</b><span>{wrongAnswers.length} {TXT.items}</span></button>
          <button className="kid-quick-btn animate-fadeInUp stagger-3" onClick={() => setActiveTab('reward')}><b>{TXT.myStars}</b><span>{rewardState.stars} {TXT.stars}</span></button>
          {entertainmentSettings.enabled && <button className="kid-quick-btn animate-fadeInUp stagger-4" onClick={onOpenGames}><b>{TXT.games}</b><span>{entertainmentMinutes} 分钟</span></button>}
        </div>
        <section className="kid-today-plan animate-fadeInUp stagger-4">
          <div className="kid-section-header compact"><div><span className="kid-section-tag">{TXT.todayPlan}</span><h2 className="kid-section-title">一步一步来</h2></div></div>
          <div className="kid-plan-list">
            <button className="kid-plan-item primary" onClick={() => recommended ? onStartPaper(String(recommended.id)) : setActiveTab('practice')} disabled={!recommended && !papers.length}>
              <span>1</span>
              <b>{TXT.doRecommended}</b>
              <small>{recommended ? recommended.title : TXT.noPractice}</small>
            </button>
            <button className="kid-plan-item warning" onClick={() => wrongAnswers.length ? onRetryWrong() : setActiveTab('wrong')}>
              <span>2</span>
              <b>{wrongAnswers.length ? TXT.clearWrong : TXT.noWrongGreat}</b>
              <small>{wrongAnswers.length ? `${wrongAnswers.length} ${TXT.items}${TXT.wrong}` : TXT.keepGoing}</small>
            </button>
            {entertainmentSettings.enabled && <button className="kid-plan-item soft" onClick={onOpenGames}>
              <span>3</span>
              <b>{TXT.relaxAfterStudy}</b>
              <small>{entertainmentMinutes} {TXT.minutes}</small>
            </button>}
          </div>
        </section>
        <section className="kid-overview-panel animate-fadeInUp stagger-5">
          <div className="kid-section-header compact"><div><span className="kid-section-tag">{TXT.overview}</span><h2 className="kid-section-title">{TXT.recentRecords}</h2></div></div>
          <div className="kid-overview-grid">
            <button onClick={() => setActiveTab('practice')}><b>{practicedPaperCount}</b><span>{TXT.practicedPapers}</span></button>
            <button onClick={() => setActiveTab('wrong')}><b>{wrongAnswers.length}</b><span>{TXT.needReview}</span></button>
            <button onClick={() => setActiveTab('mine')}><b>{recentAttempts.length}</b><span>{TXT.records}</span></button>
          </div>
        </section>
      </div>}

      {activeTab === 'practice' && <section className="kid-panel">
        <div className="kid-section-header"><div><span className="kid-section-tag">{TXT.practiceCenter}</span><h2 className="kid-section-title">{practiceMode === 'paper' ? TXT.choosePaper : '\u6309\u9898\u76ee\u7ec3\u4e60'}</h2></div><button className="btn btn-soft btn-sm" onClick={refresh}>{loading ? TXT.refreshing : TXT.refresh}</button></div>
        <div className="practiceModeTabsV2">
          <button className={practiceMode === 'paper' ? 'active' : ''} onClick={() => setPracticeMode('paper')}>{'\u8bd5\u5377\u7ec3\u4e60'}</button>
          <button className={practiceMode === 'question' ? 'active' : ''} onClick={() => setPracticeMode('question')}>{'\u9898\u76ee\u7ec3\u4e60'}</button>
        </div>
        {practiceMode === 'paper' ? <div className="card-grid card-grid-auto">{papers.map(renderPaperCard)}{!papers.length && <div className="empty-state"><span className="empty-state-icon">📄</span><p className="empty-state-title">{TXT.noPaper}</p></div>}</div> : <>
          {/* 孩子端题目练习：精简为单行学科筛选 + 卡片列表，去掉统计卡/主题卡/题型chips/select */}
          <div className="kid-question-simple-filter">
            {([
              ['ALL', '✨', '全部'],
              ['数学', '🔢', '数学'],
              ['语文', '📖', '语文'],
              ['英语', '🎧', '英语'],
            ] as Array<[string, string, string]>).map(([key, icon, label]) => <button key={key} className={subjectFilter === key ? 'active' : ''} onClick={() => { setSubjectFilter(subjectFilter === key ? 'ALL' : key); setTagFilter(''); }}>
              <span aria-hidden="true">{icon}</span>{label}
            </button>)}
          </div>
          <div className="card-grid card-grid-auto kid-question-grid">
            {filteredQuestionGroups.map((group) => {
              const qType = inferQuestionType(group);
              return <button className="kid-practice-card kid-question-card" key={group.id} onClick={() => startQuestionGroup(String(group.id))}>
                <span className="kid-practice-card-top">
                  <b>{group.title || '未命名题目'}</b>
                  <em className="kid-card-type-badge">{qType.icon} {qType.label}</em>
                </span>
                <small>{group.gradeLevel || ''}{group.gradeLevel ? ' · ' : ''}难度 {'⭐'.repeat(Math.min(5, Number(group.difficulty) || 1))}</small>
                {Array.isArray(group.tags) && group.tags.length > 0 && (
                  <span className="kid-card-tags">{group.tags.slice(0, 3).map((tag: string) => <span key={tag} className="badge badge-muted">{tag}</span>)}</span>
                )}
                <span className="kid-card-start-btn">开始 →</span>
              </button>;
            })}
            {!filteredQuestionGroups.length && <div className="empty-state"><span className="empty-state-icon">🔍</span><p className="empty-state-title">没有符合条件的题目</p></div>}
          </div>
        </>}
      </section>}

      {activeTab === 'wrong' && <section className="kid-panel animate-fadeInUp">
        <div className="kid-wrong-hero">
          <div><span className="badge badge-warning badge-lg">{TXT.wrongReview}</span><h2>{TXT.wrongRemainPrefix}{wrongAnswers.length}{TXT.wrongRemainSuffix}</h2><p>{TXT.wrongTip}</p></div>
          <button className="btn btn-warning btn-lg" onClick={onRetryWrong} disabled={!wrongAnswers.length}>{TXT.startWrongRetry}</button>
        </div>
        <div className="kid-quick-grid"><button className="btn btn-soft btn-lg btn-block" onClick={onOpenWrongBook}>{TXT.openWrongBook}</button><button className="btn btn-soft btn-lg btn-block" onClick={onOpenRecords}>{TXT.viewRecords}</button></div>
      </section>}

      {activeTab === 'reward' && <section className="kid-panel kid-reward-panel animate-bounceIn">
        <div className="reward-planet kid-reward-planet">{'\u2B50'}</div>
        <h2>{rewardState.stars} {TXT.stars}</h2>
        <p>{TXT.continuousPractice} {rewardState.streakDays} {TXT.days}，{TXT.badgesGot} {rewardState.badges.length} {TXT.badges}</p>
        <div className="kid-reward-actions"><button className="btn btn-accent btn-lg btn-block" onClick={onOpenRewards}>{TXT.rewardCenter}</button><button className="btn btn-soft btn-lg btn-block" onClick={onOpenTaskCenter}>{TXT.goTask}</button></div>
      </section>}

      {activeTab === 'mine' && <section className="kid-panel kid-mine-grid animate-fadeInUp">
        <div className="card kid-profile-card">
          <b>{TXT.myProfile}</b>
          <input value={studentName} onChange={(event) => setStudentName(event.target.value)} placeholder={TXT.nickname} />
          <input value={avatarUrl} onChange={(event) => setAvatarUrl(event.target.value)} placeholder={TXT.avatarUrl} />
          <button className="btn btn-primary" onClick={saveProfile}>{TXT.saveProfile}</button>
        </div>
        <div className="stat-grid stat-grid-3">
          <div className="stat-card"><span className="stat-value accent">{totalStats.total}</span><span className="stat-label">{TXT.totalCount}</span></div>
          <div className="stat-card"><span className="stat-value">{totalStats.accuracy || '-'}</span><span className="stat-label">{TXT.accuracy}</span></div>
          <div className="stat-card"><span className="stat-value">{recentAttempts.length}</span><span className="stat-label">{TXT.records}</span></div>
        </div>
        <div className="card kid-recent-card">
          {recentAttempts.slice(0, 3).map((item) => <div className="card card-flat card-compact kid-recent-item" key={item.id}><b>{item.paper?.title || TXT.practice}</b><span>{shortDate(item.submittedAt)} {'\u00b7'} {item.isCorrect ? TXT.correct : TXT.needReview}</span></div>)}
          {!recentAttempts.length && <div className="card card-flat card-compact kid-recent-item"><b>{TXT.noRecords}</b><span>{TXT.noRecordsTip}</span></div>}
        </div>
        <div className="kid-quick-grid kid-mine-actions"><button className="btn btn-soft btn-lg btn-block" onClick={onOpenReport}>{TXT.report}</button><button className="btn btn-soft btn-lg btn-block" onClick={onOpenRecords}>{TXT.allRecords}</button>{entertainmentSettings.enabled && <button className="btn btn-soft btn-lg btn-block" onClick={onOpenGames}>{TXT.games}</button>}<button className="btn btn-secondary btn-lg btn-block" onClick={onSwitchStudent}>{TXT.switchStudent}</button></div>
      </section>}
    </main>

    <nav className="kid-bottom-tabs">
      {[
        ['home', '\u2302', TXT.home],
        ['practice', '\u{1F4DA}', TXT.practice],
        ['wrong', '\u{1F4DD}', TXT.wrong],
        ['reward', '\u2B50', TXT.reward],
        ['mine', '\u{1F642}', TXT.mine],
      ].map(([key, icon, label]) => <button key={key} className={`kid-tab ${activeTab === key ? 'active' : ''}`} onClick={() => setActiveTab(key as KidTab)}><span className="kid-tab-icon">{icon}</span><b className="kid-tab-label">{label}</b></button>)}
    </nav>
  </div>;
}

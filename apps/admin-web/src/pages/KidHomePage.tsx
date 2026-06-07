import { useEffect, useMemo, useState } from 'react';
import { listStudentPapers as listPapers } from '../api/papers';
import { listStudentQuestionGroups as listQuestionGroups } from '../api/questionGroups';
import { listStudentPaperStats as listPaperStats, listStudentRecentAttempts as listRecentAttempts, listStudentWrongAnswers as listWrongAnswers } from '../api/submissions';
import { getChildStudentProfile as getStudentProfile, saveChildStudentProfile as saveStudentProfileApi } from '../api/student';
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

export function KidHomePage({ onBackAdmin, onStartPaper, onStartQuestionGroup, onOpenWrongBook, onRetryWrong, onOpenTaskCenter, onOpenReport, onOpenRewards, onOpenRecords, onSwitchStudent }: Props) {
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
  const [loading, setLoading] = useState(false);

  const refresh = async () => {
    try {
      setLoading(true);
      const [paperData, groupData, statData, wrongData, recentData] = await Promise.all([listPapers(), listQuestionGroups(), listPaperStats(), listWrongAnswers(), listRecentAttempts()]);
      setPapers(paperData);
      setQuestionGroups(groupData);
      setStatsMap(Object.fromEntries(statData.map((item) => [String(item.paperId), item])));
      setWrongAnswers(wrongData);
      setRecentAttempts(recentData);
      setRewardState(readRewardState());
      getStudentProfile().then((profile) => {
        if (profile?.name) setStudentName(profile.name);
        if (profile?.avatarUrl !== undefined) setAvatarUrl(profile.avatarUrl || '');
      }).catch(() => undefined);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { void refresh(); }, []);

  const saveProfile = () => {
    localStorage.setItem('kidsQuiz.studentName', studentName.trim() || TXT.child);
    localStorage.setItem('kidsQuiz.avatarUrl', avatarUrl.trim());
    void saveStudentProfileApi({ name: studentName.trim() || TXT.child, avatarUrl: avatarUrl.trim() }).catch(() => undefined);
  };

  const recommended = papers[0];
  const totalStats = useMemo(() => {
    const list = Object.values(statsMap);
    const total = list.reduce((sum, item: any) => sum + Number(item.total || 0), 0);
    const correct = list.reduce((sum, item: any) => sum + Number(item.correct || 0), 0);
    return { total, correct, accuracy: total ? Math.round((correct / total) * 100) : 0 };
  }, [statsMap]);


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
      <b>{paper.title}</b>
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
      {activeTab === 'home' && <div className="kid-home-grid">
        <section className="kid-hero-card animate-fadeInUp">
          <span className="kid-hero-tag">{TXT.todayRecommend}</span>
          <h2 className="kid-hero-title">{recommended ? recommended.title : TXT.noPractice}</h2>
          <p className="kid-hero-desc">{recommended?.description || TXT.defaultDesc}</p>
          <div className="kid-hero-stats">
            <div className="kid-hero-stat"><b>{rewardState.stars}</b><small>{TXT.stars}</small></div>
            <div className="kid-hero-stat"><b>{rewardState.streakDays}</b><small>{TXT.streak}</small></div>
            <div className="kid-hero-stat"><b>{totalStats.accuracy || '-'}</b><small>{TXT.accuracy}</small></div>
          </div>
          {recommended ? <button className="kid-hero-action" onClick={() => onStartPaper(String(recommended.id))}>{TXT.startToday}</button> : <button className="kid-hero-action" disabled>{TXT.none}</button>}
        </section>
        <div className="kid-quick-grid">
          <button className="kid-quick-btn animate-fadeInUp stagger-1" onClick={() => setActiveTab('practice')}><b>{TXT.freePractice}</b><span>{papers.length} {TXT.sets}</span></button>
          <button className="kid-quick-btn animate-fadeInUp stagger-2" onClick={() => setActiveTab('wrong')}><b>{TXT.wrongRetry}</b><span>{wrongAnswers.length} {TXT.items}</span></button>
          <button className="kid-quick-btn animate-fadeInUp stagger-3" onClick={() => setActiveTab('reward')}><b>{TXT.myStars}</b><span>{rewardState.stars} {TXT.stars}</span></button>
          <button className="kid-quick-btn animate-fadeInUp stagger-4" onClick={() => setActiveTab('mine')}><b>{TXT.records}</b><span>{recentAttempts.length} {TXT.items}</span></button>
        </div>
      </div>}

      {activeTab === 'practice' && <section className="kid-panel">
        <div className="kid-section-header"><div><span className="kid-section-tag">{TXT.practiceCenter}</span><h2 className="kid-section-title">{practiceMode === 'paper' ? TXT.choosePaper : '\u6309\u9898\u76ee\u7ec3\u4e60'}</h2></div><button className="btn btn-soft btn-sm" onClick={refresh}>{loading ? TXT.refreshing : TXT.refresh}</button></div>
        <div className="practiceModeTabsV2">
          <button className={practiceMode === 'paper' ? 'active' : ''} onClick={() => setPracticeMode('paper')}>{'\u8bd5\u5377\u7ec3\u4e60'}</button>
          <button className={practiceMode === 'question' ? 'active' : ''} onClick={() => setPracticeMode('question')}>{'\u9898\u76ee\u7ec3\u4e60'}</button>
        </div>
        {practiceMode === 'paper' ? <div className="card-grid card-grid-auto">{papers.map(renderPaperCard)}{!papers.length && <div className="empty-state"><span className="empty-state-icon">📄</span><p className="empty-state-title">{TXT.noPaper}</p></div>}</div> : <>
          <div className="stat-grid stat-grid-3" style={{ marginBottom: '14px' }}>
            <div className="stat-card"><span className="stat-value">{questionGroups.length}</span><span className="stat-label">{'\u9898\u5e93\u9898\u7ec4'}</span></div>
            <div className="stat-card"><span className="stat-value accent">{filteredQuestionGroups.length}</span><span className="stat-label">{'\u7b5b\u9009\u7ed3\u679c'}</span></div>
            <div className="stat-card"><span className="stat-value">{gradeOptions.length || '-'}</span><span className="stat-label">{'\u5e74\u7ea7'}</span></div>
          </div>
          <div className="questionSubjectCardsV2">
            {([
              ['ALL', '\u2728', '\u5168\u90e8\u9898\u76ee', '\u6309\u81ea\u5df1\u60f3\u7ec3\u7684\u5185\u5bb9\u6311', questionGroups.length],
              ['\u6570\u5b66', '\u{1F522}', '\u6570\u5b66', '\u53e3\u7b97\u3001\u5e94\u7528\u9898\u3001\u6570\u611f', subjectCounts['\u6570\u5b66'] || 0],
              ['\u8bed\u6587', '\u{1F4D6}', '\u8bed\u6587', '\u53e4\u8bd7\u3001\u8bcd\u8bed\u3001\u8fde\u7ebf', subjectCounts['\u8bed\u6587'] || 0],
              ['\u82f1\u8bed', '\u{1F3A7}', '\u82f1\u8bed', '\u5355\u8bcd\u3001\u8bed\u6cd5\u3001\u9009\u62e9', subjectCounts['\u82f1\u8bed'] || 0],
            ] as Array<[string, string, string, string, number]>).map(([key, icon, title, desc, count]) => <button key={key} className={subjectFilter === key ? 'active' : ''} onClick={() => { setSubjectFilter(key); setTagFilter(''); }}>
              <span>{icon}</span><b>{title}</b><small>{desc}</small><em>{count} {'\u9053'}</em>
            </button>)}
          </div>
          <div className="questionTopicCardsV2">
            {([
              ['\u6613\u9519\u9898', '\u{1F525}', keywordCount('\u6613\u9519\u9898')],
              ['\u53e4\u8bd7', '\u{1F4DC}', keywordCount('\u53e4\u8bd7')],
              ['\u586b\u7a7a\u9898', '\u270D\uFE0F', keywordCount('\u586b\u7a7a\u9898')],
              ['\u9009\u62e9\u9898', '\u2705', keywordCount('\u9009\u62e9\u9898')],
              ['\u8fde\u7ebf\u9898', '\u{1F517}', keywordCount('\u8fde\u7ebf\u9898')],
            ] as Array<[string, string, number]>).map(([label, icon, count]) => <button key={label} className={tagFilter === label ? 'active' : ''} onClick={() => setTagFilter(tagFilter === label ? '' : label)}>
              <span>{icon}</span><b>{label}</b><em>{count}</em>
            </button>)}
          </div>
          <div className="questionTypeChipsV2">
            {([
              ['ALL', '\u5168\u90e8', questionTypeCounts.ALL],
              ['CALCULATION', '\u53e3\u7b97', questionTypeCounts.CALCULATION],
              ['COMPOSITE', '\u590d\u5408\u9898', questionTypeCounts.COMPOSITE],
              ['SINGLE', '\u5355\u9898', questionTypeCounts.SINGLE],
            ] as Array<[string, string, number]>).map(([key, label, count]) => <button key={key} className={typeFilter === key ? 'active' : ''} onClick={() => setTypeFilter(key)}><b>{label}</b><span>{count}</span></button>)}
          </div>
          <div className="filter-bar" style={{ gridTemplateColumns: '150px 150px 150px 1fr' }}>
            <select value={subjectFilter} onChange={(event) => setSubjectFilter(event.target.value)}><option value="ALL">{'\u5168\u90e8\u79d1\u76ee'}</option><option value={'\u6570\u5b66'}>{'\u6570\u5b66'}</option><option value={'\u8bed\u6587'}>{'\u8bed\u6587'}</option><option value={'\u82f1\u8bed'}>{'\u82f1\u8bed'}</option><option value={'\u5176\u4ed6'}>{'\u5176\u4ed6'}</option></select>
            <select value={gradeFilter} onChange={(event) => setGradeFilter(event.target.value)}><option value="">{'\u5168\u90e8\u5e74\u7ea7'}</option>{gradeOptions.map((grade) => <option key={grade} value={grade}>{grade}</option>)}</select>
            <select value={typeFilter} onChange={(event) => setTypeFilter(event.target.value)}><option value="ALL">{'\u5168\u90e8\u9898\u578b'}</option><option value="CALCULATION">{'\u53e3\u7b97\u9898\u7ec4'}</option><option value="COMPOSITE">{'\u590d\u5408\u9898'}</option><option value="SINGLE">{'\u5355\u9898'}</option></select>
            <input value={tagFilter} onChange={(event) => setTagFilter(event.target.value)} placeholder={'\u6309\u79d1\u76ee/\u6807\u7b7e/\u6807\u9898\u641c\u7d22\uff0c\u4f8b\u5982\uff1a\u6570\u5b66'} />
          </div>
          <div className="card-grid card-grid-auto">
            {filteredQuestionGroups.map((group) => <button className="kid-practice-card" key={group.id} onClick={() => startQuestionGroup(String(group.id))}>
              <b>{group.title || '\u672a\u547d\u540d\u9898\u76ee'}</b>
              <small>{group.gradeLevel || '\u672a\u8bbe\u7f6e\u5e74\u7ea7'} {'\u00b7'} {typeLabels[group.groupType] || group.groupType || '\u9898\u76ee'} {'\u00b7'} {'\u96be\u5ea6'} {group.difficulty ?? '-'}</small>
              <span>{Array.isArray(group.tags) && group.tags.length ? group.tags.join('\u3001') : '\u6682\u65e0\u6807\u7b7e'}<em className="badge badge-primary" style={{ marginLeft: '8px' }}>{'\u5f00\u59cb\u7ec3\u4e60'}</em></span>
            </button>)}
            {!filteredQuestionGroups.length && <div className="empty-state"><span className="empty-state-icon">🔍</span><p className="empty-state-title">{'\u6ca1\u6709\u627e\u5230\u7b26\u5408\u6761\u4ef6\u7684\u9898\u76ee\u3002'}</p></div>}
          </div>
        </>}
      </section>}

      {activeTab === 'wrong' && <section className="kid-panel animate-fadeInUp">
        <div className="card card-warning" style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '18px', padding: '24px', borderRadius: 'var(--radius-2xl)', marginBottom: '18px' }}>
          <div><span className="badge badge-warning badge-lg">{TXT.wrongReview}</span><h2 style={{ fontSize: 'var(--text-3xl)', margin: '6px 0' }}>{TXT.wrongRemainPrefix}{wrongAnswers.length}{TXT.wrongRemainSuffix}</h2><p style={{ margin: 0 }}>{TXT.wrongTip}</p></div>
          <button className="btn btn-warning btn-lg" onClick={onRetryWrong} disabled={!wrongAnswers.length}>{TXT.startWrongRetry}</button>
        </div>
        <div className="kid-quick-grid"><button className="btn btn-soft btn-lg btn-block" onClick={onOpenWrongBook}>{TXT.openWrongBook}</button><button className="btn btn-soft btn-lg btn-block" onClick={onOpenRecords}>{TXT.viewRecords}</button></div>
      </section>}

      {activeTab === 'reward' && <section className="kid-panel animate-bounceIn" style={{ textAlign: 'center', display: 'grid', justifyItems: 'center', alignContent: 'center', gap: '16px' }}>
        <div className="reward-planet" style={{ width: '120px', height: '120px' }}>{'\u2B50'}</div>
        <h2 style={{ fontSize: 'var(--text-4xl)', color: 'var(--amber-600)', margin: 0 }}>{rewardState.stars} {TXT.stars}</h2>
        <p style={{ fontSize: 'var(--text-lg)', color: 'var(--amber-600)', fontWeight: 800 }}>{TXT.continuousPractice} {rewardState.streakDays} {TXT.days}，{TXT.badgesGot} {rewardState.badges.length} {TXT.badges}</p>
        <div className="kid-quick-grid" style={{ width: '100%', maxWidth: '400px' }}><button className="btn btn-accent btn-lg btn-block" onClick={onOpenRewards}>{TXT.rewardCenter}</button><button className="btn btn-soft btn-lg btn-block" onClick={onOpenTaskCenter}>{TXT.goTask}</button></div>
      </section>}

      {activeTab === 'mine' && <section className="kid-panel animate-fadeInUp" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px' }}>
        <div className="card" style={{ gridRow: 'span 2', display: 'grid', gap: '10px' }}>
          <b style={{ fontSize: 'var(--text-xl)' }}>{TXT.myProfile}</b>
          <input value={studentName} onChange={(event) => setStudentName(event.target.value)} placeholder={TXT.nickname} />
          <input value={avatarUrl} onChange={(event) => setAvatarUrl(event.target.value)} placeholder={TXT.avatarUrl} />
          <button className="btn btn-primary" onClick={saveProfile}>{TXT.saveProfile}</button>
        </div>
        <div className="stat-grid stat-grid-3">
          <div className="stat-card"><span className="stat-value accent">{totalStats.total}</span><span className="stat-label">{TXT.totalCount}</span></div>
          <div className="stat-card"><span className="stat-value">{totalStats.accuracy || '-'}</span><span className="stat-label">{TXT.accuracy}</span></div>
          <div className="stat-card"><span className="stat-value">{recentAttempts.length}</span><span className="stat-label">{TXT.records}</span></div>
        </div>
        <div className="card" style={{ display: 'grid', gap: '10px' }}>
          {recentAttempts.slice(0, 3).map((item) => <div className="card card-flat card-compact" key={item.id}><b>{item.paper?.title || TXT.practice}</b><span style={{ color: 'var(--text-muted)', fontWeight: 700 }}>{shortDate(item.submittedAt)} {'\u00b7'} {item.isCorrect ? TXT.correct : TXT.needReview}</span></div>)}
          {!recentAttempts.length && <div className="card card-flat card-compact"><b>{TXT.noRecords}</b><span style={{ color: 'var(--text-muted)' }}>{TXT.noRecordsTip}</span></div>}
        </div>
        <div className="kid-quick-grid" style={{ gridColumn: '1 / -1' }}><button className="btn btn-soft btn-lg btn-block" onClick={onOpenReport}>{TXT.report}</button><button className="btn btn-soft btn-lg btn-block" onClick={onOpenRecords}>{TXT.allRecords}</button><button className="btn btn-secondary btn-lg btn-block" onClick={onSwitchStudent}>切换学生</button></div>
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

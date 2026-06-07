import { useEffect, useMemo, useState } from 'react';
import { getStudentWrongStats as getWrongStats, listStudentWrongAnswers as listWrongAnswers, submitStudentPaperAttempt as submitPaperAttempt } from '../api/submissions';
import { applyRewardSnapshot, badgeLabels, grantPracticeReward, type RewardGrant } from '../utils/rewards';
import { renderMathHtml, renderMathText } from '../utils/mathText';

type Props = {
  onBack: () => void;
  onHome: () => void;
  initialTag?: string;
};

type RetryAnswers = Record<string, string>;
type RetryResults = Record<string, boolean>;
type RetryReward = RewardGrant | null;
type WrongStats = {
  unresolvedSlots: number;
  unresolvedQuestions: number;
  masteredSlots: number;
  everWrongSlots: number;
  papers?: Array<{ paperId: string; title: string; wrongSlots: number }>;
  recentRetries?: Array<{ id: string; totalCount: number; correctCount: number; wrongCount: number; accuracy: number; rewardStars: number; submittedAt: string }>;
};

function normalize(value: unknown) {
  return String(value ?? '').trim();
}

function displayValue(value: unknown): string {
  if (Array.isArray(value)) return value.map(displayValue).join(', ');
  if (value && typeof value === 'object') return JSON.stringify(value);
  return normalize(value) || '未填写';
}

function retryKey(recordId: string, slotKey: string) {
  return `${recordId}:${slotKey}`;
}

function getKidProfile() {
  return {
    studentName: localStorage.getItem('kidsQuiz.studentName') || '小朋友',
    avatarUrl: localStorage.getItem('kidsQuiz.avatarUrl') || undefined,
  };
}

function renderRetryStem(stem: string, record: any, answers: RetryAnswers, results: RetryResults | null, setAnswer: (key: string, value: string) => void) {
  const details = record.details || [];
  const parts: React.ReactNode[] = [];
  let last = 0;
  const re = /\{\{blank:(\d+)\}\}/g;
  let match: RegExpExecArray | null;
  while ((match = re.exec(stem))) {
    if (match.index > last) parts.push(...renderMathText(stem.slice(last, match.index)));
    const slotKey = `blank_${match[1]}`;
    const detail = details.find((item: any) => item.slotKey === slotKey);
    const key = retryKey(String(record.id), slotKey);
    const resultClass = results ? (results[key] ? 'correct' : 'wrong') : '';
    parts.push(<input key={key} className={`studentBlank ${resultClass}`} value={answers[key] || ''} onChange={(event) => setAnswer(key, event.target.value)} placeholder="再答一次" />);
    if (detail && results && !results[key]) parts.push(<span className="retryCorrectTip" key={`${key}-tip`}>正确答案：{displayValue(detail.correctValue)}</span>);
    last = re.lastIndex;
  }
  if (last < stem.length) parts.push(...renderMathText(stem.slice(last)));
  return parts;
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

function hasWrongResult(record: any, results: RetryResults | null): boolean {
  if (!results) return false;
  return (record.details || []).some((detail: any) => results[retryKey(String(record.id), detail.slotKey)] === false);
}

export function WrongRetryPage({ onBack, onHome, initialTag }: Props) {
  const [records, setRecords] = useState<any[]>([]);
  const [retryLimit, setRetryLimit] = useState<'all' | '5' | '10'>('all');
  const [selectedPaperId, setSelectedPaperId] = useState('all');
  const [selectedTag, setSelectedTag] = useState(initialTag || 'all');
  const [answers, setAnswers] = useState<RetryAnswers>({});
  const [results, setResults] = useState<RetryResults | null>(null);
  const [reward, setReward] = useState<RetryReward>(null);
  const [stats, setStats] = useState<WrongStats | null>(null);
  const [message, setMessage] = useState('');
  const [loading, setLoading] = useState(false);

  const refreshStats = async () => {
    try {
      setStats(await getWrongStats());
    } catch {
      // 统计失败不影响错题重练主流程
    }
  };

  const refresh = async () => {
    try {
      setLoading(true);
      const [data, nextStats] = await Promise.all([listWrongAnswers(), getWrongStats()]);
      setRecords(data);
      setStats(nextStats);
      setAnswers({});
      setResults(null);
      setReward(null);
      setMessage(`已加载 ${data.length} 道错题`);
    } catch (error) {
      setMessage(`加载失败：${error instanceof Error ? error.message : String(error)}`);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { void refresh(); }, []);

  const visibleRecords = useMemo(() => {
    const byPaper = selectedPaperId === 'all' ? records : records.filter((record) => String(record.paperId || 'unknown') === selectedPaperId);
    const byTag = selectedTag === 'all' ? byPaper : byPaper.filter((record) => recordTags(record).includes(selectedTag));
    const count = retryLimit === 'all' ? byTag.length : Number(retryLimit);
    return byTag.slice(0, count);
  }, [records, retryLimit, selectedPaperId, selectedTag]);

  const summary = useMemo(() => {
    if (!results) return null;
    const values = Object.values(results);
    const correct = values.filter(Boolean).length;
    return {
      total: values.length,
      correct,
      wrong: values.length - correct,
      accuracy: values.length ? Math.round((correct / values.length) * 100) : 0,
    };
  }, [results]);

  const setAnswer = (key: string, value: string) => {
    setAnswers((prev) => ({ ...prev, [key]: value }));
    setResults(null);
    setReward(null);
  };

  const submit = async () => {
    const next: RetryResults = {};
    visibleRecords.forEach((record) => {
      (record.details || []).forEach((detail: any) => {
        const key = retryKey(String(record.id), detail.slotKey);
        const correctValues = Array.isArray(detail.correctValue) ? detail.correctValue : [detail.correctValue];
        next[key] = correctValues.some((value: unknown) => normalize(value) === normalize(answers[key]));
      });
    });
    setResults(next);
    const correct = Object.values(next).filter(Boolean).length;
    const total = Object.values(next).length;
    const accuracy = total ? Math.round((correct / total) * 100) : 0;
    let nextReward: RewardGrant | undefined;

    try {
      setLoading(true);
      const payloadAnswers = visibleRecords.map((record) => {
        const details = (record.details || []).map((detail: any) => {
          const key = retryKey(String(record.id), detail.slotKey);
          const isCorrect = Boolean(next[key]);
          return {
            slotKey: detail.slotKey,
            studentValue: answers[key] ?? '',
            correctValue: detail.correctValue,
            isCorrect,
            score: isCorrect ? 1 : 0,
          };
        });
        const isCorrect = details.length > 0 && details.every((detail: any) => detail.isCorrect);
        return {
          questionId: String(record.questionId),
          groupId: record.groupId ? String(record.groupId) : undefined,
          paperId: record.paperId ? String(record.paperId) : undefined,
          answerData: Object.fromEntries(details.map((detail: any) => [detail.slotKey, detail.studentValue])),
          correctData: Object.fromEntries(details.map((detail: any) => [detail.slotKey, detail.correctValue])),
          isCorrect,
          score: details.filter((detail: any) => detail.isCorrect).length,
          maxScore: details.length || 1,
          details,
        };
      }).filter((item) => item.questionId);

      if (payloadAnswers.length) {
        const profile = getKidProfile();
        const paperIds = Array.from(new Set(payloadAnswers.map((item) => item.paperId).filter(Boolean)));
        const result = await submitPaperAttempt({
          paperId: paperIds.length === 1 ? String(paperIds[0]) : '0',
          ...profile,
          source: 'WRONG_RETRY',
          answers: payloadAnswers,
        });
        if (result.reward) {
          nextReward = result.reward;
          applyRewardSnapshot(result.reward);
        }
        if (!nextReward) nextReward = grantPracticeReward({ accuracy, correct, total });
        setReward(nextReward);
        void refreshStats();
        setMessage(`错题重练完成：答对 ${correct} / ${total}；已保存 ${result.savedCount ?? payloadAnswers.length} 条重练记录；获得 ${nextReward.stars} 颗星`);
      } else {
        nextReward = grantPracticeReward({ accuracy, correct, total });
        setReward(nextReward);
        setMessage(`错题重练完成：答对 ${correct} / ${total}；获得 ${nextReward.stars} 颗星`);
      }
    } catch (error) {
      nextReward = grantPracticeReward({ accuracy, correct, total });
      setReward(nextReward);
      setMessage(`错题重练完成：答对 ${correct} / ${total}；但保存失败：${error instanceof Error ? error.message : String(error)}`);
    } finally {
      setLoading(false);
    }
  };

  const reset = () => {
    setAnswers({});
    setResults(null);
    setReward(null);
    setMessage('已清空本次错题重练');
  };

  return <div className="wrong-retry-page animate-fadeIn">
    <header className="page-header" style={{ marginBottom: 'var(--space-5)' }}>
      <div className="page-header-left">
        <h1 className="page-title">Kids Quiz 错题重练</h1>
        <p className="page-subtitle">只练之前做错的题，做对就说明已经掌握。</p>
      </div>
    </header>
    <div className="single-main">
      <section className="card">
        <div className="toolbar">
          <button className="btn btn-outline btn-sm" onClick={onHome}>孩子首页</button>
          <button className="btn btn-secondary btn-sm" onClick={onBack}>返回错题本</button>
          <button className="btn btn-outline btn-sm" onClick={refresh}>{loading ? '加载中...' : '刷新'}</button>
          <button className="btn btn-primary btn-sm" onClick={submit} disabled={!visibleRecords.length}>提交重练</button>
          <button className="btn btn-secondary btn-sm" onClick={reset}>清空答案</button>
        </div>
        {message && <p className="message">{message}</p>}

        <div className="filter-bar">
          <label>练习数量
            <select value={retryLimit} onChange={(event) => { setRetryLimit(event.target.value as 'all' | '5' | '10'); setResults(null); setReward(null); }}>
              <option value="all">全部错题</option>
              <option value="5">最近 5 题</option>
              <option value="10">最近 10 题</option>
            </select>
          </label>
          <label>试卷范围
            <select value={selectedPaperId} onChange={(event) => { setSelectedPaperId(event.target.value); setResults(null); setReward(null); }}>
              <option value="all">全部试卷</option>
              {Array.from(new Map(records.map((record) => [String(record.paperId || 'unknown'), record.paper?.title || `试卷 ${record.paperId || '-'}`])).entries()).map(([id, title]) => <option value={id} key={id}>{title}</option>)}
            </select>
          </label>
          <label>知识点
            <select value={selectedTag} onChange={(event) => { setSelectedTag(event.target.value); setResults(null); setReward(null); }}>
              <option value="all">全部知识点</option>
              {Array.from(new Set(records.flatMap(recordTags))).map((tag) => <option value={tag} key={tag}>{tag}</option>)}
            </select>
          </label>
          <span style={{ alignSelf: 'end', marginBottom: 'var(--space-2)', fontWeight: 800, color: 'var(--color-primary)' }}>本次将练习 {visibleRecords.length} 道错题</span>
        </div>

        {stats && <div className="wrong-retry-overview">
          <div><b>{stats.unresolvedSlots}</b><span>当前待掌握空</span></div>
          <div><b>{stats.unresolvedQuestions}</b><span>涉及题目</span></div>
          <div><b>{stats.masteredSlots}</b><span>已掌握错点</span></div>
          <div><b>{stats.everWrongSlots ? Math.round((stats.masteredSlots / stats.everWrongSlots) * 100) : 100}%</b><span>错题掌握率</span></div>
        </div>}

        {stats?.recentRetries?.length ? <div className="wrong-retry-insight">
          <b>最近一次重练：{stats.recentRetries[0].accuracy}%</b>
          <span>答对 {stats.recentRetries[0].correctCount} / {stats.recentRetries[0].totalCount}，获得 {stats.recentRetries[0].rewardStars} 颗星</span>
        </div> : null}

        {!!stats?.papers?.length && <details className="wrong-paper-focus">
          <summary>按试卷查看待掌握错题</summary>
          <div style={{ marginTop: 'var(--space-2)' }}>
            {stats.papers.map((paper) => <span key={paper.paperId} style={{ marginRight: 'var(--space-2)' }}>{paper.title}：{paper.wrongSlots} 个空</span>)}
          </div>
        </details>}

        {summary && <div className="completion-panel">
          <div className="completion-hero">
            <div className="completion-emoji">{summary.accuracy >= 90 ? '🌟' : summary.accuracy >= 70 ? '👍' : '💪'}</div>
            <div><h2>错题重练完成</h2><p>{summary.accuracy >= 90 ? '这次掌握得很好！' : '继续加油，把错题变成熟题。'}</p></div>
          </div>
          <div className="completion-stats">
            <div><b>{summary.accuracy}%</b><span>正确率</span></div>
            <div><b>{summary.correct}</b><span>答对</span></div>
            <div><b>{summary.wrong}</b><span>还需复习</span></div>
            <div><b>{summary.total}</b><span>总空数</span></div>
            <div><b>+{reward?.stars ?? 0}</b><span>星星</span></div>
          </div>
          {reward && <div className="reward-panel">
            <b>本次获得 {reward.stars} 颗星星，连续练习 {reward.streakDays} 天</b>
            {!!reward.newBadges.length && <p>新徽章：{reward.newBadges.map((badge) => badgeLabels[badge] || badge).join('、')}</p>}
          </div>}
        </div>}

        <div className="retryList" style={{ marginTop: 'var(--space-4)' }}>
          {visibleRecords.map((record, index) => <section className="preview-paper preview-paper-block retryCard" key={record.id}>
            <h2>{index + 1}. {record.paper?.title || `试卷 ${record.paperId}`}</h2>
            <div className="kq-stem">{renderRetryStem(record.question?.stem || `题目 ${record.questionId}`, record, answers, results, setAnswer)}</div>
            <details className="retryHistory" style={{ marginTop: 'var(--space-3)' }}>
              <summary style={{ cursor: 'pointer', fontWeight: 800 }}>查看上次错误</summary>
              <div style={{ marginTop: 'var(--space-2)' }}>
                {(record.details || []).map((detail: any) => <div className="recordDetailRow" key={detail.id} style={{ display: 'grid', gridTemplateColumns: '100px 1fr 1fr 60px', gap: 'var(--space-2)', borderTop: '1px solid var(--border-light)', paddingTop: 'var(--space-2)', marginTop: 'var(--space-2)' }}>
                  <span>{detail.slotKey}</span>
                  <span>上次答案：{renderMathText(displayValue(detail.studentValue))}</span>
                  <span>正确答案：{renderMathText(displayValue(detail.correctValue))}</span>
                  <b className="resultBad" style={{ color: 'var(--rose-600)' }}>错</b>
                </div>)}
              </div>
            </details>
            {hasWrongResult(record, results) && (explanationHtml(record) || plainExplanation(record)) && (
              <div className="question-explanation wrong-explanation">
                <div className="question-explanation-title">重练解析</div>
                {explanationHtml(record)
                  ? <div dangerouslySetInnerHTML={{ __html: renderMathHtml(explanationHtml(record)) }} />
                  : <div>{renderMathText(plainExplanation(record))}</div>}
              </div>
            )}
          </section>)}
          {!records.length && <p className="tip">暂无错题。可以先做一套练习并提交错误答案来生成错题。</p>}
          {!!records.length && !visibleRecords.length && <p className="tip">当前筛选条件下没有错题，请切换练习数量或试卷范围。</p>}
        </div>
      </section>
    </div>
  </div>;
}

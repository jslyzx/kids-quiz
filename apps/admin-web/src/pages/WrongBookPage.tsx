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
      <header className="page-header">
        <div className="page-header-left">
          <h1 className="page-title">错题复习本</h1>
          <p className="page-subtitle">汇总所有试卷与练习中的错题，支持按知识点和试卷智能聚类，助孩子集中复盘。</p>
        </div>
        <div className="page-actions">
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
      {message && <div className="message-banner success page-message">{message}</div>}

      {/* 错题数据汇总大卡片 */}
      <div className="stat-grid stat-grid-auto page-stat-grid animate-fadeInUp stagger-1">
        <div className="stat-card"><span className="stat-value danger">{records.length}</span><span className="stat-label">错题总数</span></div>
        <div className="stat-card"><span className="stat-value">{byPaper.length}</span><span className="stat-label">涉及试卷</span></div>
        <div className="stat-card"><span className="stat-value accent">{byTag.length}</span><span className="stat-label">涉及知识点</span></div>
        <div className="stat-card"><span className="stat-value success">{filtered.length}</span><span className="stat-label">当前显示</span></div>
        <div className="stat-card">
          <span className="stat-value orange stat-value-date">
            {records[0]?.submittedAt ? new Date(records[0].submittedAt).toLocaleDateString() : '-'}
          </span>
          <span className="stat-label">最近错题时间</span>
        </div>
      </div>

      {/* 搜索过滤框 */}
      <div className="card wrong-search-card animate-fadeInUp stagger-2">
        <input 
          className="wrong-search-input"
          placeholder="🔍 输入题干、知识点、试卷或 ID 过滤检索错题..." 
          value={keyword} 
          onChange={(event) => setKeyword(event.target.value)} 
        />
      </div>

      {/* 左右聚类汇总分栏 */}
      <div className="wrong-summary-grid animate-fadeInUp stagger-3">
        {/* 按知识点汇总 */}
        {!!byTag.length && (
          <div className="card wrong-summary-card">
            <h3 className="wrong-summary-title">
              🏷️ 按知识点汇总
            </h3>
            <div className="wrong-summary-list">
              {byTag.map((item) => (
                <div className="wrong-summary-row" key={item.tag}>
                  <div className="wrong-summary-main">
                    <span className="badge badge-primary">{item.tag}</span>
                    <small>{item.count} 道错题</small>
                  </div>
                  <div className="wrong-summary-actions">
                    <button className="btn btn-ghost btn-sm" onClick={() => setKeyword(item.tag)}>查看</button>
                    <button className="btn btn-soft btn-sm" onClick={() => onRetryTag(item.tag)}>重练</button>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* 按试卷汇总 */}
        {!!byPaper.length && (
          <div className="card wrong-summary-card">
            <h3 className="wrong-summary-title">
              📄 按试卷汇总
            </h3>
            <div className="wrong-summary-list">
              {byPaper.map((paper) => (
                <div className="wrong-summary-row" key={paper.paperId}>
                  <div className="wrong-summary-paper">
                    <b title={paper.title}>{paper.title}</b>
                    <small>{paper.count} 道错题</small>
                  </div>
                  <div className="wrong-summary-actions">
                    <button className="btn btn-ghost btn-sm" onClick={() => onOpenPaperRecords(paper.paperId)}>记录</button>
                    <button className="btn btn-soft btn-sm" onClick={() => onPracticePaper(paper.paperId)}>练习</button>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>

      <h2 className="review-section-title">
        🔍 错题详情明细
      </h2>

      {/* 错题卡片流 */}
      <div className="review-card-list animate-fadeInUp stagger-4">
        {filtered.map((record) => (
          <div 
            className="card card-hover review-card is-wrong" 
            key={record.id}
          >
            {/* 卡片头部 */}
            <div className="review-card-head">
              <div className="review-card-title-block">
                <h3 className="review-card-title">
                  {record.question?.stem || `题目 ${record.questionId}`}
                </h3>
                <small className="review-card-subtitle">
                  <span className="badge badge-danger">错题反馈</span>
                  <span>试卷：<b>{record.paper?.title || record.paperId}</b></span>
                  <span>来源：{sourceLabel(record.source)}</span>
                  <span>时间：{record.submittedAt ? new Date(record.submittedAt).toLocaleString() : '-'}</span>
                </small>
              </div>
              
              <span className="badge badge-danger badge-lg review-status-badge">
                需复习
              </span>
            </div>

            {/* 卡片元数据表格 */}
            <div className="review-meta-grid review-meta-grid-five">
              <div className="review-meta-item">
                <span>得分情况</span>
                <b className="danger">{record.score} / {record.maxScore} 分</b>
              </div>
              <div className="review-meta-item">
                <span>作答耗时</span>
                <b>{formatDuration(record.durationSeconds)}</b>
              </div>
              <div className="review-meta-item">
                <span>题目 ID</span>
                <b className="mono">{record.questionId}</b>
              </div>
              <div className="review-meta-item">
                <span>关联试卷 ID</span>
                <b className="mono">{record.paperId}</b>
              </div>
              <div className="review-meta-item">
                <span>匹配知识点</span>
                <b className="accent truncate" title={recordTags(record).join('、')}>
                  {recordTags(record).join('、') || '暂无分类'}
                </b>
              </div>
            </div>

            {/* 作答空位明细红批 */}
            <div className="review-detail-table">
              {(record.details || []).map((detail: any) => (
                <div 
                  key={detail.id} 
                  className={`review-detail-row ${detail.isCorrect ? 'is-correct' : 'is-wrong'}`}
                >
                  <span className="review-detail-slot">填空位: {detail.slotKey}</span>
                  <span className="review-detail-answer student">
                    学生答案：<b>{renderMathText(formatValue(detail.studentValue))}</b>
                  </span>
                  <span className="review-detail-answer correct">
                    正确答案：<b>{renderMathText(formatValue(detail.correctValue))}</b>
                  </span>
                  <span className="review-detail-status">
                    {detail.isCorrect ? '对' : '错'}
                  </span>
                </div>
              ))}
              {!(record.details || []).length && (
                <div className="review-detail-empty">
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

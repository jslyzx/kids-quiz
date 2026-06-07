import { useEffect, useMemo, useState } from 'react';
import { listWrongAnswers } from '../api/submissions';
import { renderMathText } from '../utils/mathText';

type Props = {
  onBack: () => void;
  onRetryWrong: () => void;
};

function formatValue(value: unknown): string {
  if (Array.isArray(value)) return value.map(formatValue).join(' / ');
  if (value && typeof value === 'object') return JSON.stringify(value);
  return String(value ?? '');
}

function renderStem(stem: string) {
  const parts: React.ReactNode[] = [];
  let last = 0;
  const re = /\{\{blank:(\d+)\}\}/g;
  let match: RegExpExecArray | null;
  while ((match = re.exec(stem))) {
    if (match.index > last) parts.push(...renderMathText(stem.slice(last, match.index)));
    parts.push(<span className="printBlank" key={`${match[1]}-${match.index}`} />);
    last = re.lastIndex;
  }
  if (last < stem.length) parts.push(...renderMathText(stem.slice(last)));
  return parts;
}

function WrongPrintQuestion({ record, index }: { record: any; index: number }) {
  const options = (record.question?.content?.options ?? []) as Array<{ key: string; text: string }>;
  return <section className="printSection wrongPrintQuestion">
    <h2>{index + 1}. {record.paper?.title || `试卷 ${record.paperId}`}</h2>
    <div className="printStem">{renderStem(record.question?.stem || `题目 ${record.questionId}`)}</div>
    {!!options.length && <div className="printOptions">{options.map((option) => <span key={option.key}>{option.key}. {renderMathText(option.text)}</span>)}</div>}
    <div className="wrongPrintAnswerLines">
      {(record.details || []).map((detail: any) => <div key={detail.id || detail.slotKey}><b>{detail.slotKey}</b><span /></div>)}
    </div>
  </section>;
}

export function WrongPrintPage({ onBack, onRetryWrong }: Props) {
  const [records, setRecords] = useState<any[]>([]);
  const [keyword, setKeyword] = useState('');
  const [showAnswers, setShowAnswers] = useState(false);
  const [message, setMessage] = useState('');
  const [loading, setLoading] = useState(false);

  const refresh = async () => {
    try {
      setLoading(true);
      const data = await listWrongAnswers();
      setRecords(data);
      setMessage(`已加载 ${data.length} 道错题`);
    } catch (error) {
      setMessage(`加载失败：${error instanceof Error ? error.message : String(error)}`);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { void refresh(); }, []);

  const filtered = useMemo(() => {
    const value = keyword.trim();
    if (!value) return records;
    return records.filter((record) => [
      record.question?.stem,
      record.paper?.title,
      record.questionId,
      record.paperId,
    ].some((item) => String(item ?? '').includes(value)));
  }, [records, keyword]);

  return <div className="app printPage">
    <header className="noPrint">
      <h1>Kids Quiz 错题打印</h1>
      <p>把错题整理成纸质复习卷，可以给孩子线下重新做一遍。</p>
    </header>
    <main className="singleMain">
      <section className="panel">
        <div className="toolbar noPrint">
          <button className="secondary" onClick={onBack}>返回错题本</button>
          <button onClick={onRetryWrong} disabled={!records.length}>在线重练</button>
          <button onClick={refresh}>{loading ? '加载中...' : '刷新'}</button>
          <button className={showAnswers ? '' : 'secondary'} onClick={() => setShowAnswers((value) => !value)}>{showAnswers ? '隐藏答案页' : '显示答案页'}</button>
          <button onClick={() => window.print()}>打印 / 保存 PDF</button>
        </div>
        <div className="wrongPrintFilters noPrint">
          <input className="wrongSearch" placeholder="按题干、试卷或 ID 筛选要打印的错题" value={keyword} onChange={(event) => setKeyword(event.target.value)} />
        </div>
        {message && <p className="message noPrint">{message}</p>}

        <article className="printSheet">
          <div className="printHead">
            <h1>错题复习卷</h1>
            <p>共 {filtered.length} 道错题。请先独立完成，再对照答案订正。</p>
            <div className="printMeta"><span>姓名：__________</span><span>日期：__________</span><span>用时：__________</span></div>
          </div>
          {filtered.map((record, index) => <WrongPrintQuestion record={record} index={index} key={record.id} />)}
          {!filtered.length && <p className="tip noPrint">暂无可打印错题。</p>}
        </article>

        {showAnswers && <article className="printSheet answerSheet">
          <div className="printHead">
            <h1>错题复习卷 参考答案</h1>
            <p>家长批改用。</p>
          </div>
          <div className="answerRows">
            {filtered.map((record, index) => <div className="answerRow" key={record.id}>
              <span>{index + 1}. {record.question?.stem || `题目 ${record.questionId}`}</span>
              <b>{record.paper?.title || `试卷 ${record.paperId}`}</b>
              <em>{(record.details || []).map((detail: any) => `${detail.slotKey}: ${formatValue(detail.correctValue)}`).join('；') || '-'}</em>
            </div>)}
          </div>
        </article>}
      </section>
    </main>
  </div>;
}

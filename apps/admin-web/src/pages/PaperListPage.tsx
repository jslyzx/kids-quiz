import { useEffect, useState } from 'react';
import { createPaper, deletePaper, listPapers, smartGeneratePaper } from '../api/papers';
import { listPaperStats } from '../api/submissions';

type Props = {
  onBackQuestions: () => void;
  onEditPaper: (id: string) => void;
  onPreviewPaper: (id: string) => void;
  onPrintPaper: (id: string) => void;
  onOpenRecords: (id: string) => void;
};

export function PaperListPage({ onBackQuestions, onEditPaper, onPreviewPaper, onPrintPaper, onOpenRecords }: Props) {
  const [papers, setPapers] = useState<any[]>([]);
  const [title, setTitle] = useState('数学练习卷');
  const [description, setDescription] = useState('');
  const [smartKeyword, setSmartKeyword] = useState('');
  const [smartGrade, setSmartGrade] = useState('二年级');
  const [smartTag, setSmartTag] = useState('');
  const [smartCount, setSmartCount] = useState(10);
  const [smartDifficulty, setSmartDifficulty] = useState(5);
  const [message, setMessage] = useState('');
  const [loading, setLoading] = useState(false);
  const [statsMap, setStatsMap] = useState<Record<string, any>>({});
  const [createMode, setCreateMode] = useState<'normal' | 'smart'>('normal');

  const refresh = async () => {
    try {
      setLoading(true);
      const [data, stats] = await Promise.all([listPapers(), listPaperStats()]);
      setPapers(data);
      setStatsMap(Object.fromEntries(stats.map((item) => [String(item.paperId), item])));
      setMessage(`已加载 ${data.length} 套试卷`);
    } catch (error) {
      setMessage(`加载失败：${error instanceof Error ? error.message : String(error)}`);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { void refresh(); }, []);

  const create = async () => {
    try {
      const paper = await createPaper({ title, description });
      setPapers((prev) => [paper, ...prev]);
      setMessage(`已新建试卷：${paper.title}`);
    } catch (error) {
      setMessage(`新建失败：${error instanceof Error ? error.message : String(error)}`);
    }
  };

  const smartCreate = async () => {
    try {
      const paper = await smartGeneratePaper({
        title: `${title || '数学练习卷'}（智能组卷）`,
        description: description || '按题库自动生成',
        keyword: smartKeyword,
        gradeLevel: smartGrade,
        tag: smartTag,
        count: smartCount,
        maxDifficulty: smartDifficulty,
      });
      setPapers((prev) => [paper, ...prev]);
      setMessage(`已智能生成试卷：${paper.title}`);
    } catch (error) {
      setMessage(`智能组卷失败：${error instanceof Error ? error.message : String(error)}`);
    }
  };

  const remove = async (id: string) => {
    if (!confirm(`确认删除试卷 ID：${id}？`)) return;
    try {
      await deletePaper(id);
      setPapers((prev) => prev.filter((item) => String(item.id) !== id));
      setMessage(`已删除试卷 ID：${id}`);
    } catch (error) {
      setMessage(`删除失败：${error instanceof Error ? error.message : String(error)}`);
    }
  };

  const isCheckPaper = (paper: any) => String(paper.title ?? '').startsWith('JSON导入验收试卷') || String(paper.description ?? '').includes('JSON 导入页自动生成');
  const checkPapers = papers.filter(isCheckPaper);
  const cleanupCheckPapers = async () => {
    if (!checkPapers.length) { setMessage('当前列表中没有 JSON 导入验收试卷。'); return; }
    if (!confirm(`确认删除 ${checkPapers.length} 套 JSON 导入验收试卷？题库中的题目不会删除。`)) return;
    try {
      for (const paper of checkPapers) await deletePaper(String(paper.id));
      setPapers((prev) => prev.filter((paper) => !isCheckPaper(paper)));
      setMessage(`已清理 ${checkPapers.length} 套验收试卷`);
    } catch (error) {
      setMessage(`清理验收试卷失败：${error instanceof Error ? error.message : String(error)}`);
    }
  };

  const gridTemplate = '60px 1.8fr 70px 1.6fr 1.2fr 300px';

  return (
    <div className="paper-list-page animate-fadeIn">
      {/* 头部区域 */}
      <header className="page-header" style={{ marginBottom: 'var(--space-5)' }}>
        <div className="page-header-left">
          <h1 className="page-title">试卷管理</h1>
          <p className="page-subtitle">创建练习试卷，从题库中添加或调整题目，提供纸张打印或在线练习。</p>
        </div>
        <div className="page-actions">
          <button className="btn btn-secondary btn-sm" onClick={onBackQuestions}>
            前往题库
          </button>
          <button className="btn btn-soft btn-sm" onClick={refresh}>
            {loading ? '刷新中...' : '刷新'}
          </button>
          <button className="btn btn-warning btn-sm" onClick={cleanupCheckPapers} disabled={!checkPapers.length}>
            清理验收卷{checkPapers.length ? `(${checkPapers.length})` : ''}
          </button>
        </div>
      </header>

      {/* 消息提示 */}
      {message && <div className="message-banner success" style={{ marginBottom: 'var(--space-4)' }}>{message}</div>}

      {/* 核心双栏布局 */}
      <div style={{ display: 'grid', gridTemplateColumns: '360px 1fr', gap: 'var(--space-5)', alignItems: 'start' }}>
        {/* 左栏：创建试卷 */}
        <div className="card" style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-3)' }}>
          {/* Tab 切换头部 */}
          <div style={{ display: 'flex', gap: 'var(--space-1)', padding: '2px', background: 'var(--slate-100)', borderRadius: 'var(--radius-lg)', marginBottom: 'var(--space-2)' }}>
            <button 
              className="btn btn-sm" 
              style={{ flex: 1, borderRadius: 'var(--radius-md)', background: createMode === 'normal' ? 'var(--bg-card)' : 'transparent', color: createMode === 'normal' ? 'var(--text-primary)' : 'var(--text-muted)', boxShadow: createMode === 'normal' ? 'var(--shadow-xs)' : 'none' }}
              onClick={() => setCreateMode('normal')}
            >
              普通组卷
            </button>
            <button 
              className="btn btn-sm" 
              style={{ flex: 1, borderRadius: 'var(--radius-md)', background: createMode === 'smart' ? 'var(--bg-card)' : 'transparent', color: createMode === 'smart' ? 'var(--text-primary)' : 'var(--text-muted)', boxShadow: createMode === 'smart' ? 'var(--shadow-xs)' : 'none' }}
              onClick={() => setCreateMode('smart')}
            >
              智能组卷
            </button>
          </div>

          {/* 表单渲染 */}
          {createMode === 'normal' ? (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-3)' }}>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                <label style={{ fontSize: 'var(--text-sm)', fontWeight: 700, color: 'var(--text-secondary)' }}>试卷标题</label>
                <input 
                  style={{ padding: 'var(--space-2)', borderRadius: 'var(--radius-md)', border: '1px solid var(--border-default)', fontSize: 'var(--text-sm)', fontFamily: 'inherit' }} 
                  value={title} 
                  onChange={(e) => setTitle(e.target.value)} 
                />
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                <label style={{ fontSize: 'var(--text-sm)', fontWeight: 700, color: 'var(--text-secondary)' }}>试卷说明</label>
                <textarea 
                  style={{ padding: 'var(--space-2)', borderRadius: 'var(--radius-md)', border: '1px solid var(--border-default)', minHeight: '80px', fontSize: 'var(--text-sm)', fontFamily: 'inherit', resize: 'vertical' }} 
                  value={description} 
                  onChange={(e) => setDescription(e.target.value)} 
                  placeholder="如：第二单元课后乘法口算强化" 
                />
              </div>
              <button className="btn btn-primary btn-block" style={{ marginTop: 'var(--space-2)' }} onClick={create}>
                新建空白试卷
              </button>
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-3)' }}>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                <label style={{ fontSize: 'var(--text-sm)', fontWeight: 700, color: 'var(--text-secondary)' }}>试卷标题</label>
                <input 
                  style={{ padding: 'var(--space-2)', borderRadius: 'var(--radius-md)', border: '1px solid var(--border-default)', fontSize: 'var(--text-sm)', fontFamily: 'inherit' }} 
                  value={title} 
                  onChange={(e) => setTitle(e.target.value)} 
                />
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                <label style={{ fontSize: 'var(--text-sm)', fontWeight: 700, color: 'var(--text-secondary)' }}>知识点/关键词</label>
                <input 
                  style={{ padding: 'var(--space-2)', borderRadius: 'var(--radius-md)', border: '1px solid var(--border-default)', fontSize: 'var(--text-sm)' }} 
                  value={smartKeyword} 
                  onChange={(e) => setSmartKeyword(e.target.value)} 
                  placeholder="如：乘法、比较" 
                />
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 'var(--space-2)' }}>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                  <label style={{ fontSize: 'var(--text-sm)', fontWeight: 700, color: 'var(--text-secondary)' }}>适用年级</label>
                  <input 
                    style={{ padding: 'var(--space-2)', borderRadius: 'var(--radius-md)', border: '1px solid var(--border-default)', fontSize: 'var(--text-sm)' }} 
                    value={smartGrade} 
                    onChange={(e) => setSmartGrade(e.target.value)} 
                    placeholder="二年级" 
                  />
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                  <label style={{ fontSize: 'var(--text-sm)', fontWeight: 700, color: 'var(--text-secondary)' }}>匹配标签</label>
                  <input 
                    style={{ padding: 'var(--space-2)', borderRadius: 'var(--radius-md)', border: '1px solid var(--border-default)', fontSize: 'var(--text-sm)' }} 
                    value={smartTag} 
                    onChange={(e) => setSmartTag(e.target.value)} 
                    placeholder="乘法" 
                  />
                </div>
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 'var(--space-2)' }}>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                  <label style={{ fontSize: 'var(--text-sm)', fontWeight: 700, color: 'var(--text-secondary)' }}>题目数量</label>
                  <input 
                    type="number" 
                    min={1} 
                    max={50} 
                    style={{ padding: 'var(--space-2)', borderRadius: 'var(--radius-md)', border: '1px solid var(--border-default)', fontSize: 'var(--text-sm)' }} 
                    value={smartCount} 
                    onChange={(e) => setSmartCount(Number(e.target.value))} 
                  />
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                  <label style={{ fontSize: 'var(--text-sm)', fontWeight: 700, color: 'var(--text-secondary)' }}>最高难度</label>
                  <input 
                    type="number" 
                    min={1} 
                    max={5} 
                    style={{ padding: 'var(--space-2)', borderRadius: 'var(--radius-md)', border: '1px solid var(--border-default)', fontSize: 'var(--text-sm)' }} 
                    value={smartDifficulty} 
                    onChange={(e) => setSmartDifficulty(Number(e.target.value))} 
                  />
                </div>
              </div>
              <button className="btn btn-accent btn-block" style={{ marginTop: 'var(--space-2)' }} onClick={smartCreate}>
                智能自动生成
              </button>
            </div>
          )}
        </div>

        {/* 右栏：试卷列表 */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-3)' }}>
          <h2 style={{ fontSize: 'var(--text-lg)', fontWeight: 800, margin: '0 0 2px 4px', color: 'var(--text-primary)' }}>试卷列表</h2>
          
          <div className="data-table">
            <div className="table-row table-head" style={{ gridTemplateColumns: gridTemplate }}>
              <span>ID</span>
              <span>试卷名称</span>
              <span>题数</span>
              <span>练习统计</span>
              <span>更新时间</span>
              <span style={{ textAlign: 'right', paddingRight: 'var(--space-4)' }}>操作</span>
            </div>
            
            {papers.map((paper) => {
              const stat = statsMap[String(paper.id)];
              return (
                <div className="table-row" style={{ gridTemplateColumns: gridTemplate }} key={paper.id}>
                  <span style={{ fontFamily: 'var(--font-mono)', fontSize: 'var(--text-sm)', color: 'var(--text-muted)' }}>{paper.id}</span>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '2px' }}>
                    <b style={{ color: 'var(--text-primary)', fontSize: 'var(--text-base)' }}>
                      {paper.title}
                      {isCheckPaper(paper) && <em className="badge badge-warning" style={{ marginLeft: 8, fontStyle: 'normal' }}>验收卷</em>}
                    </b>
                    <small style={{ color: 'var(--text-muted)', fontSize: 'var(--text-xs)' }}>{paper.description || '暂无说明'}</small>
                  </div>
                  <span style={{ fontWeight: 700 }}>{paper.itemCount ?? paper.items?.length ?? 0}</span>
                  <div style={{ fontSize: 'var(--text-xs)', color: 'var(--text-secondary)' }}>
                    {stat ? (
                      <>
                        练习 <b style={{ color: 'var(--color-primary)' }}>{stat.total}</b> 次<br />
                        正确率 <b style={{ color: 'var(--color-success)' }}>{stat.accuracy}%</b>
                      </>
                    ) : (
                      <span style={{ color: 'var(--text-muted)' }}>暂无练习</span>
                    )}
                  </div>
                  <span style={{ color: 'var(--text-muted)', fontSize: 'var(--text-xs)' }}>
                    {paper.updatedAt ? new Date(paper.updatedAt).toLocaleDateString() : '-'}
                  </span>
                  <div className="table-actions" style={{ justifyContent: 'flex-end', gap: '6px' }}>
                    <button className="btn btn-soft btn-sm" style={{ padding: '4px 8px' }} onClick={() => onEditPaper(String(paper.id))}>编辑</button>
                    <button className="btn btn-outline btn-sm" style={{ padding: '4px 8px' }} onClick={() => onPreviewPaper(String(paper.id))}>预览</button>
                    <button className="btn btn-secondary btn-sm" style={{ padding: '4px 8px' }} onClick={() => onPrintPaper(String(paper.id))}>打印</button>
                    <button className="btn btn-ghost btn-sm" style={{ padding: '4px 8px', fontSize: 'var(--text-xs)' }} onClick={() => onOpenRecords(String(paper.id))}>记录</button>
                    <button className="btn btn-danger btn-sm" style={{ padding: '4px 8px' }} onClick={() => remove(String(paper.id))}>删除</button>
                  </div>
                </div>
              );
            })}
            
            {!papers.length && (
              <div className="empty-state">
                <span className="empty-state-icon">📄</span>
                <p className="empty-state-title">暂无试卷数据</p>
                <p className="empty-state-desc">你可以通过左侧的“普通组卷”或“智能组卷”快速生成练习卷。</p>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

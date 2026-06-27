/* ========================================
   分页器
   ======================================== */

interface PaginationProps {
  page: number;
  totalPages: number;
  total: number;
  pageSize: number;
  onPageChange: (page: number) => void;
  onPageSizeChange?: (size: number) => void;
  pageSizeOptions?: number[];
}

export function Pagination({
  page, totalPages, total, pageSize,
  onPageChange, onPageSizeChange,
  pageSizeOptions = [20, 50, 100, 200],
}: PaginationProps) {
  if (total === 0) return null;
  const start = (page - 1) * pageSize + 1;
  const end = Math.min(page * pageSize, total);

  // 生成页码按钮（最多显示 7 个，省略号折叠）
  const pages: (number | '…')[] = [];
  const add = (n: number | '…') => pages.push(n);
  if (totalPages <= 7) {
    for (let i = 1; i <= totalPages; i += 1) add(i);
  } else {
    add(1);
    if (page > 4) add('…');
    const from = Math.max(2, page - 1);
    const to = Math.min(totalPages - 1, page + 1);
    for (let i = from; i <= to; i += 1) add(i);
    if (page < totalPages - 3) add('…');
    add(totalPages);
  }

  return (
    <div className="pagination">
      <div className="pagination-info">
        第 <b>{start}-{end}</b> 条，共 <b>{total}</b> 条
      </div>
      <div className="pagination-controls">
        <button
          type="button"
          className="btn btn-secondary btn-sm"
          disabled={page <= 1}
          onClick={() => onPageChange(page - 1)}
        >上一页</button>
        {pages.map((p, i) => p === '…' ? (
          <span key={`ellipsis-${i}`} className="pagination-ellipsis">…</span>
        ) : (
          <button
            key={p}
            type="button"
            className={`btn btn-sm ${p === page ? 'btn-primary' : 'btn-ghost'}`}
            onClick={() => onPageChange(p)}
            aria-current={p === page ? 'page' : undefined}
          >{p}</button>
        ))}
        <button
          type="button"
          className="btn btn-secondary btn-sm"
          disabled={page >= totalPages}
          onClick={() => onPageChange(page + 1)}
        >下一页</button>
      </div>
      {onPageSizeChange && (
        <label className="pagination-size">
          每页
          <select value={pageSize} onChange={(e) => onPageSizeChange(Number(e.target.value))}>
            {pageSizeOptions.map((n) => <option key={n} value={n}>{n}</option>)}
          </select>
        </label>
      )}
    </div>
  );
}

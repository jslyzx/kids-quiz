/* ========================================
   统一时间格式化
   - 列表用相对时间（3 分钟前）
   - 详情用绝对时间（YYYY-MM-DD HH:mm）
   ======================================== */

function pad(n: number): string {
  return n < 10 ? `0${n}` : String(n);
}

/** 绝对时间：YYYY-MM-DD HH:mm */
export function formatDateTime(value?: string | number | Date | null): string {
  if (!value) return '-';
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return '-';
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

/** 仅日期：YYYY-MM-DD */
export function formatDate(value?: string | number | Date | null): string {
  if (!value) return '-';
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return '-';
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

/** 相对时间：3 分钟前 / 2 小时前 / 昨天 / YYYY-MM-DD */
export function formatRelative(value?: string | number | Date | null): string {
  if (!value) return '-';
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return '-';
  const diff = Date.now() - d.getTime();
  const sec = Math.floor(diff / 1000);
  if (sec < 60) return '刚刚';
  const min = Math.floor(sec / 60);
  if (min < 60) return `${min} 分钟前`;
  const hour = Math.floor(min / 60);
  if (hour < 24) return `${hour} 小时前`;
  const day = Math.floor(hour / 24);
  if (day === 1) return '昨天';
  if (day < 30) return `${day} 天前`;
  return formatDate(d);
}

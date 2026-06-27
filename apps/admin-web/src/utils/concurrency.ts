/* ========================================
   并发控制：限制并发数的 map
   ======================================== */

/**
 * 类似 p-limit 的并发控制器。
 * 对数组每项调用 async fn，最多同时 concurrency 个在执行。
 * 失败的项会被收集返回（不抛出，由调用方处理）。
 */
export async function mapWithConcurrency<T, R>(
  items: readonly T[],
  concurrency: number,
  fn: (item: T, index: number) => Promise<R>,
  onProgress?: (done: number, total: number) => void,
): Promise<{ ok: { item: T; index: number; result: R }[]; failed: { item: T; index: number; error: unknown }[] }> {
  const ok: { item: T; index: number; result: R }[] = [];
  const failed: { item: T; index: number; error: unknown }[] = [];
  let cursor = 0;
  let done = 0;
  const total = items.length;

  const worker = async () => {
    while (cursor < items.length) {
      const index = cursor;
      cursor += 1;
      const item = items[index];
      try {
        const result = await fn(item, index);
        ok.push({ item, index, result });
      } catch (error) {
        failed.push({ item, index, error });
      } finally {
        done += 1;
        onProgress?.(done, total);
      }
    }
  };

  const workers = Array.from({ length: Math.max(1, Math.min(concurrency, items.length)) }, () => worker());
  await Promise.all(workers);
  return { ok, failed };
}

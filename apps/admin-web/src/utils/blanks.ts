export const blankRe = /\{\{blank:(\d+)\}\}/g;

export function blankKeys(stem: string) {
  const keys = new Set<string>();
  let m: RegExpExecArray | null;
  blankRe.lastIndex = 0;
  while ((m = blankRe.exec(stem))) keys.add(`blank_${m[1]}`);
  return [...keys];
}

/** 按题干中出现顺序返回空位 key（保留重复序号，用于答案区与题干同步） */
export function blankKeysOrdered(stem: string) {
  const keys: string[] = [];
  let m: RegExpExecArray | null;
  blankRe.lastIndex = 0;
  while ((m = blankRe.exec(stem))) {
    const key = `blank_${m[1]}`;
    if (!keys.includes(key)) keys.push(key);
  }
  return keys;
}

/** 计算下一个可用空位编号 */
export function nextBlankNumber(stem: string) {
  const keys = blankKeys(stem);
  let max = 0;
  for (const key of keys) {
    const num = Number(key.replace('blank_', ''));
    if (num > max) max = num;
  }
  return max + 1;
}


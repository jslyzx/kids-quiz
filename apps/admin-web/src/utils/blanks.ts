export const blankRe = /\{\{blank:(\d+)\}\}/g;

export function blankKeys(stem: string) {
  const keys = new Set<string>();
  let m: RegExpExecArray | null;
  blankRe.lastIndex = 0;
  while ((m = blankRe.exec(stem))) keys.add(`blank_${m[1]}`);
  return [...keys];
}

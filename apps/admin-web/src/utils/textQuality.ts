const MOJIBAKE_WORDS = [
  '锛',
  '绗',
  '瀵',
  '棰',
  '鈥',
  '馃',
  '浜屽勾',
  '鏁板',
  '濂栧姳',
  '瀵煎叆',
  '瑙ｆ瀽',
  '閫夋嫨',
  '缁冧範',
  '鍏戞崲',
  '杩斿洖',
  '涓€',
  '涓',
];

const REPLACEMENT_MARKER = /�|\?{3,}/;

function textOf(value: unknown): string {
  if (value === null || value === undefined) return '';
  if (typeof value === 'string') return value;
  if (typeof value === 'number' || typeof value === 'boolean') return String(value);
  try {
    return JSON.stringify(value);
  } catch {
    return String(value);
  }
}

function mojibakeScore(text: string) {
  if (!text) return 0;
  const wordScore = MOJIBAKE_WORDS.reduce((count, word) => count + (text.includes(word) ? 1 : 0), 0);
  const highBitPunctuationScore = (text.match(/[銆€]/g) ?? []).length >= 2 ? 1 : 0;
  return wordScore + highBitPunctuationScore + (REPLACEMENT_MARKER.test(text) ? 2 : 0);
}

export function looksLikeMojibake(value: unknown) {
  return mojibakeScore(textOf(value)) >= 2;
}

export function collectMojibakeSnippets(value: unknown, max = 3): string[] {
  const snippets: string[] = [];
  const visit = (input: unknown) => {
    if (snippets.length >= max || input === null || input === undefined) return;
    if (typeof input === 'string') {
      if (looksLikeMojibake(input)) {
        const compact = input.replace(/\s+/g, ' ').trim();
        snippets.push(compact.length > 42 ? `${compact.slice(0, 42)}...` : compact);
      }
      return;
    }
    if (Array.isArray(input)) {
      input.forEach(visit);
      return;
    }
    if (typeof input === 'object') {
      Object.values(input as Record<string, unknown>).forEach(visit);
    }
  };
  visit(value);
  return Array.from(new Set(snippets));
}

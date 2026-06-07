import type { ReactNode } from 'react';
import katex from 'katex';
import 'katex/dist/katex.min.css';

export function normalizeLegacyMathText(text: string): string {
  return String(text ?? '')
    .replace(/\\times/g, '\\times')
    .replace(/\\div/g, '\\div');
}

export function renderMathText(text: string): ReactNode[] {
  const source = normalizeLegacyMathText(text);
  const parts: ReactNode[] = [];
  const re = /\{\{math:(.+?)\}\}|\\\((.+?)\\\)|\\\[(.+?)\\\]/gs;
  let last = 0;
  let match: RegExpExecArray | null;
  while ((match = re.exec(source))) {
    if (match.index > last) parts.push(source.slice(last, match.index));
    const expr = match[1] ?? match[2] ?? match[3] ?? '';
    try {
      const html = katex.renderToString(expr, { throwOnError: false, displayMode: Boolean(match[3]) });
      parts.push(<span className="mathInline" key={`${match.index}-${expr}`} dangerouslySetInnerHTML={{ __html: html }} />);
    } catch {
      parts.push(expr);
    }
    last = re.lastIndex;
  }
  if (last < source.length) parts.push(source.slice(last));
  return parts;
}


function renderMathExpressionHtml(expr: string, displayMode: boolean) {
  try {
    return katex.renderToString(expr, { throwOnError: false, displayMode });
  } catch {
    return expr;
  }
}

export function renderMathHtml(html: string): string {
  const source = normalizeLegacyMathText(String(html ?? ''));
  return source
    .split(/(<[^>]+>)/g)
    .map((part) => {
      if (!part || part.startsWith('<')) return part;
      return part.replace(/\{\{math:(.+?)\}\}|\\\((.+?)\\\)|\\\[(.+?)\\\]/gs, (_all, a, b, c) => {
        const expr = a ?? b ?? c ?? '';
        return renderMathExpressionHtml(expr, Boolean(c));
      });
    })
    .join('');
}

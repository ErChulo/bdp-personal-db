export type CodeLanguage = 'sql' | 'js' | 'plain';

const SQL_KEYWORDS = new Set([
  'SELECT', 'FROM', 'WHERE', 'INSERT', 'INTO', 'VALUES', 'UPDATE', 'DELETE', 'CREATE',
  'TABLE', 'INDEX', 'DROP', 'ALTER', 'ADD', 'PRIMARY', 'KEY', 'FOREIGN', 'REFERENCES',
  'INNER', 'LEFT', 'RIGHT', 'FULL', 'OUTER', 'JOIN', 'ON', 'AS', 'DISTINCT', 'GROUP',
  'BY', 'HAVING', 'ORDER', 'LIMIT', 'OFFSET', 'AND', 'OR', 'NOT', 'NULL', 'IS',
  'IN', 'EXISTS', 'UNION', 'ALL', 'CASE', 'WHEN', 'THEN', 'ELSE', 'END', 'ASC', 'DESC',
  'PRAGMA', 'VACUUM', 'BEGIN', 'COMMIT', 'ROLLBACK', 'EXPLAIN', 'IF', 'DEFAULT',
]);

const JS_KEYWORDS = new Set([
  'const', 'let', 'var', 'function', 'return', 'if', 'else', 'for', 'while', 'do', 'switch',
  'case', 'break', 'continue', 'try', 'catch', 'finally', 'throw', 'new', 'this', 'class',
  'extends', 'import', 'from', 'export', 'default', 'async', 'await', 'of', 'in',
  'instanceof', 'typeof', 'void', 'delete', 'yield', 'with', 'true', 'false', 'null', 'undefined',
]);

export function highlightCode(code: string, language: CodeLanguage): string {
  if (!code) return '';
  if (language === 'plain') return escapeHtml(code);

  const patterns =
    language === 'sql'
      ? [
          { type: 'comment', regex: /(--[^\n]*|\/\*[\s\S]*?\*\/)/g },
          { type: 'string', regex: /('(?:''|[^'])*'|"(?:\\"|[^"])*")/g },
          { type: 'number', regex: /\b\d+(?:\.\d+)?\b/g },
          { type: 'keyword', regex: /\b[A-Z_][A-Z0-9_]*\b/gi, match: (value: string) => SQL_KEYWORDS.has(value.toUpperCase()) },
        ]
      : [
          { type: 'comment', regex: /(\/\/[^\n]*|\/\*[\s\S]*?\*\/)/g },
          { type: 'string', regex: /(`(?:\\`|[^`])*`|"(?:\\"|[^"])*"|'(?:\\'|[^'])*')/g },
          { type: 'number', regex: /\b\d+(?:\.\d+)?\b/g },
          { type: 'keyword', regex: /\b[A-Za-z_$][\w$]*\b/g, match: (value: string) => JS_KEYWORDS.has(value) },
        ];

  const tokens: Array<{ start: number; end: number; type: string }> = [];
  for (const pattern of patterns) {
    for (const match of code.matchAll(pattern.regex)) {
      const value = match[0];
      if (pattern.match && !pattern.match(value)) continue;
      tokens.push({ start: match.index ?? 0, end: (match.index ?? 0) + value.length, type: pattern.type });
    }
  }

  tokens.sort((a, b) => a.start - b.start || b.end - a.end);
  const merged: Array<{ start: number; end: number; type: string }> = [];
  let cursor = 0;
  for (const token of tokens) {
    if (token.start < cursor) continue;
    merged.push(token);
    cursor = token.end;
  }

  let out = '';
  let last = 0;
  for (const token of merged) {
    out += escapeHtml(code.slice(last, token.start));
    out += `<span class="tok tok-${token.type}">${escapeHtml(code.slice(token.start, token.end))}</span>`;
    last = token.end;
  }
  out += escapeHtml(code.slice(last));
  return out;
}

export function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

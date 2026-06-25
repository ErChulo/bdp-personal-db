import { describe, expect, it } from 'vitest';
import { highlightCode } from '../src/utils/codeHighlight';

describe('codeHighlight', () => {
  it('highlights SQL keywords and strings', () => {
    const html = highlightCode("select * from users where name = 'Ada';", 'sql');
    expect(html).toContain('tok-keyword');
    expect(html).toContain('tok-string');
  });

  it('highlights JavaScript keywords and comments', () => {
    const html = highlightCode('// note\nconst n = 1;', 'js');
    expect(html).toContain('tok-comment');
    expect(html).toContain('tok-keyword');
    expect(html).toContain('tok-number');
  });
});

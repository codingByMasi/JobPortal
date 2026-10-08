import { describe, expect, it } from 'vitest';
import { parseMarkdown } from './Markdown';

describe('parseMarkdown', () => {
  it('reads headings, paragraphs, lists, tables, quotes and code', () => {
    const blocks = parseMarkdown(['# Title', '', 'First line', 'second line', '', '- one', '- two', '', '1. a', '2. b', '', '| A | B |', '|---|---|', '| 1 | 2 |', '', '> note', '', '```', 'x = 1', '```'].join('\n'));
    expect(blocks.map((b) => b.type)).toEqual(['h', 'p', 'list', 'list', 'table', 'quote', 'code']);
    expect(blocks[1].text).toBe('First line second line');
    expect(blocks[2]).toMatchObject({ ordered: false, items: ['one', 'two'] });
    expect(blocks[3]).toMatchObject({ ordered: true, items: ['a', 'b'] });
    expect(blocks[4]).toMatchObject({ head: ['A', 'B'], rows: [['1', '2']] });
  });
  it('treats html as plain text (it is never inserted as markup)', () => {
    const [p] = parseMarkdown('<script>alert(1)</script> <b>x</b>');
    expect(p.type).toBe('p');
    expect(p.text).toContain('<script>');
  });
});

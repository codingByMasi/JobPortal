// Shows a guide written in simple Markdown (headings, lists, tables, bold, code) as plain page elements. Nothing is ever put in as raw HTML.
import { Fragment } from 'react';

/** **bold**, `code` and [text](address) -> bold, code and just the text (no links from stored text). */
function inline(text) {
  const parts = String(text).split(/(\*\*[^*]+\*\*|`[^`]+`|\[[^\]]+\]\([^)]+\))/g);
  return parts.map((part, i) => {
    if (/^\*\*[^*]+\*\*$/.test(part)) return <strong key={i}>{part.slice(2, -2)}</strong>;
    if (/^`[^`]+`$/.test(part)) return <code key={i}>{part.slice(1, -1)}</code>;
    const link = /^\[([^\]]+)\]\([^)]+\)$/.exec(part);
    return link ? <Fragment key={i}>{link[1]}</Fragment> : <Fragment key={i}>{part}</Fragment>;
  });
}

const cells = (line) => line.trim().replace(/^\|/, '').replace(/\|$/, '').split('|').map((c) => c.trim());

/** Turns the text into blocks: headings, paragraphs, lists, tables, quotes, code, lines. */
export function parseMarkdown(source) {
  const lines = String(source || '').split(/\r?\n/);
  const blocks = [];
  let i = 0;
  while (i < lines.length) {
    const line = lines[i];
    const heading = /^(#{1,4})\s+(.*)$/.exec(line);
    if (!line.trim()) { i += 1; continue; }
    if (line.startsWith('```')) {
      const code = [];
      i += 1;
      while (i < lines.length && !lines[i].startsWith('```')) { code.push(lines[i]); i += 1; }
      i += 1;
      blocks.push({ type: 'code', text: code.join('\n') });
    } else if (heading) {
      blocks.push({ type: 'h', level: heading[1].length, text: heading[2] });
      i += 1;
    } else if (/^-{3,}$/.test(line.trim())) {
      blocks.push({ type: 'hr' });
      i += 1;
    } else if (line.trim().startsWith('|')) {
      const rows = [];
      while (i < lines.length && lines[i].trim().startsWith('|')) { rows.push(lines[i]); i += 1; }
      const body = rows.filter((r) => r.replace(/[|\s:-]/g, '') !== ''); // drops the |---|---| line
      blocks.push({ type: 'table', head: cells(body[0]), rows: body.slice(1).map(cells) });
    } else if (/^\s*([-*]|\d+\.)\s+/.test(line)) {
      const ordered = /^\s*\d+\./.test(line);
      const items = [];
      while (i < lines.length && /^\s*([-*]|\d+\.)\s+/.test(lines[i])) { items.push(lines[i].replace(/^\s*([-*]|\d+\.)\s+(\[[ x]\]\s+)?/, '')); i += 1; }
      blocks.push({ type: 'list', ordered, items });
    } else if (line.startsWith('>')) {
      const quote = [];
      while (i < lines.length && lines[i].startsWith('>')) { quote.push(lines[i].replace(/^>\s?/, '')); i += 1; }
      blocks.push({ type: 'quote', text: quote.join(' ') });
    } else {
      const para = [];
      while (i < lines.length && lines[i].trim() && !/^(#{1,4}\s|```|>|\||\s*([-*]|\d+\.)\s+|-{3,}$)/.test(lines[i])) { para.push(lines[i].trim()); i += 1; }
      blocks.push({ type: 'p', text: para.join(' ') });
    }
  }
  return blocks;
}

/** `source` is the Markdown text. Headings start at level 2 because the screen has its own level-1 title. */
export default function Markdown({ source }) {
  return (
    <div className="markdown">
      {parseMarkdown(source).map((b, i) => {
        if (b.type === 'h') { const Tag = `h${Math.min(b.level + 1, 5)}`; return <Tag key={i}>{inline(b.text)}</Tag>; }
        if (b.type === 'p') return <p key={i}>{inline(b.text)}</p>;
        if (b.type === 'hr') return <hr key={i} />;
        if (b.type === 'quote') return <blockquote key={i}>{inline(b.text)}</blockquote>;
        if (b.type === 'code') return <pre key={i}><code>{b.text}</code></pre>;
        if (b.type === 'list') {
          const Tag = b.ordered ? 'ol' : 'ul';
          return <Tag key={i}>{b.items.map((item, j) => <li key={j}>{inline(item)}</li>)}</Tag>;
        }
        return (
          <div className="table-wrap" key={i}>
            <table>
              <thead><tr>{b.head.map((c, j) => <th key={j}>{inline(c)}</th>)}</tr></thead>
              <tbody>{b.rows.map((r, j) => <tr key={j}>{r.map((c, k) => <td key={k} data-label={b.head[k]}>{inline(c)}</td>)}</tr>)}</tbody>
            </table>
          </div>
        );
      })}
    </div>
  );
}

// The look of the employer emails: a header bar, the message in English then Hindi each with a button, and a footer. Plain JS, no imports.
// Everything that goes into the page is escaped, so nothing an employer typed can become HTML or a link.

const BLUE = '#1e5aa8';
const GREEN = '#17853b';
const INK = '#17212b';
const MUTED = '#526170';
const LINE = '#c9d6e4';
const FONT = "Inter,'Segoe UI',Roboto,'Noto Sans Devanagari','Noto Sans',Arial,sans-serif";

/** Makes a text safe to place inside HTML (also inside a quoted attribute). */
export const esc = (text) => String(text ?? '')
  .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;');

/** Only our own https links become buttons or footer links. */
const safeLink = (url, siteUrl) => (siteUrl.startsWith('https://') && String(url).startsWith(`${siteUrl}/`) ? esc(url) : '');

const button = (url, label, siteUrl) => {
  const href = safeLink(url, siteUrl);
  if (!href || !label) return '';
  return `<table role="presentation" cellpadding="0" cellspacing="0" style="margin:18px 0 4px"><tr><td style="background:${GREEN};border-radius:10px"><a href="${href}" style="display:inline-block;padding:14px 26px;font:700 16px ${FONT};color:#ffffff;text-decoration:none">${esc(label)}</a></td></tr></table>`;
};

const section = (s, siteUrl) => {
  const [head, ...rest] = s.lines;
  const paras = rest.map((line) => `<p style="margin:10px 0 0;font:400 16px/1.5 ${FONT};color:${INK}">${esc(line)}</p>`).join('');
  return `<tr><td lang="${s.lang}" style="padding:24px 28px 8px"><p style="margin:0;font:700 20px/1.35 ${FONT};color:${INK}">${esc(head)}</p>${paras}${button(s.url, s.button, siteUrl)}</td></tr>`;
};

/**
 * The whole email page. sections: [{ lang, lines, button, url }] (English first, then Hindi); footer: { en, hi, contact, details }.
 * `siteUrl` has no trailing slash; links that do not start with it are dropped.
 */
export function renderHtml({ sections, footer, siteUrl }) {
  const links = [[footer.contact, '/contact'], [footer.details, '/dashboard/profile']]
    .map(([label, path]) => { const href = safeLink(`${siteUrl}${path}`, siteUrl); return href ? `<a href="${href}" style="color:${BLUE};text-decoration:underline">${esc(label)}</a>` : ''; })
    .filter(Boolean).join(' &nbsp;|&nbsp; ');
  const body = sections.map((s) => section(s, siteUrl)).join(`<tr><td style="padding:0 28px"><hr style="border:0;border-top:1px solid ${LINE};margin:16px 0 0"></td></tr>`);
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Jobs Abroad</title></head>`
    + `<body style="margin:0;padding:0;background:#f5f8fc"><table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f5f8fc"><tr><td align="center" style="padding:20px 10px">`
    + `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:600px;background:#ffffff;border:1px solid ${LINE};border-radius:14px;overflow:hidden">`
    + `<tr><td style="background:${BLUE};padding:20px 28px"><span style="font:800 22px ${FONT};color:#ffffff">Jobs Abroad</span></td></tr>`
    + `${body}`
    + `<tr><td style="padding:22px 28px 26px;background:#f5f8fc;border-top:1px solid ${LINE}"><p style="margin:0;font:400 13px/1.5 ${FONT};color:${MUTED}">${esc(footer.en)}</p><p style="margin:8px 0 0;font:400 13px/1.5 ${FONT};color:${MUTED}">${esc(footer.hi)}</p><p style="margin:12px 0 0;font:400 13px ${FONT}">${links}</p></td></tr>`
    + `</table></td></tr></table></body></html>`;
}

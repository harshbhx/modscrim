/**
 * A small Markdown renderer with no dependencies, enough for docs/*.md:
 * headings, paragraphs, nested lists, tables, fenced code, block quotes, rules,
 * inline code, bold, italic and links. Raw HTML is escaped, never passed through.
 * Mermaid fences become a labelled figure that shows the diagram source.
 */
export const esc = (s) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

export const slugify = (s) =>
  s
    .toLowerCase()
    .replace(/`/g, '')
    .replace(/[^a-z0-9\s-]/g, '')
    .trim()
    .replace(/\s+/g, '-');

/** @param {(href: string) => string} mapLink rewrites a link target (repo-relative paths become site or GitHub URLs) */
function inline(src, mapLink) {
  const codes = [];
  let s = src.replace(/`([^`]+)`/g, (_, c) => {
    codes.push(c);
    return `\u0000${codes.length - 1}\u0000`;
  });
  s = esc(s);
  s = s.replace(/&lt;(https?:\/\/[^\s>]+)&gt;/g, (_, u) => `<a href="${u}">${u}</a>`);
  s = s.replace(/\[([^\]]+)\]\(([^)\s]+)\)/g, (_, text, href) => `<a href="${esc(mapLink(href.replace(/&amp;/g, '&')))}">${text}</a>`);
  s = s.replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>');
  s = s.replace(/(^|[\s(])\*([^*\s][^*]*)\*(?=[\s).,;:]|$)/g, '$1<em>$2</em>');
  return s.replace(/\u0000(\d+)\u0000/g, (_, i) => `<code>${esc(codes[Number(i)])}</code>`);
}

const cells = (line) =>
  line
    .trim()
    .replace(/^\||\|$/g, '')
    .split(/(?<!\\)\|/)
    .map((c) => c.trim().replace(/\\\|/g, '|'));

/**
 * @param {string} md
 * @param {{ mapLink?: (href: string) => string, headingOffset?: number }} [opts]
 * @returns {{ html: string, headings: { level: number, text: string, id: string }[] }}
 */
export function render(md, opts = {}) {
  const mapLink = opts.mapLink ?? ((h) => h);
  const lines = md.replace(/\r\n/g, '\n').split('\n');
  const out = [];
  const headings = [];
  const used = new Set();
  let i = 0;

  const para = [];
  const flush = () => {
    if (para.length) out.push(`<p>${inline(para.join(' '), mapLink)}</p>`);
    para.length = 0;
  };

  function list(start, indent) {
    // returns [html, nextIndex] for a list whose items sit at `indent` spaces
    const first = lines[start].slice(indent);
    const ordered = /^\d+\.\s/.test(first);
    const tag = ordered ? 'ol' : 'ul';
    const items = [];
    let n = start;
    while (n < lines.length) {
      const l = lines[n];
      const m = l.match(/^(\s*)([-*]|\d+\.)\s+(.*)$/);
      if (m && m[1].length === indent) {
        const item = { text: [m[3]], children: [] };
        n += 1;
        while (n < lines.length) {
          const nl = lines[n];
          const nm = nl.match(/^(\s*)([-*]|\d+\.)\s+/);
          if (nm && nm[1].length > indent) {
            const [h, next] = list(n, nm[1].length);
            item.children.push(h);
            n = next;
          } else if (nl.trim() && !nm && /^\s{2,}\S/.test(nl) && nl.search(/\S/) > indent) {
            item.text.push(nl.trim());
            n += 1;
          } else break;
        }
        items.push(item);
      } else break;
    }
    const html = `<${tag}>${items.map((it) => `<li>${inline(it.text.join(' '), mapLink)}${it.children.join('')}</li>`).join('')}</${tag}>`;
    return [html, n];
  }

  while (i < lines.length) {
    const line = lines[i];
    if (!line.trim()) {
      flush();
      i += 1;
      continue;
    }
    const fence = line.match(/^```(\w*)\s*$/);
    if (fence) {
      flush();
      const body = [];
      i += 1;
      while (i < lines.length && !/^```\s*$/.test(lines[i])) body.push(lines[i++]);
      i += 1;
      const code = esc(body.join('\n'));
      if (fence[1] === 'mermaid') {
        out.push(`<figure class="diagram"><figcaption>Diagram (Mermaid source)</figcaption><pre><code>${code}</code></pre></figure>`);
      } else {
        out.push(`<pre${fence[1] ? ` data-lang="${fence[1]}"` : ''}><code>${code}</code></pre>`);
      }
      continue;
    }
    const h = line.match(/^(#{1,4})\s+(.*)$/);
    if (h) {
      flush();
      const level = Math.min(6, h[1].length + (opts.headingOffset ?? 0));
      const text = h[2].replace(/`/g, '').replace(/\[([^\]]+)\]\([^)]*\)/g, '$1');
      let id = slugify(h[2]);
      while (used.has(id)) id += '-2';
      used.add(id);
      headings.push({ level, text, id });
      out.push(`<h${level} id="${id}">${inline(h[2], mapLink)}</h${level}>`);
      i += 1;
      continue;
    }
    if (/^---+\s*$/.test(line)) {
      flush();
      out.push('<hr>');
      i += 1;
      continue;
    }
    if (line.startsWith('>')) {
      flush();
      const q = [];
      while (i < lines.length && lines[i].startsWith('>')) q.push(lines[i++].replace(/^>\s?/, ''));
      out.push(`<blockquote>${render(q.join('\n'), opts).html}</blockquote>`);
      continue;
    }
    if (line.includes('|') && i + 1 < lines.length && /^\s*\|?\s*:?-{3,}:?\s*(\|\s*:?-{3,}:?\s*)*\|?\s*$/.test(lines[i + 1])) {
      flush();
      const head = cells(line);
      i += 2;
      const rows = [];
      while (i < lines.length && lines[i].includes('|') && lines[i].trim()) rows.push(cells(lines[i++]));
      out.push(
        `<div class="tbl-wrap"><table class="tbl"><thead><tr>${head.map((c) => `<th>${inline(c, mapLink)}</th>`).join('')}</tr></thead><tbody>${rows
          .map((r) => `<tr>${r.map((c) => `<td>${inline(c, mapLink)}</td>`).join('')}</tr>`)
          .join('')}</tbody></table></div>`
      );
      continue;
    }
    if (/^\s*([-*]|\d+\.)\s+/.test(line)) {
      flush();
      const [html, next] = list(i, line.search(/\S/));
      out.push(html);
      i = next;
      continue;
    }
    para.push(line.trim());
    i += 1;
  }
  flush();
  return { html: out.join('\n'), headings };
}

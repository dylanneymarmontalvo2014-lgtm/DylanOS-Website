(function initWikiCore(root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  if (root) root.DylanOSWikiCore = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function createWikiCore() {
  'use strict';

  const RAW_WIKI_BASE = 'https://raw.githubusercontent.com/wiki/dylanneymarmontalvo2014-lgtm/DylanOS';

  function escapeHtml(value) {
    return String(value)
      .replaceAll('&', '&amp;')
      .replaceAll('<', '&lt;')
      .replaceAll('>', '&gt;')
      .replaceAll('"', '&quot;')
      .replaceAll("'", '&#39;');
  }

  function normalizePageSlug(value) {
    let slug = String(value || '').trim();
    try {
      slug = decodeURIComponent(slug);
    } catch {
      return 'Home';
    }
    slug = slug.replace(/\.md$/i, '').replace(/\s+/g, '-');
    if (!slug || slug.length > 120) return 'Home';
    if (slug.includes('..') || /[\\/:?#]/.test(slug) || slug.startsWith('.')) return 'Home';
    if (!/^[\p{L}\p{N}._-]+$/u.test(slug)) return 'Home';
    return slug;
  }

  function pageHash(value) {
    return `#/${encodeURIComponent(normalizePageSlug(value))}`;
  }

  function githubWikiPageUrl(value, version) {
    const slug = normalizePageSlug(value);
    const suffix = version ? `?v=${encodeURIComponent(version)}` : '';
    return `${RAW_WIKI_BASE}/${encodeURIComponent(slug)}.md${suffix}`;
  }

  function parseWikiLink(value) {
    const match = String(value || '').match(/\[\[([^|\]]+?)(?:\|([^\]]+?))?\]\]/);
    if (!match) return null;
    return {
      title: match[1].trim(),
      slug: normalizePageSlug((match[2] || match[1]).trim())
    };
  }

  function parseSidebar(markdown) {
    const sections = [];
    let current = null;
    for (const line of String(markdown || '').split(/\r?\n/)) {
      const heading = line.match(/^###\s+(.+?)\s*$/);
      if (heading) {
        current = { title: heading[1].trim(), pages: [] };
        sections.push(current);
        continue;
      }
      const link = parseWikiLink(line);
      if (!link) continue;
      const isListItem = /^\s*-\s+/.test(line);
      if (!current && link.slug === 'Home') {
        sections.push({ title: 'Inicio', pages: [link] });
        continue;
      }
      if (isListItem && current) current.pages.push(link);
    }
    return sections.filter(section => section.pages.length > 0);
  }

  function headingId(value) {
    return String(value || '')
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .toLowerCase()
      .replace(/<[^>]+>/g, '')
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '') || 'seccion';
  }

  function safeMarkdownHref(value) {
    const href = String(value || '').trim();
    if (/^https?:\/\//i.test(href) || href.startsWith('#')) return href;
    return pageHash(href.replace(/^\.\//, ''));
  }

  function renderInline(value) {
    const placeholders = [];
    const keep = html => {
      const token = `\u0000${placeholders.length}\u0000`;
      placeholders.push(html);
      return token;
    };
    let text = String(value || '').replace(/`([^`]+)`/g, (_, code) => keep(`<code>${escapeHtml(code)}</code>`));
    text = escapeHtml(text);
    text = text.replace(/!\[([^\]]*)\]\(([^)\s]+)(?:\s+"[^"]*")?\)/g, (_, alt, src) => {
      if (!/^https?:\/\//i.test(src) && !src.startsWith('/')) return escapeHtml(alt);
      return `<img src="${escapeHtml(src)}" alt="${escapeHtml(alt)}" loading="lazy">`;
    });
    text = text.replace(/\[\[([^|\]]+?)(?:\|([^\]]+?))?\]\]/g, (_, label, slug) => {
      return `<a href="${pageHash(slug || label)}" data-wiki-link>${label.trim()}</a>`;
    });
    text = text.replace(/\[([^\]]+)\]\(([^)]+)\)/g, (_, label, href) => {
      return `<a href="${escapeHtml(safeMarkdownHref(href))}">${label}</a>`;
    });
    text = text.replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>');
    text = text.replace(/__([^_]+)__/g, '<strong>$1</strong>');
    text = text.replace(/(?<!\*)\*([^*]+)\*(?!\*)/g, '<em>$1</em>');
    text = text.replace(/\u0000(\d+)\u0000/g, (_, index) => placeholders[Number(index)]);
    return text;
  }

  function renderMarkdown(markdown) {
    const lines = String(markdown || '').replace(/\r\n?/g, '\n').split('\n');
    const output = [];
    let paragraph = [];
    let listType = null;
    let callout = null;
    let inCode = false;
    let codeLanguage = '';
    let codeLines = [];
    let rawBlockTag = null;
    let rawBlockDepth = 0;

    function closeParagraph() {
      if (!paragraph.length) return;
      output.push(`<p>${renderInline(paragraph.join(' '))}</p>`);
      paragraph = [];
    }

    function closeList() {
      if (!listType) return;
      output.push(`</${listType}>`);
      listType = null;
    }

    function closeCallout() {
      if (!callout) return;
      output.push('</div></aside>');
      callout = null;
    }

    function closeBlocks() {
      closeParagraph();
      closeList();
      closeCallout();
    }

    for (let index = 0; index < lines.length; index += 1) {
      const line = lines[index];

      if (rawBlockTag) {
        output.push(line);
        const openPattern = new RegExp(`<${rawBlockTag}(?:\\s|>)`, 'gi');
        const closePattern = new RegExp(`</${rawBlockTag}>`, 'gi');
        rawBlockDepth += (line.match(openPattern) || []).length;
        rawBlockDepth -= (line.match(closePattern) || []).length;
        if (rawBlockDepth <= 0) {
          rawBlockTag = null;
          rawBlockDepth = 0;
        }
        continue;
      }

      if (inCode) {
        if (/^```/.test(line)) {
          output.push(`<pre><code class="language-${escapeHtml(codeLanguage)}">${escapeHtml(codeLines.join('\n'))}</code></pre>`);
          inCode = false;
          codeLanguage = '';
          codeLines = [];
        } else {
          codeLines.push(line);
        }
        continue;
      }

      const fence = line.match(/^```\s*([\w-]*)/);
      if (fence) {
        closeBlocks();
        inCode = true;
        codeLanguage = fence[1] || 'text';
        continue;
      }

      if (!line.trim()) {
        closeBlocks();
        continue;
      }

      const calloutStart = line.match(/^>\s*\[!([A-Z]+)\]\s*$/);
      if (calloutStart) {
        closeBlocks();
        const type = calloutStart[1].toLowerCase();
        const label = type === 'important' ? 'Importante' : type === 'warning' || type === 'caution' ? 'Atención' : type === 'tip' ? 'Consejo' : 'Nota';
        callout = type;
        output.push(`<aside class="docs-callout docs-callout--${escapeHtml(type)}"><strong>${label}</strong><div>`);
        continue;
      }

      const quote = line.match(/^>\s?(.*)$/);
      if (quote && callout) {
        output.push(`<p>${renderInline(quote[1])}</p>`);
        continue;
      }
      if (quote) {
        closeBlocks();
        output.push(`<blockquote>${renderInline(quote[1])}</blockquote>`);
        continue;
      }

      if (/^\s*</.test(line)) {
        closeBlocks();
        const rawLine = line.trim();
        output.push(rawLine);
        const blockStart = rawLine.match(/^<(p|div|table|section|article|header|footer|nav|aside)(?:\s|>)/i);
        if (blockStart && !rawLine.includes(`</${blockStart[1]}>`) && !rawLine.endsWith('/>')) {
          rawBlockTag = blockStart[1].toLowerCase();
          const openPattern = new RegExp(`<${rawBlockTag}(?:\\s|>)`, 'gi');
          const closePattern = new RegExp(`</${rawBlockTag}>`, 'gi');
          rawBlockDepth = (rawLine.match(openPattern) || []).length - (rawLine.match(closePattern) || []).length;
        }
        continue;
      }

      const heading = line.match(/^(#{1,6})\s+(.+?)\s*#*$/);
      if (heading) {
        closeBlocks();
        const level = heading[1].length;
        const text = renderInline(heading[2]);
        output.push(`<h${level} id="${headingId(heading[2])}">${text}</h${level}>`);
        continue;
      }

      if (/^\s*([-*_])(?:\s*\1){2,}\s*$/.test(line)) {
        closeBlocks();
        output.push('<hr>');
        continue;
      }

      if (/^\s*\|.*\|\s*$/.test(line) && index + 1 < lines.length && /^\s*\|?\s*:?-{3,}/.test(lines[index + 1])) {
        closeBlocks();
        const rows = [];
        const parseRow = row => row.trim().replace(/^\||\|$/g, '').split('|').map(cell => cell.trim());
        const headers = parseRow(line);
        index += 2;
        while (index < lines.length && /^\s*\|.*\|\s*$/.test(lines[index])) {
          rows.push(parseRow(lines[index]));
          index += 1;
        }
        index -= 1;
        output.push('<div class="docs-table-wrap"><table><thead><tr>');
        headers.forEach(cell => output.push(`<th>${renderInline(cell)}</th>`));
        output.push('</tr></thead><tbody>');
        rows.forEach(row => {
          output.push('<tr>');
          row.forEach(cell => output.push(`<td>${renderInline(cell)}</td>`));
          output.push('</tr>');
        });
        output.push('</tbody></table></div>');
        continue;
      }

      const unordered = line.match(/^\s*[-+*]\s+(.+)$/);
      const ordered = line.match(/^\s*\d+[.)]\s+(.+)$/);
      if (unordered || ordered) {
        closeParagraph();
        closeCallout();
        const desired = unordered ? 'ul' : 'ol';
        if (listType !== desired) {
          closeList();
          listType = desired;
          output.push(`<${listType}>`);
        }
        output.push(`<li>${renderInline((unordered || ordered)[1])}</li>`);
        continue;
      }

      if (listType) closeList();
      paragraph.push(line.trim());
    }

    if (inCode) output.push(`<pre><code class="language-${escapeHtml(codeLanguage || 'text')}">${escapeHtml(codeLines.join('\n'))}</code></pre>`);
    closeBlocks();
    return output.join('\n');
  }

  function extractSearchText(markdown) {
    return String(markdown || '')
      .replace(/```[\s\S]*?```/g, block => block.replace(/```\w*|```/g, ' '))
      .replace(/\[\[([^|\]]+?)(?:\|[^\]]+)?\]\]/g, '$1')
      .replace(/!\[([^\]]*)\]\([^)]+\)/g, '$1')
      .replace(/\[([^\]]+)\]\([^)]+\)/g, '$1')
      .replace(/<[^>]+>/g, ' ')
      .replace(/^[#>*+-]+\s*/gm, '')
      .replace(/[*_`|]/g, '')
      .replace(/\s+/g, ' ')
      .trim();
  }

  return {
    RAW_WIKI_BASE,
    normalizePageSlug,
    pageHash,
    githubWikiPageUrl,
    parseSidebar,
    renderMarkdown,
    extractSearchText
  };
});

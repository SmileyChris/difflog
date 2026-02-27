function escapeHtml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function isSafeUrl(url: string): boolean {
  const trimmed = url.trim().toLowerCase();
  // Only allow http, https, and relative URLs
  return trimmed.startsWith('http://') ||
         trimmed.startsWith('https://') ||
         trimmed.startsWith('/') ||
         trimmed.startsWith('#') ||
         (!trimmed.includes(':') && !trimmed.startsWith('//'));
}

function parseInline(text: string): string {
  // Process bold, links, and inline code
  let result = '';
  // Link pattern allows one level of nested brackets (e.g., [Title [pdf]](url))
  const regex = /(\*\*|__)(.+?)\1|\[((?:[^\[\]]|\[[^\]]*\])*)\]\(([^)]+)\)|`([^`]+)`/g;
  let lastIndex = 0;
  let match: RegExpExecArray | null;

  while ((match = regex.exec(text)) !== null) {
    if (match.index > lastIndex) {
      result += escapeHtml(text.slice(lastIndex, match.index));
    }

    if (match[1]) {
      // Bold - recursive parse
      result += `<strong class="md-bold">${parseInline(match[2])}</strong>`;
    } else if (match[3]) {
      // Link - recursive parse for text, validate URL to prevent javascript: XSS
      const url = match[4];
      if (isSafeUrl(url)) {
        result += `<a class="md-link" href="${escapeHtml(url)}" target="_blank" rel="noopener noreferrer">${parseInline(match[3])} \u2197</a>`;
      } else {
        // Render as plain text if URL is suspicious
        result += `${parseInline(match[3])}`;
      }
    } else if (match[5]) {
      // Inline code
      result += `<code class="md-code">${escapeHtml(match[5])}</code>`;
    }

    lastIndex = match.index + match[0].length;
  }

  if (lastIndex < text.length) {
    result += escapeHtml(text.slice(lastIndex));
  }

  // Post-process: wrap score patterns like "(100 <a>HN</a> pts)" in <small>
  result = wrapScorePatterns(result);

  return result || escapeHtml(text);
}

function wrapScorePatterns(html: string): string {
  // Match various score patterns Claude might output:
  // - "(100 pts on HN)" or "(100 pts on r/rust)"
  // - "(100 HN pts)" or "(12 Dev.to pts)" or "(50 r/javascript pts)"
  // - "(100 pts)"
  // - "(500 stars on JavaScript GitHub)" or "(1289 stars, Python GitHub)"
  // - "(100 [HN](url) pts)" -> "(100 <a>HN ↗</a> pts)" after link parsing
  return html
    .replace(/\((\d+)\s+pts\s+on\s+([^)]+)\)/gi, '<small class="md-score">($1 pts on $2)</small>')
    .replace(/\((\d+)\s+([\w.\/]+)\s+pts\)/gi, '<small class="md-score">($1 $2 pts)</small>')
    .replace(/\((\d+)\s+pts\)/gi, '<small class="md-score">($1 pts)</small>')
    .replace(/\((\d+)\s+stars[,\s]+([^)]+)\)/gi, '<small class="md-score">($1 stars, $2)</small>')
    .replace(/\((\d+)\s+stars\)/gi, '<small class="md-score">($1 stars)</small>')
    .replace(
      /\((\d+\s+)(<a[^>]+>)([^<]*)\s*↗(<\/a>)(\s+pts)?\)/g,
      (_, num, openTag, text, closeTag, pts) =>
        `<small class="md-score">(${num}${openTag}${text}${closeTag}${pts || ''})</small>`
    );
}

interface Block {
  type: 'h1' | 'h2' | 'h3' | 'hr' | 'list' | 'paragraph';
  content?: string;
  items?: string[];
}

function preprocessContent(text: string): string {
  return text
    .split('\n')
    .filter(line => {
      const trimmed = line.trim();
      if (/^[-*\u2022.]+$/.test(trimmed)) return false;
      return true;
    })
    .join('\n');
}

export function parseBlocks(text: string): Block[] {
  const cleaned = preprocessContent(text);
  const lines = cleaned.split('\n');
  const blocks: Block[] = [];
  let currentBlock: Block | null = null;
  let i = 0;

  while (i < lines.length) {
    const line = lines[i];
    const trimmed = line.trim();

    if (trimmed === '') {
      if (currentBlock) {
        blocks.push(currentBlock);
        currentBlock = null;
      }
      i++;
      continue;
    }

    if (/^[-*\u2022.]+$/.test(trimmed)) {
      i++;
      continue;
    }

    // Horizontal rule
    if (/^(-{3,}|\*{3,}|_{3,})$/.test(trimmed)) {
      if (currentBlock) {
        blocks.push(currentBlock);
        currentBlock = null;
      }
      blocks.push({ type: 'hr' });
      i++;
      continue;
    }

    // Headers
    const headerMatch = trimmed.match(/^(#{1,3})\s+(.+)$/);
    if (headerMatch) {
      if (currentBlock) {
        blocks.push(currentBlock);
        currentBlock = null;
      }
      blocks.push({
        type: `h${headerMatch[1].length}` as 'h1' | 'h2' | 'h3',
        content: headerMatch[2]
      });
      i++;
      continue;
    }

    // List items
    const listMatch = trimmed.match(/^[-*\u2022]\s+(.+)$/);
    if (listMatch) {
      if (currentBlock && currentBlock.type !== 'list') {
        blocks.push(currentBlock);
        currentBlock = null;
      }
      if (!currentBlock) {
        currentBlock = { type: 'list', items: [] };
      }

      let itemContent = listMatch[1];
      i++;

      while (i < lines.length) {
        const nextLine = lines[i];
        const nextTrimmed = nextLine.trim();

        // Skip blank lines but peek ahead for continuation
        if (nextTrimmed === '') {
          let peek = i + 1;
          while (peek < lines.length && lines[peek].trim() === '') peek++;
          if (peek >= lines.length) break;
          const peekTrimmed = lines[peek].trim();
          // If next non-empty line is a new item, header, or rule, stop
          if (/^[-*\u2022]\s/.test(peekTrimmed) ||
            /^#{1,3}\s/.test(peekTrimmed) ||
            /^(-{3,}|\*{3,}|_{3,})$/.test(peekTrimmed)) {
            break;
          }
          // Otherwise it's continuation — skip the blank lines
          i = peek;
          itemContent += ' ' + lines[i].trim();
          i++;
          continue;
        }

        if (/^[-*\u2022]\s/.test(nextTrimmed) ||
          /^#{1,3}\s/.test(nextTrimmed) ||
          /^(-{3,}|\*{3,}|_{3,})$/.test(nextTrimmed) ||
          /^[-*\u2022.]+$/.test(nextTrimmed)) {
          break;
        }
        itemContent += ' ' + nextTrimmed;
        i++;
      }

      currentBlock.items!.push(itemContent);
      continue;
    }

    // Paragraph
    if (currentBlock && currentBlock.type !== 'paragraph') {
      blocks.push(currentBlock);
      currentBlock = null;
    }
    if (!currentBlock) {
      currentBlock = { type: 'paragraph', content: '' };
    }
    currentBlock.content = (currentBlock.content ? currentBlock.content + ' ' : '') + trimmed;
    i++;
  }

  if (currentBlock) {
    blocks.push(currentBlock);
  }

  return blocks;
}

export interface Citation {
  url: string;
  title: string;
}

export function renderMarkdown(text: string, citations?: Citation[]): string {
  if (!text) return '';

  const blocks = parseBlocks(text);
  let html = '';
  let pIndex = 0;
  let inSection = false;

  for (const block of blocks) {
    switch (block.type) {
      case 'h1':
        if (inSection) { html += `</div>\n</details>\n`; inSection = false; }
        html += `<h1 class="md-h1">${parseInline(block.content!)}</h1>\n`;
        break;
      case 'h2':
        if (inSection) html += `</div>\n</details>\n`;
        html += `<details class="md-section" open>\n`;
        html += `<summary class="md-h2">${parseInline(block.content!)}</summary>\n`;
        html += `<div class="md-section-content">\n`;
        inSection = true;
        break;
      case 'h3':
        html += `<h3 class="md-h3">${parseInline(block.content!)}</h3>\n`;
        break;
      case 'hr':
        html += `<hr class="md-hr" />\n`;
        break;
      case 'list':
        html += `<ul class="md-list">\n`;
        for (const item of block.items!) {
          html += `  <li class="md-list-item" data-p="${pIndex++}">${parseInline(item)}</li>\n`;
        }
        html += `</ul>\n`;
        break;
      case 'paragraph':
        html += `<p class="md-p" data-p="${pIndex++}">${parseInline(block.content!)}</p>\n`;
        break;
    }
  }

  if (inSection) {
    html += `</div>\n</details>\n`;
  }

  if (citations && citations.length > 0) {
    // Deduplicate by URL
    const seen = new Set<string>();
    const unique: Citation[] = [];
    for (const c of citations) {
      if (!seen.has(c.url)) {
        seen.add(c.url);
        unique.push(c);
      }
    }

    html += `<div class="md-sources">\n`;
    html += `  <h3 class="md-h3">Sources</h3>\n`;
    html += `  <ol class="md-sources-list">\n`;
    for (const citation of unique) {
      if (isSafeUrl(citation.url)) {
        html += `    <li class="md-source-item"><a class="md-link" href="${escapeHtml(citation.url)}" target="_blank" rel="noopener noreferrer">${escapeHtml(citation.title || citation.url)}</a></li>\n`;
      } else {
        html += `    <li class="md-source-item">${escapeHtml(citation.title || citation.url)}</li>\n`;
      }
    }
    html += `  </ol>\n`;
    html += `</div>\n`;
  }

  return html;
}

function escapeHtml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function parseInline(text: string): string {
  // Process bold, links, and inline code
  let result = '';
  const regex = /(\*\*|__)(.+?)\1|\[([^\]]+)\]\(([^)]+)\)|`([^`]+)`/g;
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
      // Link - recursive parse for text, but keeping URL escaped
      result += `<a class="md-link" href="${escapeHtml(match[4])}" target="_blank" rel="noopener noreferrer">${parseInline(match[3])} \u2197</a>`;
    } else if (match[5]) {
      // Inline code
      result += `<code class="md-code">${escapeHtml(match[5])}</code>`;
    }

    lastIndex = match.index + match[0].length;
  }

  if (lastIndex < text.length) {
    result += escapeHtml(text.slice(lastIndex));
  }

  return result || escapeHtml(text);
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

function parseBlocks(text: string): Block[] {
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

  for (const block of blocks) {
    switch (block.type) {
      case 'h1':
        html += `<h1 class="md-h1">${parseInline(block.content!)}</h1>\n`;
        break;
      case 'h2':
        html += `<h2 class="md-h2">${parseInline(block.content!)}</h2>\n`;
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
      html += `    <li class="md-source-item"><a class="md-link" href="${escapeHtml(citation.url)}" target="_blank" rel="noopener noreferrer">${escapeHtml(citation.title || citation.url)}</a></li>\n`;
    }
    html += `  </ol>\n`;
    html += `</div>\n`;
  }

  return html;
}

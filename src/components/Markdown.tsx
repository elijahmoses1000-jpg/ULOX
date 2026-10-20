import React from 'react';

/**
 * Small, deliberate markdown renderer for roadmap.sh lesson content.
 * Builds React elements rather than injecting HTML, so upstream content can
 * never execute in the page.
 */

function inline(text: string, keyPrefix: string): React.ReactNode[] {
  const out: React.ReactNode[] = [];
  // links, bold, inline code
  const pattern = /(\[[^\]]+\]\((https?:\/\/[^)\s]+)\))|(\*\*[^*]+\*\*)|(`[^`]+`)/g;
  let last = 0;
  let match: RegExpExecArray | null;
  let i = 0;

  while ((match = pattern.exec(text)) !== null) {
    if (match.index > last) out.push(text.slice(last, match.index));
    const token = match[0];
    const key = `${keyPrefix}-${i++}`;

    if (token.startsWith('[')) {
      const label = token.slice(1, token.indexOf(']'));
      const href = match[2];
      out.push(
        <a key={key} href={href} target="_blank" rel="noreferrer noopener" className="link">
          {label}
        </a>
      );
    } else if (token.startsWith('**')) {
      out.push(
        <strong key={key} className="font-bold text-chalk">
          {token.slice(2, -2)}
        </strong>
      );
    } else {
      out.push(
        <code key={key} className="px-1 py-0.5 rounded bg-ink-900 border border-ink-700 font-mono text-[0.9em]">
          {token.slice(1, -1)}
        </code>
      );
    }
    last = match.index + token.length;
  }
  if (last < text.length) out.push(text.slice(last));
  return out;
}

export function Markdown({ source }: { source: string }) {
  const lines = source.replace(/\r\n/g, '\n').split('\n');
  const blocks: React.ReactNode[] = [];
  let list: string[] = [];
  let paragraph: string[] = [];
  let inFence = false;
  let fence: string[] = [];

  const flushParagraph = () => {
    if (!paragraph.length) return;
    const text = paragraph.join(' ').trim();
    paragraph = [];
    if (text) {
      blocks.push(
        <p key={`p${blocks.length}`} className="text-[13.5px] leading-relaxed text-chalk-dim">
          {inline(text, `p${blocks.length}`)}
        </p>
      );
    }
  };

  const flushList = () => {
    if (!list.length) return;
    const items = list;
    list = [];
    blocks.push(
      <ul key={`u${blocks.length}`} className="space-y-1.5 pl-4 list-disc marker:text-brand">
        {items.map((item, i) => (
          <li key={i} className="text-[13.5px] leading-relaxed text-chalk-dim">
            {inline(item, `u${blocks.length}-${i}`)}
          </li>
        ))}
      </ul>
    );
  };

  for (const raw of lines) {
    const line = raw.trimEnd();

    if (line.trim().startsWith('```')) {
      if (inFence) {
        const code = fence.join('\n');
        fence = [];
        inFence = false;
        blocks.push(
          <pre
            key={`c${blocks.length}`}
            className="p-3 rounded-lg bg-ink-900 border border-ink-700 overflow-x-auto text-[12px] font-mono text-chalk"
          >
            <code>{code}</code>
          </pre>
        );
      } else {
        flushParagraph();
        flushList();
        inFence = true;
      }
      continue;
    }
    if (inFence) {
      fence.push(raw);
      continue;
    }

    const heading = /^(#{1,4})\s+(.*)$/.exec(line);
    if (heading) {
      flushParagraph();
      flushList();
      const level = heading[1].length;
      const size = level === 1 ? 'text-[17px]' : level === 2 ? 'text-[15px]' : 'text-[13.5px]';
      blocks.push(
        <p key={`h${blocks.length}`} className={`${size} font-bold text-chalk ${blocks.length ? 'mt-4' : ''}`}>
          {inline(heading[2], `h${blocks.length}`)}
        </p>
      );
      continue;
    }

    const bullet = /^\s*[-*+]\s+(.*)$/.exec(line);
    if (bullet) {
      flushParagraph();
      list.push(bullet[1]);
      continue;
    }

    if (!line.trim()) {
      flushParagraph();
      flushList();
      continue;
    }

    flushList();
    paragraph.push(line.trim());
  }

  flushParagraph();
  flushList();

  return <div className="space-y-2.5">{blocks}</div>;
}

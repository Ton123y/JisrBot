import React, { useState } from 'react';
import { Check, Copy } from 'lucide-react';

interface MarkdownRendererProps {
  content: string;
}

function isSafeHttpUrl(url: string): boolean {
  try {
    const parsed = new URL(url);
    return parsed.protocol === 'http:' || parsed.protocol === 'https:';
  } catch {
    return false;
  }
}

function renderInline(text: string, keyPrefix: string): React.ReactNode[] {
  // Match inline code, bold, italic, or markdown links
  const tokenRegex = /(`[^`]+`|\*\*[^*]+\*\*|\*[^*]+\*|\[[^\]]+\]\([^)]+\))/g;
  const parts: React.ReactNode[] = [];
  let lastIndex = 0;
  let match: RegExpExecArray | null;
  let idx = 0;

  while ((match = tokenRegex.exec(text)) !== null) {
    if (match.index > lastIndex) {
      parts.push(text.slice(lastIndex, match.index));
    }
    const token = match[0];
    const k = `${keyPrefix}_${idx++}`;

    if (token.startsWith('`') && token.endsWith('`')) {
      parts.push(
        <code
          key={k}
          dir="ltr"
          className="px-1.5 py-0.5 mx-0.5 rounded bg-white/10 text-amber-200 font-mono-tech text-[13px]"
        >
          {token.slice(1, -1)}
        </code>
      );
    } else if (token.startsWith('**') && token.endsWith('**')) {
      parts.push(
        <strong key={k} className="font-bold text-slate-50">
          {token.slice(2, -2)}
        </strong>
      );
    } else if (token.startsWith('*') && token.endsWith('*')) {
      parts.push(
        <em key={k} className="italic text-slate-200">
          {token.slice(1, -1)}
        </em>
      );
    } else if (token.startsWith('[')) {
      const linkMatch = /^\[([^\]]+)\]\(([^)]+)\)$/.exec(token);
      if (linkMatch && isSafeHttpUrl(linkMatch[2])) {
        parts.push(
          <a
            key={k}
            href={linkMatch[2]}
            target="_blank"
            rel="noopener noreferrer"
            className="text-amber-300 underline underline-offset-4 hover:text-amber-200"
          >
            {linkMatch[1]}
          </a>
        );
      } else {
        parts.push(token);
      }
    }
    lastIndex = match.index + token.length;
  }

  if (lastIndex < text.length) {
    parts.push(text.slice(lastIndex));
  }
  return parts;
}

const CodeBlock: React.FC<{ language: string; code: string }> = ({ language, code }) => {
  const [copied, setCopied] = useState(false);

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(code);
      setCopied(true);
      setTimeout(() => setCopied(false), 1800);
    } catch {
      try {
        const ta = document.createElement('textarea');
        ta.value = code;
        ta.setAttribute('readonly', '');
        ta.style.position = 'fixed';
        ta.style.opacity = '0';
        document.body.appendChild(ta);
        ta.select();
        if (document.execCommand('copy')) {
          setCopied(true);
          setTimeout(() => setCopied(false), 1800);
        }
        document.body.removeChild(ta);
      } catch {
        // ignore
      }
    }
  };

  return (
    <div dir="ltr" className="my-3 rounded-xl overflow-hidden border border-white/10 bg-[#0D0E11]">
      <div className="px-3.5 py-2 bg-[#17191E] border-b border-white/8 flex items-center justify-between text-xs text-slate-400">
        <span className="font-mono-tech">{language || 'code'}</span>
        <button
          type="button"
          onClick={handleCopy}
          className="inline-flex items-center gap-1.5 text-slate-300 hover:text-white transition-colors whitespace-nowrap"
        >
          {copied ? <Check className="w-3.5 h-3.5 text-teal-400" /> : <Copy className="w-3.5 h-3.5" />}
          <span>{copied ? 'تم النسخ' : 'نسخ'}</span>
        </button>
      </div>
      <pre className="p-3.5 overflow-x-auto text-[13px] leading-relaxed font-mono-tech text-slate-200">
        <code>{code}</code>
      </pre>
    </div>
  );
};

export const MarkdownRenderer: React.FC<MarkdownRendererProps> = ({ content }) => {
  // Split into fenced code blocks and prose blocks
  const segments = content.split(/(```[\s\S]*?```)/g);

  return (
    <div className="space-y-2.5 text-[15px] leading-[1.75] text-slate-200 break-words">
      {segments.map((segment, segIdx) => {
        if (!segment) return null;

        if (segment.startsWith('```') && segment.endsWith('```')) {
          const inner = segment.slice(3, -3);
          const firstNewline = inner.indexOf('\n');
          const lang = firstNewline >= 0 ? inner.slice(0, firstNewline).trim() : '';
          const code = firstNewline >= 0 ? inner.slice(firstNewline + 1).replace(/\n$/, '') : inner;
          return <CodeBlock key={`code_${segIdx}`} language={lang} code={code} />;
        }

        const lines = segment.split('\n');
        const blocks: React.ReactNode[] = [];
        let listItems: { ordered: boolean; items: string[] } | null = null;

        const flushList = (keyBase: string) => {
          if (!listItems) return;
          const Tag = listItems.ordered ? 'ol' : 'ul';
          blocks.push(
            <Tag
              key={keyBase}
              className={`my-2 space-y-1.5 ps-5 ${
                listItems.ordered ? 'list-decimal' : 'list-disc'
              } marker:text-slate-400`}
            >
              {listItems.items.map((item, i) => (
                <li key={`${keyBase}_${i}`}>{renderInline(item, `${keyBase}_${i}`)}</li>
              ))}
            </Tag>
          );
          listItems = null;
        };

        lines.forEach((rawLine, lineIdx) => {
          const line = rawLine.trimEnd();
          const trimmed = line.trim();
          const key = `p_${segIdx}_${lineIdx}`;

          if (!trimmed) {
            flushList(`${key}_fl`);
            return;
          }

          if (/^---+$/.test(trimmed)) {
            flushList(`${key}_fl`);
            blocks.push(<hr key={key} className="my-3 border-white/10" />);
            return;
          }

          const h3 = /^###\s+(.+)$/.exec(trimmed);
          const h2 = /^##\s+(.+)$/.exec(trimmed);
          const h1 = /^#\s+(.+)$/.exec(trimmed);
          if (h1 || h2 || h3) {
            flushList(`${key}_fl`);
            const headingText = (h1 || h2 || h3)![1];
            const cls = h1
              ? 'text-lg font-bold text-slate-50 pt-2'
              : h2
              ? 'text-base font-bold text-slate-50 pt-1.5'
              : 'text-[15px] font-bold text-slate-100 pt-1';
            blocks.push(
              <h3 key={key} className={cls}>
                {renderInline(headingText, key)}
              </h3>
            );
            return;
          }

          const ulMatch = /^[-*•]\s+(.+)$/.exec(trimmed);
          const olMatch = /^\d+[.)]\s+(.+)$/.exec(trimmed);
          if (ulMatch || olMatch) {
            const ordered = Boolean(olMatch);
            const itemText = (ulMatch || olMatch)![1];
            if (listItems && listItems.ordered === ordered) {
              listItems.items.push(itemText);
            } else {
              flushList(`${key}_fl`);
              listItems = { ordered, items: [itemText] };
            }
            return;
          }

          flushList(`${key}_fl`);

          if (trimmed.startsWith('>')) {
            blocks.push(
              <blockquote
                key={key}
                className="my-2 px-3.5 py-2 rounded-lg bg-white/[0.04] border border-white/10 text-slate-300"
              >
                {renderInline(trimmed.replace(/^>\s?/, ''), key)}
              </blockquote>
            );
            return;
          }

          blocks.push(<p key={key}>{renderInline(trimmed, key)}</p>);
        });

        flushList(`end_${segIdx}`);
        return <React.Fragment key={`seg_${segIdx}`}>{blocks}</React.Fragment>;
      })}
    </div>
  );
};

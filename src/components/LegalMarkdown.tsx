import type { ReactNode } from 'react';
import type { AppLocale } from '@/i18n/locales';
import { withLocalePrefix } from '@/i18n/path';

const INLINE_RE =
  /\[([^\]]+)\]\(([^)]+)\)|\*\*(.+?)\*\*|\*(.+?)\*|https?:\/\/[^\s<]+|www\.[^\s<)]+|[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/g;

function stripTrailingPunct(url: string): { href: string; tail: string } {
  const match = url.match(/^(.*?)([).,;:]+)$/);
  if (!match) return { href: url, tail: '' };
  return { href: match[1], tail: match[2] };
}

function safeHref(
  href: string,
  locale: AppLocale
): { href: string; external: boolean } | null {
  const trimmed = href.trim();
  if (trimmed.startsWith('mailto:')) {
    return { href: trimmed, external: false };
  }
  if (trimmed.startsWith('/') && !trimmed.startsWith('//')) {
    return { href: trimmed, external: false };
  }
  try {
    const url = new URL(trimmed);
    if (url.protocol !== 'http:' && url.protocol !== 'https:') return null;
    if (url.hostname === 'aypik.fr' || url.hostname === 'www.aypik.fr') {
      const path = url.pathname.replace(/\/+$/, '') || '/';
      if (path === '/contact') {
        return { href: withLocalePrefix(locale, '/contact'), external: false };
      }
    }
    return { href: url.toString(), external: true };
  } catch {
    return null;
  }
}

function MdLink({
  href,
  locale,
  children,
}: {
  href: string;
  locale: AppLocale;
  children: ReactNode;
}) {
  const resolved = safeHref(href, locale);
  if (!resolved) return <>{children}</>;
  return (
    <a
      href={resolved.href}
      className="underline underline-offset-2 hover:text-rose-600"
      {...(resolved.external
        ? { target: '_blank', rel: 'noopener noreferrer' }
        : {})}
    >
      {children}
    </a>
  );
}

function renderInline(text: string, locale: AppLocale): ReactNode[] {
  const nodes: ReactNode[] = [];
  let last = 0;
  let key = 0;
  const re = new RegExp(INLINE_RE.source, 'g');
  let match: RegExpExecArray | null;
  while ((match = re.exec(text))) {
    if (match.index > last) {
      nodes.push(text.slice(last, match.index));
    }
    const [raw, linkText, linkHref, bold, italic] = match;
    if (linkText != null && linkHref != null) {
      nodes.push(
        <MdLink key={key++} href={linkHref} locale={locale}>
          {linkText}
        </MdLink>
      );
    } else if (bold != null) {
      nodes.push(
        <strong key={key++} className="font-semibold text-gray-900">
          {renderInline(bold, locale)}
        </strong>
      );
    } else if (italic != null) {
      nodes.push(<em key={key++}>{renderInline(italic, locale)}</em>);
    } else if (raw.startsWith('http') || raw.startsWith('www.')) {
      const { href: cut, tail } = stripTrailingPunct(raw);
      const href = cut.startsWith('www.') ? `https://${cut}` : cut;
      nodes.push(
        <MdLink key={key++} href={href} locale={locale}>
          {cut}
        </MdLink>
      );
      if (tail) nodes.push(tail);
    } else {
      nodes.push(
        <MdLink key={key++} href={`mailto:${raw}`} locale={locale}>
          {raw}
        </MdLink>
      );
    }
    last = match.index + raw.length;
  }
  if (last < text.length) nodes.push(text.slice(last));
  return nodes;
}

function renderParagraphLines(block: string, locale: AppLocale): ReactNode {
  const lines = block.split('\n');
  return lines.map((line, i) => (
    <span key={i}>
      {i > 0 ? <br /> : null}
      {renderInline(line, locale)}
    </span>
  ));
}

function renderBlock(block: string, locale: AppLocale, key: number): ReactNode {
  if (block === '---') {
    return <hr key={key} className="border-gray-100" />;
  }
  const heading = block.match(/^(#{1,3})\s+(.+)$/s);
  if (heading) {
    const level = heading[1].length;
    const title = heading[2].replace(/\n/g, ' ');
    const className =
      level === 1
        ? 'text-xl font-bold text-gray-900 tracking-tight'
        : level === 2
          ? 'text-lg font-bold text-gray-900 tracking-tight'
          : 'text-base font-bold text-gray-900';
    const Tag = (level === 1 ? 'h2' : level === 2 ? 'h3' : 'h4') as
      | 'h2'
      | 'h3'
      | 'h4';
    return (
      <Tag key={key} className={className}>
        {renderInline(title, locale)}
      </Tag>
    );
  }
  const lines = block.split('\n');
  if (lines.every((line) => line.startsWith('- '))) {
    return (
      <ul key={key} className="list-disc pl-5 space-y-1">
        {lines.map((line, i) => (
          <li key={i}>{renderInline(line.slice(2), locale)}</li>
        ))}
      </ul>
    );
  }
  if (/^\*\*[^*]+\*\*$/.test(block)) {
    return (
      <p key={key} className="font-semibold text-gray-900">
        {renderInline(block.slice(2, -2), locale)}
      </p>
    );
  }
  if (/^\*[^*]+\*$/.test(block)) {
    return (
      <p key={key} className="font-semibold italic text-gray-900">
        {renderInline(block.slice(1, -1), locale)}
      </p>
    );
  }
  if (/^(Last updated:|Última actualización:)/.test(block)) {
    return (
      <p key={key} className="text-xs text-gray-500">
        {renderParagraphLines(block, locale)}
      </p>
    );
  }
  return <p key={key}>{renderParagraphLines(block, locale)}</p>;
}

export default function LegalMarkdown({
  source,
  locale,
}: {
  source: string;
  locale: AppLocale;
}) {
  const blocks = source
    .replace(/\r\n/g, '\n')
    .trim()
    .split(/\n{2,}/)
    .map((block) => block.trim())
    .filter(Boolean);

  return (
    <div className="space-y-6">
      {blocks.map((block, i) => renderBlock(block, locale, i))}
    </div>
  );
}

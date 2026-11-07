import type { ReactNode } from 'react';

/** Escape HTML then linkify http(s) URLs, returning React-safe segments. */
export function linkifyContent(text: string): Array<string | { url: string }> {
  const parts: Array<string | { url: string }> = [];
  const regex = /https?:\/\/[^\s<>"']+/g;
  let last = 0;
  for (const match of text.matchAll(regex)) {
    const index = match.index ?? 0;
    if (index > last) parts.push(text.slice(last, index));
    parts.push({ url: match[0] });
    last = index + match[0].length;
  }
  if (last < text.length) parts.push(text.slice(last));
  return parts;
}

/** "3 دقیقه پیش" style relative time for last-seen. */
export function relativeTime(iso: string, locale: 'fa' | 'en'): string {
  const rtf = new Intl.RelativeTimeFormat(locale === 'fa' ? 'fa-IR' : 'en-US', { numeric: 'auto' });
  const diffMs = Date.now() - new Date(iso).getTime();
  const minutes = Math.round(diffMs / 60_000);
  if (Math.abs(minutes) < 1) return locale === 'fa' ? 'همین حالا' : 'just now';
  if (Math.abs(minutes) < 60) return rtf.format(-minutes, 'minute');
  const hours = Math.round(minutes / 60);
  if (Math.abs(hours) < 24) return rtf.format(-hours, 'hour');
  const days = Math.round(hours / 24);
  if (Math.abs(days) < 30) return rtf.format(-days, 'day');
  const months = Math.round(days / 30);
  if (Math.abs(months) < 12) return rtf.format(-months, 'month');
  return rtf.format(-Math.round(months / 12), 'year');
}

/** Renders content with newlines preserved and URLs clickable. */
export function renderMessageContent(text: string): ReactNode[] {
  return linkifyContent(text).map((part, i) => {
    if (typeof part === 'string') {
      return part.split('\n').map((line, j, arr) => (
        <span key={`${i}-${j}`}>
          {line}
          {j < arr.length - 1 && <br />}
        </span>
      ));
    }
    return (
      <a
        key={i}
        href={part.url}
        target="_blank"
        rel="noopener noreferrer nofollow"
        className="text-brand-300 underline decoration-brand-500/40 underline-offset-2 hover:text-brand-200 break-all"
        dir="ltr"
      >
        {part.url}
      </a>
    );
  });
}

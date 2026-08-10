import type { SelectionState } from "../types";

export type MarkdownRangeKind = "heading" | "quote" | "paragraph";

export interface MarkdownRange {
  id: string;
  kind: MarkdownRangeKind;
  level?: number;
  text: string;
  source: string;
  from: number;
  to: number;
}

function stableHash(value: string) {
  let hash = 2166136261;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return (hash >>> 0).toString(36);
}

function safeId(value: string) {
  return value.replace(/[^A-Za-z0-9_-]/g, "-").slice(0, 96) || "document";
}

function toRange(source: string, documentId: string, index: number, from: number): MarkdownRange {
  const anchor = /(?:^|\n)\^([A-Za-z0-9_-]+)\s*$/.exec(source);
  const visibleSource = anchor ? source.slice(0, anchor.index).trimEnd() : source;
  const heading = /^(#{1,6})\s+/.exec(visibleSource);
  const isQuote = visibleSource
    .split("\n")
    .every((line) => /^>\s?/.test(line) || !line.trim());
  const text = heading
    ? visibleSource.slice(heading[0].length)
    : isQuote
      ? visibleSource
          .split("\n")
          .map((line) => line.replace(/^>\s?/, ""))
          .join("\n")
      : visibleSource;
  return {
    id: anchor?.[1] ?? `${safeId(documentId)}-${index + 1}-${stableHash(source)}`,
    kind: heading ? "heading" : isQuote ? "quote" : "paragraph",
    level: heading?.[1].length,
    text,
    source: visibleSource,
    from,
    to: from + source.length
  };
}

export function markdownRanges(markdown: string, documentId: string): MarkdownRange[] {
  const normalized = markdown.replace(/\r\n?/g, "\n");
  if (!normalized) return [toRange("", documentId, 0, 0)];
  const ranges: MarkdownRange[] = [];
  const separator = /\n[ \t]*\n/g;
  let from = 0;
  let match: RegExpExecArray | null;
  while ((match = separator.exec(normalized))) {
    const source = normalized.slice(from, match.index);
    if (source.trim()) ranges.push(toRange(source, documentId, ranges.length, from));
    from = separator.lastIndex;
  }
  const source = normalized.slice(from);
  if (source.trim() || !ranges.length) {
    ranges.push(toRange(source, documentId, ranges.length, from));
  }
  return ranges;
}

export function markdownSelection(
  markdown: string,
  documentId: string,
  from: number,
  to: number
): SelectionState | null {
  return markdownSelectionFromRanges(
    markdown,
    markdownRanges(markdown, documentId),
    from,
    to
  );
}

export function markdownSelectionFromRanges(
  markdown: string,
  ranges: readonly MarkdownRange[],
  from: number,
  to: number
): SelectionState | null {
  if (from === to) return null;
  const range = ranges.find(
    (candidate) => from >= candidate.from && to <= candidate.to
  );
  if (!range) return null;
  const text = markdown.slice(from, to);
  if (!text.trim()) return null;
  const localStart = Math.max(0, from - range.from);
  return {
    text,
    blockId: range.id,
    start: localStart,
    end: localStart + text.length,
    documentStart: from,
    documentEnd: to
  };
}

export function markdownToPlainText(markdown: string) {
  return markdown
    .replace(/^\^[-A-Za-z0-9_]+\s*$/gm, "")
    .replace(/^#{1,6}\s+/gm, "")
    .replace(/^>\s?/gm, "")
    .replace(/!\[([^\]]*)\]\([^)]*\)/g, "$1")
    .replace(/\[([^\]]+)\]\([^)]*\)/g, "$1")
    .replace(/\[\[([^\]|]+)(?:\|([^\]]+))?\]\]/g, "$2$1")
    .replace(/(?:\*\*|__|~~|==|`)/g, "")
    .replace(/<[^>]+>/g, "")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

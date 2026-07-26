import type { ContentBlock, InlineMark, InlineMarkType } from "../types";

export interface InlineRange {
  start: number;
  end: number;
}

let markSequence = 0;

function createMarkId(type: InlineMarkType) {
  markSequence += 1;
  return `${type}-${Date.now()}-${markSequence}`;
}

function isColorMark(type: InlineMarkType) {
  return type === "textColor" || type === "backgroundColor";
}

function clampRange(range: InlineRange, textLength: number): InlineRange {
  const start = Math.min(textLength, Math.max(0, Math.round(range.start)));
  const end = Math.min(textLength, Math.max(start, Math.round(range.end)));
  return { start, end };
}

function sameStyle(left: InlineMark, right: InlineMark) {
  return left.type === right.type && left.color === right.color;
}

function normalizeMarks(marks: InlineMark[], textLength: number) {
  const sorted = marks
    .map((mark) => ({
      ...mark,
      start: Math.min(textLength, Math.max(0, mark.start)),
      end: Math.min(textLength, Math.max(0, mark.end))
    }))
    .filter((mark) => mark.end > mark.start)
    .sort(
      (left, right) =>
        left.start - right.start ||
        left.end - right.end ||
        left.type.localeCompare(right.type) ||
        (left.color ?? "").localeCompare(right.color ?? "")
    );

  return sorted.reduce<InlineMark[]>((result, mark) => {
    const existingIndex = result.findIndex(
      (candidate) => sameStyle(candidate, mark) && candidate.end >= mark.start
    );
    if (existingIndex < 0) return [...result, mark];
    const existing = result[existingIndex];
    const merged = {
      ...existing,
      start: Math.min(existing.start, mark.start),
      end: Math.max(existing.end, mark.end)
    };
    return result.map((candidate, index) => (index === existingIndex ? merged : candidate));
  }, []);
}

function subtractRange(mark: InlineMark, range: InlineRange) {
  if (mark.end <= range.start || mark.start >= range.end) return [mark];
  const parts: InlineMark[] = [];
  if (mark.start < range.start) {
    parts.push({ ...mark, end: range.start });
  }
  if (mark.end > range.end) {
    parts.push({
      ...mark,
      id: createMarkId(mark.type),
      start: range.end
    });
  }
  return parts;
}

function isRangeCovered(marks: InlineMark[], range: InlineRange) {
  const intervals = marks
    .filter((mark) => mark.end > range.start && mark.start < range.end)
    .sort((left, right) => left.start - right.start);
  let cursor = range.start;
  for (const interval of intervals) {
    if (interval.start > cursor) return false;
    cursor = Math.max(cursor, interval.end);
    if (cursor >= range.end) return true;
  }
  return false;
}

export function toggleInlineMark(
  block: ContentBlock,
  requestedRange: InlineRange,
  type: InlineMarkType,
  color?: string
): ContentBlock {
  const range = clampRange(requestedRange, block.text.length);
  if (range.start === range.end) return block;

  const marks = block.marks ?? [];
  const equivalent = marks.filter(
    (mark) => mark.type === type && (!isColorMark(type) || mark.color === color)
  );
  const shouldRemove = isRangeCovered(equivalent, range);

  const nextMarks = marks.flatMap((mark) => {
    const targetsType = mark.type === type;
    const targetsEquivalent =
      targetsType && (!isColorMark(type) || mark.color === color);
    if (shouldRemove ? targetsEquivalent : isColorMark(type) && targetsType) {
      return subtractRange(mark, range);
    }
    return [mark];
  });

  if (!shouldRemove) {
    nextMarks.push({
      id: createMarkId(type),
      type,
      start: range.start,
      end: range.end,
      ...(isColorMark(type) && color ? { color } : {})
    });
  }

  return {
    ...block,
    marks: normalizeMarks(nextMarks, block.text.length)
  };
}

export function transformMarksForTextChange(
  block: ContentBlock,
  nextText: string
): ContentBlock {
  if (block.text === nextText) return block;

  const previousText = block.text;
  let prefixLength = 0;
  while (
    prefixLength < previousText.length &&
    prefixLength < nextText.length &&
    previousText[prefixLength] === nextText[prefixLength]
  ) {
    prefixLength += 1;
  }

  let suffixLength = 0;
  while (
    suffixLength < previousText.length - prefixLength &&
    suffixLength < nextText.length - prefixLength &&
    previousText[previousText.length - 1 - suffixLength] ===
      nextText[nextText.length - 1 - suffixLength]
  ) {
    suffixLength += 1;
  }

  const oldStart = prefixLength;
  const oldEnd = previousText.length - suffixLength;
  const newEnd = nextText.length - suffixLength;
  const delta = nextText.length - previousText.length;
  const insertion = oldStart === oldEnd;

  const mapStart = (position: number) => {
    if (position < oldStart || (!insertion && position === oldStart)) return position;
    if (position >= oldEnd) return position + delta;
    return newEnd;
  };

  const mapEnd = (position: number) => {
    if (position <= oldStart) return position;
    if (position >= oldEnd && !insertion) return position + delta;
    if (position > oldEnd && insertion) return position + delta;
    return oldStart;
  };

  const marks = (block.marks ?? []).map((mark) => ({
    ...mark,
    start: mapStart(mark.start),
    end: mapEnd(mark.end)
  }));

  return {
    ...block,
    text: nextText,
    marks: normalizeMarks(marks, nextText.length)
  };
}

export function splitBlockMarks(
  block: ContentBlock,
  requestedCursor: number
): [ContentBlock, ContentBlock] {
  const cursor = Math.min(block.text.length, Math.max(0, Math.round(requestedCursor)));
  const leftMarks: InlineMark[] = [];
  const rightMarks: InlineMark[] = [];

  (block.marks ?? []).forEach((mark) => {
    if (mark.start < cursor) {
      leftMarks.push({ ...mark, end: Math.min(mark.end, cursor) });
    }
    if (mark.end > cursor) {
      rightMarks.push({
        ...mark,
        id: createMarkId(mark.type),
        start: Math.max(mark.start, cursor) - cursor,
        end: mark.end - cursor
      });
    }
  });

  const leftText = block.text.slice(0, cursor);
  const rightText = block.text.slice(cursor);
  return [
    { ...block, text: leftText, marks: normalizeMarks(leftMarks, leftText.length) },
    {
      ...block,
      id: `${block.id}-split`,
      text: rightText,
      marks: normalizeMarks(rightMarks, rightText.length)
    }
  ];
}

export function mergeBlockMarks(left: ContentBlock, right: ContentBlock): ContentBlock {
  const offset = left.text.length;
  const marks = [
    ...(left.marks ?? []),
    ...(right.marks ?? []).map((mark) => ({
      ...mark,
      id: createMarkId(mark.type),
      start: mark.start + offset,
      end: mark.end + offset
    }))
  ];
  const text = `${left.text}${right.text}`;
  return {
    ...left,
    text,
    marks: normalizeMarks(marks, text.length)
  };
}

import type { ArticleNode, SelectionState } from "../types";
import { markdownRanges, markdownToPlainText, type MarkdownRange } from "../editor/markdownDocument";
import type { ContextScope } from "./generationConfig";

export interface GenerationContext {
  values: Record<string, string>;
  suppliedContext: string;
}

function rangeSource(ranges: MarkdownRange[]) {
  return ranges.map((range) => range.source).join("\n\n");
}

function containingSection(ranges: MarkdownRange[], selectedIndex: number) {
  let start = selectedIndex;
  while (start >= 0 && ranges[start]?.kind !== "heading") start -= 1;
  if (start < 0) return ranges;
  const level = ranges[start].level ?? 6;
  let end = start + 1;
  while (end < ranges.length) {
    const range = ranges[end];
    if (range.kind === "heading" && (range.level ?? 6) <= level) break;
    end += 1;
  }
  return ranges.slice(start, end);
}

function nearbyParagraphs(ranges: MarkdownRange[], selectedIndex: number) {
  const paragraphIndexes = ranges
    .map((range, index) => (range.kind === "paragraph" || range.kind === "quote" ? index : -1))
    .filter((index) => index >= 0);
  const position = paragraphIndexes.indexOf(selectedIndex);
  if (position < 0) {
    return ranges.slice(Math.max(0, selectedIndex - 3), Math.min(ranges.length, selectedIndex + 4));
  }
  const first = paragraphIndexes[Math.max(0, position - 3)] ?? selectedIndex;
  const last = paragraphIndexes[Math.min(paragraphIndexes.length - 1, position + 3)] ?? selectedIndex;
  return ranges.slice(first, last + 1);
}

function articleText(article: ArticleNode, documents: Record<string, string>) {
  return `# ${article.title}\n\n${article.summary}\n\n${documents[article.id] ?? ""}`.trim();
}

export function assembleGenerationContext(
  articles: Record<string, ArticleNode>,
  documents: Record<string, string>,
  article: ArticleNode,
  selection: SelectionState,
  scope: ContextScope
): GenerationContext {
  const markdown = documents[article.id] ?? "";
  const ranges = markdownRanges(markdown, article.id);
  const selectedIndex = Math.max(0, ranges.findIndex((range) => range.id === selection.blockId));
  const selectedRange = ranges[selectedIndex] ?? ranges[0];
  const selectedText = selectedRange?.text ?? selection.text;
  const section = containingSection(ranges, selectedIndex);
  const path: ArticleNode[] = [];
  let cursor: ArticleNode | undefined = article;
  while (cursor) {
    path.unshift(cursor);
    cursor = cursor.parentId ? articles[cursor.parentId] : undefined;
  }
  const parent = article.parentId ? articles[article.parentId] : undefined;

  let suppliedContext: string;
  if (scope === "containingParagraph") {
    suppliedContext = selectedRange?.source ?? selection.text;
  } else if (scope === "nearbyParagraphs") {
    suppliedContext = rangeSource(nearbyParagraphs(ranges, selectedIndex));
  } else if (scope === "section") {
    suppliedContext = rangeSource(section);
  } else if (scope === "article") {
    suppliedContext = articleText(article, documents);
  } else if (scope === "parentArticle") {
    suppliedContext = [parent, article]
      .filter((value): value is ArticleNode => Boolean(value))
      .map((value) => articleText(value, documents))
      .join("\n\n---\n\n");
  } else {
    suppliedContext = path.map((value) => articleText(value, documents)).join("\n\n---\n\n");
  }

  const localStart = Math.max(0, (selection.documentStart ?? selectedRange.from) - selectedRange.from);
  const localEnd = Math.max(localStart, (selection.documentEnd ?? selection.documentStart ?? selectedRange.from) - selectedRange.from);
  const selectedSource = selectedRange?.source ?? selectedText;
  return {
    suppliedContext,
    values: {
      "selection.text": selection.text,
      "selection.prefix": selectedSource.slice(0, localStart),
      "selection.suffix": selectedSource.slice(localEnd),
      "block.text": selectedText,
      "section.path": path.map((item) => item.title).join(" / "),
      "section.text": rangeSource(section),
      "document.title": article.title,
      "document.summary": article.summary,
      "parent.title": parent?.title ?? "",
      "parent.summary": parent?.summary ?? "",
      "generation.instruction": "",
      "output.language": "简体中文"
    }
  };
}

export interface GeneratedArticleContent {
  title: string;
  summary: string;
  markdown: string;
}

function cleanModelText(text: string) {
  return text.trim().replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/, "").trim();
}

export function parseGeneratedArticle(text: string, fallbackTitle: string): GeneratedArticleContent {
  const cleaned = cleanModelText(text);
  const objectStart = cleaned.indexOf("{");
  const objectEnd = cleaned.lastIndexOf("}");
  if (objectStart >= 0 && objectEnd > objectStart) {
    try {
      const parsed = JSON.parse(cleaned.slice(objectStart, objectEnd + 1)) as Record<string, unknown>;
      const markdown = typeof parsed.markdown === "string"
        ? parsed.markdown.trim()
        : Array.isArray(parsed.blocks)
          ? parsed.blocks
              .flatMap((item) => {
                if (!item || typeof item !== "object") return [];
                const record = item as Record<string, unknown>;
                if (typeof record.text !== "string" || !record.text.trim()) return [];
                const prefix = record.type === "heading" ? "## " : record.type === "quote" ? "> " : "";
                return [`${prefix}${record.text.trim()}`];
              })
              .join("\n\n")
          : "";
      if (markdown) {
        const title = typeof parsed.title === "string" && parsed.title.trim()
          ? parsed.title.trim().slice(0, 100)
          : fallbackTitle;
        const summary = typeof parsed.summary === "string" && parsed.summary.trim()
          ? parsed.summary.trim()
          : markdownToPlainText(markdown).slice(0, 160);
        return { title, summary, markdown };
      }
    } catch {
      // Fall through to readable Markdown.
    }
  }
  return {
    title: fallbackTitle,
    summary: markdownToPlainText(cleaned).slice(0, 160),
    markdown: cleaned
  };
}

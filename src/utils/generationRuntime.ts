import type {
  ArticleNode,
  ContentBlock,
  SelectionState
} from "../types";
import type { ContextScope } from "./generationConfig";

export interface GenerationContext {
  values: Record<string, string>;
  suppliedContext: string;
}

function blockText(blocks: ContentBlock[]) {
  return blocks
    .map((block) => {
      const prefix =
        block.kind === "h1"
          ? "# "
          : block.kind === "h2"
            ? "## "
            : block.kind === "h3"
              ? "### "
              : block.kind === "quote"
                ? "> "
                : "";
      return `${prefix}${block.text}`;
    })
    .join("\n\n");
}

function sectionBlocks(blocks: ContentBlock[], selectedIndex: number) {
  let start = selectedIndex;
  while (start >= 0 && !/^h[1-3]$/.test(blocks[start]?.kind ?? "")) start -= 1;
  if (start < 0) return blocks;
  const level = Number(blocks[start].kind.slice(1));
  let end = start + 1;
  while (end < blocks.length) {
    const kind = blocks[end].kind;
    if (/^h[1-3]$/.test(kind) && Number(kind.slice(1)) <= level) break;
    end += 1;
  }
  return blocks.slice(start, end);
}

function nearbyBlocks(blocks: ContentBlock[], selectedIndex: number) {
  const paragraphIndexes = blocks
    .map((block, index) =>
      block.kind === "paragraph" || block.kind === "quote" ? index : -1
    )
    .filter((index) => index >= 0);
  const selectedParagraphPosition = paragraphIndexes.indexOf(selectedIndex);
  if (selectedParagraphPosition < 0) {
    return blocks.slice(
      Math.max(0, selectedIndex - 3),
      Math.min(blocks.length, selectedIndex + 4)
    );
  }
  const first =
    paragraphIndexes[Math.max(0, selectedParagraphPosition - 3)] ??
    selectedIndex;
  const last =
    paragraphIndexes[
      Math.min(paragraphIndexes.length - 1, selectedParagraphPosition + 3)
    ] ?? selectedIndex;
  return blocks.slice(first, last + 1);
}

function articleText(article: ArticleNode) {
  return `# ${article.title}\n\n${article.summary}\n\n${blockText(article.blocks)}`;
}

export function assembleGenerationContext(
  articles: Record<string, ArticleNode>,
  article: ArticleNode,
  selection: SelectionState,
  scope: ContextScope
): GenerationContext {
  const selectedIndex = Math.max(
    0,
    article.blocks.findIndex((block) => block.id === selection.blockId)
  );
  const selectedBlock = article.blocks[selectedIndex] ?? article.blocks[0];
  const selectedBlockText = selectedBlock?.text ?? selection.text;
  const path: ArticleNode[] = [];
  let cursor: ArticleNode | undefined = article;
  while (cursor) {
    path.unshift(cursor);
    cursor = cursor.parentId ? articles[cursor.parentId] : undefined;
  }
  const parent = article.parentId ? articles[article.parentId] : undefined;
  const section = sectionBlocks(article.blocks, selectedIndex);
  let suppliedContext: string;
  if (scope === "containingParagraph") {
    suppliedContext = selectedBlockText;
  } else if (scope === "nearbyParagraphs") {
    suppliedContext = blockText(nearbyBlocks(article.blocks, selectedIndex));
  } else if (scope === "section") {
    suppliedContext = blockText(section);
  } else if (scope === "article") {
    suppliedContext = articleText(article);
  } else if (scope === "parentArticle") {
    suppliedContext = [parent, article]
      .filter((value): value is ArticleNode => Boolean(value))
      .map(articleText)
      .join("\n\n---\n\n");
  } else {
    suppliedContext = path.map(articleText).join("\n\n---\n\n");
  }

  const selectionStart = Math.max(0, selection.start);
  const selectionEnd = Math.max(selectionStart, selection.end);
  return {
    suppliedContext,
    values: {
      "selection.text": selection.text,
      "selection.prefix": selectedBlockText.slice(0, selectionStart),
      "selection.suffix": selectedBlockText.slice(selectionEnd),
      "block.text": selectedBlockText,
      "section.path": path.map((item) => item.title).join(" / "),
      "section.text": blockText(section),
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
  blocks: ContentBlock[];
  tags: string[];
}

function cleanModelText(text: string) {
  return text
    .trim()
    .replace(/^```(?:json)?\s*/i, "")
    .replace(/\s*```$/, "")
    .trim();
}

export function parseGeneratedArticle(
  text: string,
  fallbackTitle: string,
  idPrefix: string
): GeneratedArticleContent {
  const cleaned = cleanModelText(text);
  const objectStart = cleaned.indexOf("{");
  const objectEnd = cleaned.lastIndexOf("}");
  if (objectStart >= 0 && objectEnd > objectStart) {
    try {
      const parsed = JSON.parse(
        cleaned.slice(objectStart, objectEnd + 1)
      ) as Record<string, unknown>;
      const rawBlocks = Array.isArray(parsed.blocks) ? parsed.blocks : [];
      const blocks = rawBlocks
        .map((item, index): ContentBlock | null => {
          if (!item || typeof item !== "object") return null;
          const record = item as Record<string, unknown>;
          if (typeof record.text !== "string" || !record.text.trim()) return null;
          const type = record.type;
          const kind =
            type === "heading"
              ? "h2"
              : type === "quote"
                ? "quote"
                : "paragraph";
          return {
            id: `${idPrefix}-b${index + 1}`,
            kind,
            text: record.text.trim()
          };
        })
        .filter((block): block is ContentBlock => Boolean(block));
      if (blocks.length) {
        const title =
          typeof parsed.title === "string" && parsed.title.trim()
            ? parsed.title.trim().slice(0, 100)
            : fallbackTitle;
        const summary =
          typeof parsed.summary === "string" && parsed.summary.trim()
            ? parsed.summary.trim()
            : blocks
                .map((block) => block.text)
                .join(" ")
                .slice(0, 160);
        const tags = Array.isArray(parsed.tags)
          ? parsed.tags
              .filter((tag): tag is string => typeof tag === "string")
              .map((tag) => tag.trim())
              .filter(Boolean)
              .slice(0, 8)
          : [];
        return { title, summary, blocks, tags };
      }
    } catch {
      // Use the readable plain-text response below.
    }
  }

  const parts = cleaned
    .split(/\n{2,}/)
    .map((part) => part.trim())
    .filter(Boolean);
  const blocks = (parts.length ? parts : [cleaned]).map((part, index) => ({
    id: `${idPrefix}-b${index + 1}`,
    kind: "paragraph" as const,
    text: part.replace(/^#{1,3}\s+/, "")
  }));
  return {
    title: fallbackTitle,
    summary: blocks.map((block) => block.text).join(" ").slice(0, 160),
    blocks,
    tags: []
  };
}

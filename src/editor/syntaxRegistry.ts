const LEGACY_MARKDOWN_SYNTAX_STORAGE_KEY = "annota:markdown-syntax.v2";
export const MARKDOWN_SYNTAX_STORAGE_KEY = "annota:markdown-syntax.v3";

export type MarkdownSyntaxId =
  | "commonmark-structure"
  | "block-structures"
  | "inline-formatting"
  | "obsidian-highlight"
  | "obsidian-wiki-links"
  | "obsidian-comments"
  | "math-and-diagrams";

export interface MarkdownSyntaxFeature {
  id: MarkdownSyntaxId;
  label: string;
  description: string;
  defaultEnabled: boolean;
}

export const markdownSyntaxFeatures: readonly MarkdownSyntaxFeature[] = [
  {
    id: "commonmark-structure",
    label: "标题与引用",
    description: "隐藏非活动行的标题和引用标记。",
    defaultEnabled: true
  },
  {
    id: "block-structures",
    label: "代码、列表与表格",
    description: "预览代码围栏、列表、任务项与 GFM 表格。",
    defaultEnabled: true
  },
  {
    id: "inline-formatting",
    label: "行内格式",
    description: "预览强调、删除线与行内代码。",
    defaultEnabled: true
  },
  {
    id: "obsidian-highlight",
    label: "Obsidian 高亮",
    description: "预览 ==高亮== 语法。",
    defaultEnabled: true
  },
  {
    id: "obsidian-wiki-links",
    label: "Wiki 链接",
    description: "预览 [[笔记]] 与 ![[嵌入]] 的链接外观。",
    defaultEnabled: true
  },
  {
    id: "obsidian-comments",
    label: "Obsidian 注释",
    description: "在非活动行隐藏 %%注释%%。",
    defaultEnabled: true
  },
  {
    id: "math-and-diagrams",
    label: "数学公式与 Mermaid 图表",
    description: "预览 $...$、$$...$$ 公式与 Mermaid 围栏图表。",
    defaultEnabled: true
  }
];

export function defaultMarkdownSyntaxIds() {
  return markdownSyntaxFeatures
    .filter((feature) => feature.defaultEnabled)
    .map((feature) => feature.id);
}

export function loadMarkdownSyntaxIds(): MarkdownSyntaxId[] {
  if (typeof window === "undefined") return defaultMarkdownSyntaxIds();
  try {
    const current = window.localStorage.getItem(MARKDOWN_SYNTAX_STORAGE_KEY);
    const stored = current ?? window.localStorage.getItem(LEGACY_MARKDOWN_SYNTAX_STORAGE_KEY);
    const parsed = JSON.parse(
      stored ?? "null"
    );
    if (!Array.isArray(parsed)) return defaultMarkdownSyntaxIds();
    const known = new Set(markdownSyntaxFeatures.map((feature) => feature.id));
    const ids = parsed.filter(
      (value): value is MarkdownSyntaxId => typeof value === "string" && known.has(value as MarkdownSyntaxId)
    );
    if (current === null && !ids.includes("math-and-diagrams")) ids.push("math-and-diagrams");
    return ids;
  } catch {
    return defaultMarkdownSyntaxIds();
  }
}

export function saveMarkdownSyntaxIds(ids: readonly MarkdownSyntaxId[]) {
  window.localStorage.setItem(MARKDOWN_SYNTAX_STORAGE_KEY, JSON.stringify(ids));
}

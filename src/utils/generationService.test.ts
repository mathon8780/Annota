import { describe, expect, it, vi } from "vitest";
import type { ArticleNode } from "../types";
import { initialGenerationTypes } from "./generationConfig";
import { generateNodeContent } from "./generationService";
import { initialModelProviders } from "./modelProviders";
import { loadMarkdownDocument } from "../editor/markdownRepository";
import { generateModelText } from "./modelGeneration";

vi.mock("../editor/markdownRepository", () => ({
  loadMarkdownDocument: vi.fn(async (id: string) => ({ content: `${id} content`, relativePath: "" }))
}));
vi.mock("./modelGeneration", () => ({
  GENERATION_OUTPUT_INSTRUCTION: "output instruction",
  generateModelText: vi.fn(async () => '{"title":"结果","summary":"摘要","markdown":"正文"}')
}));

const article = (id: string, parentId: string | null): ArticleNode => ({
  id, parentId, rootId: "root", title: id, summary: "", type: "explain", childIds: [],
  createdAt: "2026-10-16", updatedAt: "2026-10-16"
});
const articles = { root: article("root", null), parent: article("parent", "root"), child: article("child", "parent") };

it.each([
  ["containingParagraph", ["child"]],
  ["parentArticle", ["parent", "child"]],
  ["allParentArticles", ["root", "parent", "child"]]
] as const)("loads only documents needed by %s and uses the shared request flow", async (scope, ids) => {
  vi.clearAllMocks();
  const result = await generateNodeContent(
    articles, articles.child,
    { blockId: "selection", text: "content", start: 6, end: 13 },
    { ...initialGenerationTypes[1], contextScope: scope },
    { provider: initialModelProviders[0], model: "configured-model" }
  );
  expect(vi.mocked(loadMarkdownDocument).mock.calls.map(([id]) => id)).toEqual(ids);
  expect(generateModelText).toHaveBeenCalledWith(expect.objectContaining({ model: "configured-model" }));
  expect(result).toEqual({ title: "结果", summary: "摘要", markdown: "正文" });
});

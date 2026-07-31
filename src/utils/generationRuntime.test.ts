import type { ArticleNode, SelectionState } from "../types";
import { assembleGenerationContext } from "./generationRuntime";

function article(
  id: string,
  parentId: string | null,
  blocks: ArticleNode["blocks"]
): ArticleNode {
  return {
    id,
    rootId: "root",
    parentId,
    title: id,
    summary: `${id} summary`,
    type: parentId ? "解释" : "主文章",
    tags: [],
    blocks,
    childIds: [],
    createdAt: "2026-07-30T00:00:00.000Z",
    updatedAt: "2026-07-30T00:00:00.000Z"
  };
}

describe("generation context assembly", () => {
  it("expands monotonically from the selected paragraph to all ancestors", () => {
    const root = article("root", null, [
      { id: "root-b1", kind: "paragraph", text: "root context" }
    ]);
    const parent = article("parent", "root", [
      { id: "parent-b1", kind: "paragraph", text: "parent context" }
    ]);
    const current = article("current", "parent", [
      { id: "heading", kind: "h2", text: "Section" },
      ...Array.from({ length: 8 }, (_, index) => ({
        id: `p${index + 1}`,
        kind: "paragraph" as const,
        text: `paragraph ${index + 1}`
      }))
    ]);
    const articles = { root, parent, current };
    const selection: SelectionState = {
      text: "graph",
      blockId: "p4",
      start: 2,
      end: 7
    };
    const scopes = [
      "containingParagraph",
      "nearbyParagraphs",
      "section",
      "article",
      "parentArticle",
      "allParentArticles"
    ] as const;
    const contexts = scopes.map((scope) =>
      assembleGenerationContext(articles, current, selection, scope)
    );

    expect(contexts[0].suppliedContext).toBe("paragraph 4");
    expect(contexts[1].suppliedContext).toContain("paragraph 1");
    expect(contexts[1].suppliedContext).toContain("paragraph 7");
    expect(contexts[1].suppliedContext).not.toContain("paragraph 8");
    expect(contexts[2].suppliedContext).toContain("paragraph 8");
    expect(contexts[4].suppliedContext).toContain("parent context");
    expect(contexts[5].suppliedContext).toContain("root context");
    expect(contexts.map((context) => context.suppliedContext.length)).toEqual(
      [...contexts]
        .map((context) => context.suppliedContext.length)
        .sort((left, right) => left - right)
    );
    expect(contexts[0].values["selection.prefix"]).toBe("pa");
    expect(contexts[0].values["selection.suffix"]).toBe("ph 4");
    expect(contexts[0].values["section.path"]).toBe(
      "root / parent / current"
    );
  });
});

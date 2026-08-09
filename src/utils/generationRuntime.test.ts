import type { ArticleNode, SelectionState } from "../types";
import { markdownRanges } from "../editor/markdownDocument";
import { assembleGenerationContext } from "./generationRuntime";

function article(id: string, parentId: string | null): ArticleNode {
  return {
    id,
    rootId: "root",
    parentId,
    title: id,
    summary: `${id} summary`,
    type: parentId ? "解释" : "根节点",
    childIds: [],
    createdAt: "2026-07-30T00:00:00.000Z",
    updatedAt: "2026-07-30T00:00:00.000Z"
  };
}

describe("generation context assembly", () => {
  it("derives progressively wider context directly from Markdown documents", () => {
    const root = article("root", null);
    const parent = article("parent", "root");
    const current = article("current", "parent");
    const articles = { root, parent, current };
    const documents = {
      root: "root context\n^root-p1",
      parent: "parent context\n^parent-p1",
      current: [
        "## Section\n^heading",
        ...Array.from({ length: 8 }, (_, index) => `paragraph ${index + 1}\n^p${index + 1}`)
      ].join("\n\n")
    };
    const selectedRange = markdownRanges(documents.current, current.id).find(
      (range) => range.id === "p4"
    )!;
    const selection: SelectionState = {
      text: "graph",
      blockId: "p4",
      start: 2,
      end: 7,
      documentStart: selectedRange.from + 2,
      documentEnd: selectedRange.from + 7
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
      assembleGenerationContext(articles, documents, current, selection, scope)
    );

    expect(contexts[0].suppliedContext).toBe("paragraph 4");
    expect(contexts[1].suppliedContext).toContain("paragraph 1");
    expect(contexts[1].suppliedContext).toContain("paragraph 7");
    expect(contexts[1].suppliedContext).not.toContain("paragraph 8");
    expect(contexts[2].suppliedContext).toContain("paragraph 8");
    expect(contexts[4].suppliedContext).toContain("parent context");
    expect(contexts[5].suppliedContext).toContain("root context");
    expect(contexts.map((context) => context.suppliedContext.length)).toEqual(
      [...contexts].map((context) => context.suppliedContext.length).sort((left, right) => left - right)
    );
    expect(contexts[0].values["selection.prefix"]).toBe("pa");
    expect(contexts[0].values["selection.suffix"]).toBe("ph 4");
    expect(contexts[0].values["section.path"]).toBe("root / parent / current");
  });
});

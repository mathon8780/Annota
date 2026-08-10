import { describe, expect, it } from "vitest";
import type { ArticleNode } from "../types";
import {
  buildArticleDescendantCounts,
  sortArticleChildren,
  sourceBlockIdsInDocumentOrder
} from "./articleNodeOrder";

function article(id: string, overrides: Partial<ArticleNode> = {}): ArticleNode {
  return {
    id,
    rootId: "root",
    parentId: id === "root" ? null : "root",
    title: id,
    summary: "",
    type: "节点",
    childIds: [],
    createdAt: "2026-08-10T00:00:00.000Z",
    updatedAt: "2026-08-10T00:00:00.000Z",
    ...overrides
  };
}

describe("article node order", () => {
  it("builds descendant counts once for the complete article tree", () => {
    const root = article("root", { childIds: ["branch", "leaf"] });
    const branch = article("branch", {
      parentId: "root",
      childIds: ["nested", "nested"]
    });
    const leaf = article("leaf", { parentId: "root" });
    const nested = article("nested", { parentId: "branch" });

    expect(
      Object.fromEntries(
        buildArticleDescendantCounts({ root, branch, leaf, nested })
      )
    ).toMatchObject({ root: 3, branch: 1, leaf: 0, nested: 0 });
  });

  it("orders children by source block and selection offset", () => {
    const root = article("root", { childIds: ["late", "second", "first", "manual"] });
    const articles = {
      root,
      late: article("late", {
        source: { parentId: "root", blockId: "b3", quote: "late", generationType: "note", start: 2 }
      }),
      second: article("second", {
        source: { parentId: "root", blockId: "b1", quote: "second", generationType: "note", start: 12 }
      }),
      first: article("first", {
        source: { parentId: "root", blockId: "b1", quote: "first", generationType: "note", start: 3 }
      }),
      manual: article("manual")
    };

    expect(sortArticleChildren(root, articles, ["b1", "b2", "b3"]).map((item) => item.id)).toEqual([
      "first",
      "second",
      "late",
      "manual"
    ]);
  });

  it("keeps the stored child order when anchors are unavailable", () => {
    const root = article("root", { childIds: ["b", "a"] });
    const articles = { root, a: article("a"), b: article("b") };
    expect(sortArticleChildren(root, articles, []).map((item) => item.id)).toEqual(["b", "a"]);
  });

  it("infers legacy generated block order from stable block ids", () => {
    const root = article("root", { childIds: ["later", "earlier"] });
    const articles = {
      root,
      later: article("later", {
        source: { parentId: "root", blockId: "root-b6", quote: "later", generationType: "note" }
      }),
      earlier: article("earlier", {
        source: { parentId: "root", blockId: "root-b2", quote: "earlier", generationType: "note" }
      })
    };
    const blockIds = sourceBlockIdsInDocumentOrder(root, articles);
    expect(sortArticleChildren(root, articles, blockIds).map((item) => item.id)).toEqual([
      "earlier",
      "later"
    ]);
  });

  it("uses persisted document offsets for custom block ids", () => {
    const root = article("root", { childIds: ["later", "earlier"] });
    const articles = {
      root,
      later: article("later", {
        source: {
          parentId: "root",
          blockId: "custom-later",
          quote: "later",
          generationType: "note",
          documentStart: 480
        }
      }),
      earlier: article("earlier", {
        source: {
          parentId: "root",
          blockId: "custom-earlier",
          quote: "earlier",
          generationType: "note",
          documentStart: 120
        }
      })
    };
    const blockIds = sourceBlockIdsInDocumentOrder(root, articles);
    expect(sortArticleChildren(root, articles, blockIds).map((item) => item.id)).toEqual([
      "earlier",
      "later"
    ]);
  });
});

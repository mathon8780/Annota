import { describe, expect, it } from "vitest";
import type { ArticleNode } from "../types";
import { buildTopologyLayout } from "./TopologyPanel";

function article(
  id: string,
  parentId: string | null,
  childIds: string[],
  blockId?: string
): ArticleNode {
  return {
    id,
    rootId: "root",
    parentId,
    title: id,
    summary: id,
    type: parentId ? "解释" : "根节点",
    childIds,
    createdAt: "2026-08-10T00:00:00.000Z",
    updatedAt: "2026-08-10T00:00:00.000Z",
    source: parentId && blockId
      ? {
          parentId,
          blockId,
          quote: id,
          generationType: "explain"
        }
      : undefined
  };
}

describe("topology branch layout", () => {
  it("orders every branch by source position and reserves its descendant span", () => {
    const articles: Record<string, ArticleNode> = {
      root: article("root", null, ["late", "early", "middle"]),
      early: article("early", "root", ["early-b", "early-a"], "root-b2"),
      middle: article("middle", "root", [], "root-b5"),
      late: article("late", "root", ["late-b", "late-a"], "root-b8"),
      "early-a": article("early-a", "early", [], "early-b1"),
      "early-b": article("early-b", "early", [], "early-b4"),
      "late-a": article("late-a", "late", [], "late-b1"),
      "late-b": article("late-b", "late", [], "late-b4")
    };
    const nodeIds = Object.keys(articles);
    const nodes = Object.fromEntries(
      nodeIds.map((id) => [id, { id }])
    ) as Parameters<typeof buildTopologyLayout>[0];
    const edges = Object.values(articles).flatMap((parent) =>
      parent.childIds.map((childId) => ({
        id: `tree:${parent.id}:${childId}`,
        sourceId: parent.id,
        targetId: childId,
        label: "下一级",
        directed: true,
        persisted: false,
        hierarchical: true
      }))
    ) as Parameters<typeof buildTopologyLayout>[2];

    const layout = buildTopologyLayout(nodes, ["root"], edges, articles);
    const positions = new Map(layout.positions.map((position) => [position.id, position]));

    expect(positions.get("early")!.y).toBeLessThan(positions.get("middle")!.y);
    expect(positions.get("middle")!.y).toBeLessThan(positions.get("late")!.y);
    expect(positions.get("early-a")!.y).toBeLessThan(positions.get("early-b")!.y);
    expect(positions.get("late-a")!.y).toBeLessThan(positions.get("late-b")!.y);
    expect(positions.get("early-b")!.y + 118).toBeLessThan(positions.get("middle")!.y);
    expect(positions.get("middle")!.y + 118).toBeLessThan(positions.get("late-a")!.y);
    expect(positions.get("root")!.y).toBe(positions.get("middle")!.y);
  });
});

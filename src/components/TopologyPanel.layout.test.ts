import { describe, expect, it } from "vitest";
import type { ArticleNode } from "../types";
import {
  buildTopologyLayout,
  resolveCardBody,
  type TopologyDisplayNode
} from "./TopologyPanel";

function article(
  id: string,
  parentId: string | null,
  childIds: string[],
  documentStart?: number
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
    source: parentId && documentStart !== undefined
      ? {
          parentId,
          blockId: `${parentId}-source-${documentStart}`,
          documentStart,
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
      early: article("early", "root", ["early-b", "early-a"], 20),
      middle: article("middle", "root", [], 50),
      late: article("late", "root", ["late-b", "late-a"], 80),
      "early-a": article("early-a", "early", [], 10),
      "early-b": article("early-b", "early", [], 40),
      "late-a": article("late-a", "late", [], 10),
      "late-b": article("late-b", "late", [], 40)
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
    expect(positions.get("early-b")!.y + positions.get("early-b")!.height).toBeLessThan(positions.get("middle")!.y);
    expect(positions.get("middle")!.y + positions.get("middle")!.height).toBeLessThan(positions.get("late-a")!.y);
    expect(positions.get("root")!.y).toBe(positions.get("middle")!.y);
  });

  it("sizes columns by the widest card and reserves per-variant spans", () => {
    const articles: Record<string, ArticleNode> = {
      root: article("root", null, ["t-1", "t-2"]),
      "t-1": article("t-1", "root", [], 10),
      "t-2": article("t-2", "root", [], 20)
    };
    const nodes = {
      root: {
        id: "root",
        nodeType: { cardVariant: "root" },
        body: { kind: "root", description: "" }
      },
      "t-1": {
        id: "t-1",
        nodeType: { cardVariant: "terms" },
        body: { kind: "terms", items: [] }
      },
      "t-2": {
        id: "t-2",
        nodeType: { cardVariant: "terms" },
        body: { kind: "terms", items: [] }
      }
    } as unknown as Parameters<typeof buildTopologyLayout>[0];
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

    expect(positions.get("t-1")!.x).toBeGreaterThan(positions.get("root")!.x + positions.get("root")!.width);
    expect(positions.get("t-1")!.x).toBe(positions.get("t-2")!.x);
    expect(positions.get("t-2")!.y).toBeGreaterThan(positions.get("t-1")!.y + positions.get("t-1")!.height);
    expect(positions.get("root")!.y).toBe(
      (positions.get("t-1")!.y + positions.get("t-2")!.y) / 2
    );
    expect(positions.get("root")!.width).toBeGreaterThan(positions.get("t-1")!.width);
    expect(positions.get("root")!.height).toBeGreaterThan(positions.get("t-1")!.height);
  });

  it("sizes the five new contract variants and summary metric card", () => {
    const articles: Record<string, ArticleNode> = {
      root: article("root", null, ["f-1", "d-1", "p-1", "a-1", "t-1", "s-1"])
    };
    const nodes = {
      root: {
        id: "root",
        nodeType: { cardVariant: "root" },
        body: { kind: "root", description: "" }
      },
      "f-1": {
        id: "f-1",
        nodeType: { cardVariant: "formula" },
        body: { kind: "formula", formula: "E=mc²", note: "" }
      },
      "d-1": {
        id: "d-1",
        nodeType: { cardVariant: "diagram" },
        body: { kind: "diagram", nodes: [], rendering: "" }
      },
      "p-1": {
        id: "p-1",
        nodeType: { cardVariant: "pitfall" },
        body: { kind: "pitfall", bad: "", good: "" }
      },
      "a-1": {
        id: "a-1",
        nodeType: { cardVariant: "analogy" },
        body: { kind: "analogy", text: "" }
      },
      "t-1": {
        id: "t-1",
        nodeType: { cardVariant: "task" },
        body: { kind: "task", status: "", detail: "" }
      },
      "s-1": {
        id: "s-1",
        nodeType: { cardVariant: "summary" },
        body: { kind: "metric", metric: "5", label: "", text: "" }
      }
    } as unknown as Parameters<typeof buildTopologyLayout>[0];
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

    const variants = ["f-1", "d-1", "p-1", "a-1", "t-1", "s-1"];
    for (const id of variants) {
      expect(positions.get(id)!.width).toBeGreaterThan(0);
      expect(positions.get(id)!.height).toBeGreaterThan(0);
      expect(positions.get(id)!.x).toBeGreaterThan(positions.get("root")!.x + positions.get("root")!.width);
    }
    for (let index = 1; index < variants.length; index += 1) {
      const previous = positions.get(variants[index - 1])!;
      const current = positions.get(variants[index])!;
      expect(previous.y + previous.height).toBeLessThan(current.y);
    }
  });

  it("prefers contract content_json over summary text when resolving bodies", () => {
    const node = {
      title: "术语节点",
      summary: "旧摘要",
      nodeType: { cardVariant: "terms" },
      article: {
        contentJson: { "术语": ["Query", "Key", "Value"] }
      }
    } as unknown as TopologyDisplayNode;
    expect(resolveCardBody(node, {})).toEqual({
      kind: "terms",
      items: ["Query", "Key", "Value"]
    });

    const compare = {
      title: "对比节点",
      summary: "旧摘要",
      nodeType: { cardVariant: "compare" },
      article: {
        contentJson: {
          "对比项": [
            { "名称": "RNN", "描述": "顺序计算" },
            { "名称": "Transformer", "描述": "并行计算" }
          ]
        }
      }
    } as unknown as TopologyDisplayNode;
    expect(resolveCardBody(compare, {})).toEqual({
      kind: "split",
      left: "RNN：顺序计算",
      right: "Transformer：并行计算"
    });

    const pitfall = {
      title: "避坑节点",
      summary: "旧摘要",
      nodeType: { cardVariant: "pitfall" },
      article: {
        contentJson: { "误区": "Mask 填充 0", "正解": "填充 −∞" }
      }
    } as unknown as TopologyDisplayNode;
    expect(resolveCardBody(pitfall, {})).toEqual({
      kind: "pitfall",
      bad: "Mask 填充 0",
      good: "填充 −∞"
    });

    const task = {
      title: "任务节点",
      summary: "旧摘要",
      nodeType: { cardVariant: "task" },
      article: {
        contentJson: { "状态": "生成中", "说明": "GPT-4o" }
      }
    } as unknown as TopologyDisplayNode;
    expect(resolveCardBody(task, {})).toEqual({
      kind: "task",
      status: "生成中",
      detail: "GPT-4o"
    });
  });
});

import { beforeEach, describe, expect, it } from "vitest";
import type { ArticleNode, Notebook } from "../types";
import {
  decodeTopologyGraph, loadTopologyGraph, setBrowserLibraryMetadata,
  upsertTopologyInteraction, upsertTopologyNode
} from "./topologyRepository";

const BROWSER_KEY = "annota.topology.sqlite-mock.v1";
const notebook: Notebook = {
  id: "c1", rootId: "a1", rootIds: ["a1"], title: "集合", summary: "",
  description: "", color: "#000", icon: "book", updatedAt: "2026-01-01",
  lastOpenedNodeId: "a1", accent: "cobalt"
};
const root: ArticleNode = {
  id: "a1", rootId: "a1", parentId: null, title: "根", summary: "",
  type: "知识点", childIds: [], createdAt: "2026-01-01",
  updatedAt: "2026-01-01", contentJson: { "文本": "hello" }
};

beforeEach(() => {
  window.localStorage.clear();
  setBrowserLibraryMetadata({ notebooks: [notebook], articles: { a1: root } });
});

describe("topology repository JSON boundary", () => {
  it("encodes once for storage and decodes every JSON column on read", async () => {
    const node = await upsertTopologyNode({
      id: "n1", collectionId: "c1", nodeType: "note", title: "笔记", summary: "",
      contentMode: "database", content: "内容", documentId: null,
      isRoot: false, isManual: true, enabled: true, interactive: true,
      interactionStateJson: { checked: [] }, appearanceJson: { color: "#123456" },
      contentJson: { "文本": "字符串" }, anchorJson: { "起始位置": 10 },
      generationJson: { "模型": "GPT-4o" }, configJson: { displayFields: ["title"] }
    });
    expect(node.generationJson).toEqual({ "模型": "GPT-4o" });
    const stored = JSON.parse(window.localStorage.getItem(BROWSER_KEY) ?? "{}");
    expect(stored.nodes.n1.contentJson).toBe('{"文本":"字符串"}');
    expect(stored.nodes.n1.interactionStateJson).toBe('{"checked":[]}');
    const graph = await loadTopologyGraph("c1");
    expect(graph.nodes.find((value) => value.id === "n1")?.anchorJson).toEqual({ "起始位置": 10 });
    expect(graph.nodes.find((value) => value.id === "a1")?.contentJson).toEqual({ "文本": "hello" });
  });

  it("keeps manual data while deriving article nodes from library metadata", async () => {
    await upsertTopologyInteraction({
      id: "i1", nodeId: "a1", interactionType: "topology-card",
      title: "", configJson: {}, stateJson: { checked: [0] }, enabled: true
    });
    setBrowserLibraryMetadata({
      notebooks: [notebook],
      articles: { a1: { ...root, title: "新标题", contentJson: { "文本": "新正文" } } }
    });
    const graph = await loadTopologyGraph("c1");
    expect(graph.nodes[0].title).toBe("新标题");
    expect(graph.nodes[0].contentJson).toEqual({ "文本": "新正文" });
    expect(graph.interactions[0].stateJson).toEqual({ checked: [0] });
  });

  it("decodes imported Rust TEXT records", () => {
    const graph = decodeTopologyGraph({
      collection: { id: "c1", title: "集合", description: "", createdAt: "", updatedAt: "" },
      nodes: [{
        id: "n1", collectionId: "c1", nodeType: "note", title: "", summary: "",
        contentMode: "database", content: null, documentId: null, isRoot: false,
        isManual: true, enabled: true, interactive: false, interactionStateJson: "{}",
        appearanceJson: "{}", contentJson: '{"文本":"value"}', anchorJson: null,
        generationJson: null, configJson: null, createdAt: "", updatedAt: ""
      }],
      relations: [], interactions: []
    });
    expect(graph.nodes[0].contentJson).toEqual({ "文本": "value" });
    expect(graph.nodes[0].interactionStateJson).toEqual({});
  });
});

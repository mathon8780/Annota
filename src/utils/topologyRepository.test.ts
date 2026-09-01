import { beforeEach, describe, expect, it } from "vitest";
import {
  syncMarkdownTopology,
  upsertTopologyNode
} from "./topologyRepository";

const BROWSER_KEY = "annota.topology.sqlite-mock.v1";

function readState() {
  return JSON.parse(window.localStorage.getItem(BROWSER_KEY) ?? "{}");
}

beforeEach(() => {
  window.localStorage.clear();
});

describe("topology repository JSON serialization", () => {
  it("serializes object JSON fields to strings before persistence", async () => {
    await syncMarkdownTopology({
      collection: { id: "c1", title: "集合", description: "" },
      nodes: [
        {
          id: "a1",
          collectionId: "c1",
          nodeType: "root",
          title: "根",
          summary: "",
          contentMode: "markdown",
          content: null,
          documentId: "a1",
          isRoot: true,
          isManual: false,
          enabled: true,
          interactive: false,
          interactionStateJson: "{}",
          appearanceJson: "{}",
          family: "笔记",
          creationMethod: "导入",
          contentJson: { "文本": "hello" },
          anchorJson: { "起始位置": 10 },
          generationJson: { "模型": "GPT-4o" }
        }
      ],
      relations: []
    });
    const stored = readState();
    expect(typeof stored.nodes["a1"].contentJson).toBe("string");
    expect(JSON.parse(stored.nodes["a1"].contentJson)).toEqual({ "文本": "hello" });
    expect(typeof stored.nodes["a1"].anchorJson).toBe("string");
    expect(typeof stored.nodes["a1"].generationJson).toBe("string");
  });

  it("keeps already-string JSON fields as-is", async () => {
    await upsertTopologyNode({
      id: "n1",
      collectionId: "c1",
      nodeType: "note",
      title: "笔记",
      summary: "",
      contentMode: "database",
      content: "内容",
      documentId: null,
      isRoot: false,
      isManual: true,
      enabled: true,
      interactive: false,
      interactionStateJson: "{}",
      appearanceJson: "{}",
      family: "笔记",
      creationMethod: "手动",
      contentJson: '{"文本":"字符串"}',
      configJson: '{"displayFields":["title"]}'
    });
    const stored = readState();
    expect(stored.nodes["n1"].contentJson).toBe('{"文本":"字符串"}');
    expect(stored.nodes["n1"].configJson).toBe('{"displayFields":["title"]}');
  });

  it("drops undefined JSON fields and keeps null", async () => {
    await upsertTopologyNode({
      id: "n2",
      collectionId: "c1",
      nodeType: "note",
      title: "笔记",
      summary: "",
      contentMode: "database",
      content: null,
      documentId: null,
      isRoot: false,
      isManual: true,
      enabled: true,
      interactive: false,
      interactionStateJson: "{}",
      appearanceJson: "{}",
      family: "笔记",
      creationMethod: "手动",
      contentJson: undefined,
      anchorJson: null,
      configJson: undefined
    });
    const stored = readState();
    expect(stored.nodes["n2"].contentJson).toBeUndefined();
    expect(stored.nodes["n2"].anchorJson).toBeNull();
    expect(stored.nodes["n2"].configJson).toBeUndefined();
  });
});

import { act, renderHook, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { clearMarkdownWorkspaceSession } from "../editor/markdownRepository";
import type { ArticleNode, Notebook } from "../types";
import { APP_DATA_STORAGE_KEY, AppStoreProvider, useAppStore } from "./AppStore";

const stamp = "2026-10-16T00:00:00.000Z";
const root: ArticleNode = {
  id: "root-1", rootId: "root-1", parentId: null, title: "原文", summary: "原文摘要",
  type: "根节点", childIds: [], createdAt: stamp, updatedAt: stamp
};
const notebook: Notebook = {
  id: "collection-1", rootId: root.id, rootIds: [root.id], title: "学习集合",
  summary: "", description: "", color: "#315fdb", icon: "library",
  updatedAt: stamp, lastOpenedNodeId: root.id, accent: "cobalt"
};
const metadata = { notebooks: [notebook], articles: { [root.id]: root } };

async function readBlob(blob: Blob) {
  return new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(reader.error);
    reader.readAsText(blob);
  });
}

beforeEach(() => {
  window.localStorage.clear();
  clearMarkdownWorkspaceSession();
});

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  clearMarkdownWorkspaceSession();
});

it("roundtrips edited manual card content, relations, and independent interactions", async () => {
  window.localStorage.setItem(APP_DATA_STORAGE_KEY, JSON.stringify(metadata));
  window.localStorage.setItem("annota:markdown-document.v1:root-1", "# 原文\n正文");
  const source = renderHook(() => useAppStore(), { wrapper: AppStoreProvider });

  act(() => source.result.current.openNotebook(notebook.id));
  await waitFor(() => expect(source.result.current.topologyGraph?.nodes.some((node) => node.id === root.id)).toBe(true));

  let manualId = "";
  await act(async () => {
    const manual = await source.result.current.createManualTopologyNode({
      nodeType: "note", title: "手动卡片", content: "初稿", parentId: root.id,
      isRoot: false, interactive: true, icon: "note", cardVariant: "note", color: "#315fdb"
    });
    manualId = manual?.id ?? "";
  });
  expect(manualId).not.toBe("");
  await act(async () => {
    await source.result.current.updateTopologyCard(manualId, { content: "修订后的正文" });
    await source.result.current.updateTopologyInteraction(manualId, "checked", { checked: true });
    await source.result.current.updateTopologyInteraction(manualId, "revealed", { revealed: true });
  });

  source.unmount();
  const reopened = renderHook(() => useAppStore(), { wrapper: AppStoreProvider });
  act(() => reopened.result.current.openNotebook(notebook.id));
  await waitFor(() => expect(reopened.result.current.topologyGraph?.nodes.find((node) => node.id === manualId)?.content).toBe("修订后的正文"));
  const reopenedGraph = reopened.result.current.topologyGraph!;
  expect(reopenedGraph.relations.some((relation) => relation.sourceNodeId === root.id && relation.targetNodeId === manualId)).toBe(true);
  expect(reopenedGraph.interactions.find((item) => item.interactionType === "checked")?.stateJson).toEqual({ checked: true });
  expect(reopenedGraph.interactions.find((item) => item.interactionType === "revealed")?.stateJson).toEqual({ revealed: true });

  let exportedBlob: Blob | undefined;
  vi.stubGlobal("URL", {
    ...URL,
    createObjectURL: (blob: Blob) => { exportedBlob = blob; return "blob:annota-test"; },
    revokeObjectURL: () => undefined
  });
  vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(() => undefined);
  await act(async () => reopened.result.current.exportCurrentTree());
  expect(exportedBlob).toBeDefined();
  const payload = await readBlob(exportedBlob!);
  expect(JSON.parse(payload)).toMatchObject({
    notebooks: [{ rootIds: [root.id] }],
    documents: { [root.id]: "# 原文\n正文" },
    topology: { nodes: expect.arrayContaining([expect.objectContaining({ id: manualId, content: "修订后的正文" })]) }
  });

  reopened.unmount();
  window.localStorage.clear();
  clearMarkdownWorkspaceSession();
  const restored = renderHook(() => useAppStore(), { wrapper: AppStoreProvider });
  let imported: Awaited<ReturnType<typeof restored.result.current.importPackage>> | undefined;
  await act(async () => { imported = await restored.result.current.importPackage(payload, "learning.annota"); });
  expect(imported?.ok).toBe(true);
  act(() => restored.result.current.openNotebook(notebook.id));
  await waitFor(() => expect(restored.result.current.topologyGraph?.nodes.find((node) => node.id === manualId)?.content).toBe("修订后的正文"));
  expect(restored.result.current.topologyGraph?.relations.some((relation) => relation.targetNodeId === manualId)).toBe(true);
  expect(restored.result.current.topologyGraph?.interactions).toEqual(expect.arrayContaining([
    expect.objectContaining({ interactionType: "checked", stateJson: { checked: true } }),
    expect.objectContaining({ interactionType: "revealed", stateJson: { revealed: true } })
  ]));
});

it("rejects invalid package metadata before writing Markdown or topology", async () => {
  const store = renderHook(() => useAppStore(), { wrapper: AppStoreProvider });
  const invalid = {
    format: "annota-v2",
    notebooks: [{ ...notebook, rootIds: [] }],
    articles: metadata.articles,
    documents: { [root.id]: "不可写入" },
    topology: { collection: { id: notebook.id }, nodes: [], relations: [], interactions: [] }
  };
  let result: Awaited<ReturnType<typeof store.result.current.importPackage>> | undefined;
  await act(async () => { result = await store.result.current.importPackage(JSON.stringify(invalid), "invalid.annota"); });
  expect(result?.ok).toBe(false);
  expect(window.localStorage.getItem("annota:markdown-document.v1:root-1")).toBeNull();
  expect(window.localStorage.getItem("annota.topology.sqlite-mock.v1")).toBeNull();
  expect(store.result.current.data.notebooks).toEqual([]);
});

import { beforeEach, describe, expect, it } from "vitest";
import {
  clearBrowserMarkdownDocuments,
  loadMarkdownDocument,
  loadMarkdownSearchText,
  subscribeMarkdownSearchDocuments,
  saveMarkdownDocument
} from "./markdownRepository";

describe("browser Markdown repository fallback", () => {
  beforeEach(() => {
    clearBrowserMarkdownDocuments();
  });

  it("creates once, saves, and never lets a later seed overwrite the document", async () => {
    const created = await loadMarkdownDocument("article-1", "# 初始\n");
    expect(created).toEqual({
      content: "# 初始\n",
      relativePath: "browser/article-1.md"
    });

    await saveMarkdownDocument("article-1", "# 已更新\n");
    const reloaded = await loadMarkdownDocument("article-1", "# 旧 seed\n");

    expect(reloaded.content).toBe("# 已更新\n");
  });

  it("rejects ids that could escape the managed document namespace", async () => {
    await expect(loadMarkdownDocument("../outside", "text")).rejects.toThrow(
      "文档标识无效"
    );
  });

  it("caches searchable text and publishes only meaningful saved changes", async () => {
    await loadMarkdownDocument("article-1", "# 初始\n^internal");
    expect(await loadMarkdownSearchText("article-1")).toBe("初始");

    const updates: Array<[string, string]> = [];
    const unsubscribe = subscribeMarkdownSearchDocuments((documentId, text) => {
      updates.push([documentId, text]);
    });
    await saveMarkdownDocument("article-1", "# 更新内容\n");
    await saveMarkdownDocument("article-1", "# **更新内容**\n");
    unsubscribe();

    expect(updates).toEqual([["article-1", "更新内容"]]);
    expect(await loadMarkdownSearchText("article-1")).toBe("更新内容");
  });
});

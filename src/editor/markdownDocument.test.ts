import { describe, expect, it } from "vitest";
import { markdownRanges, markdownSelection, markdownToPlainText } from "./markdownDocument";

describe("Markdown document derivation", () => {
  const source = "## 标题\n^heading\n\n正文内容\n^paragraph\n\n> 引用\n^quote";

  it("derives addressable ranges without creating a second persisted body model", () => {
    const ranges = markdownRanges(source, "article-1");
    expect(ranges.map(({ id, kind, text }) => ({ id, kind, text }))).toEqual([
      { id: "heading", kind: "heading", text: "标题" },
      { id: "paragraph", kind: "paragraph", text: "正文内容" },
      { id: "quote", kind: "quote", text: "引用" }
    ]);
  });

  it("maps a CodeMirror selection to its Markdown range and document offsets", () => {
    const from = source.indexOf("正文");
    expect(markdownSelection(source, "article-1", from, from + 2)).toEqual({
      text: "正文",
      blockId: "paragraph",
      start: 0,
      end: 2,
      documentStart: from,
      documentEnd: from + 2
    });
  });

  it("creates searchable plain text without leaking internal anchors", () => {
    expect(markdownToPlainText(source)).toContain("标题");
    expect(markdownToPlainText(source)).toContain("正文内容");
    expect(markdownToPlainText(source)).not.toContain("^paragraph");
  });
});

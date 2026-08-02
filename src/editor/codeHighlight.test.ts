import { EditorState } from "@codemirror/state";
import { EditorView } from "@codemirror/view";
import { afterEach, describe, expect, it } from "vitest";
import {
  fencedCodeHighlightExtension,
  highlightedCodeHtml,
  highlightedCodeLineHtml,
  highlightedCodeSpans,
  normalizeCodeLanguage
} from "./codeHighlight";

afterEach(() => {
  document.body.replaceChildren();
});

describe("codeHighlight", () => {
  it("normalizes common Markdown fence aliases", () => {
    expect(normalizeCodeLanguage("TS")).toBe("typescript");
    expect(normalizeCodeLanguage("c#")).toBe("csharp");
    expect(normalizeCodeLanguage("csharp")).toBe("csharp");
    expect(normalizeCodeLanguage("unknown-language")).toBeNull();
  });

  it("highlights registered languages and safely escapes source", () => {
    const result = highlightedCodeHtml('const value = "<tag>";', "js");

    expect(result?.language).toBe("javascript");
    expect(result?.html).toContain("hljs-keyword");
    expect(result?.html).toContain("&lt;tag&gt;");
    expect(result?.html).not.toContain("<tag>");
  });

  it("returns plain-text fallback for unspecified languages", () => {
    expect(highlightedCodeLineHtml("some content", "unknown-language")).toBeNull();
    expect(highlightedCodeLineHtml("some content", "")).toBeNull();
  });

  it("maps highlighted tokens back to source offsets for active editor lines", () => {
    const source = "const answer = 42;";
    const spans = highlightedCodeSpans(source, "ts");
    const keyword = spans.find((span) => span.className === "hljs-keyword");
    const number = spans.find((span) => span.className === "hljs-number");

    expect(source.slice(keyword?.from, keyword?.to)).toBe("const");
    expect(source.slice(number?.from, number?.to)).toBe("42");
  });

  it("keeps language colors while fenced code is edited as source", () => {
    const doc = ["```ts", "const answer: number = 42;", "```"].join("\n");
    const parent = document.createElement("div");
    document.body.append(parent);
    const view = new EditorView({
      parent,
      state: EditorState.create({
        doc,
        extensions: [fencedCodeHighlightExtension]
      })
    });

    expect(view.dom.querySelector(".hljs-keyword")?.textContent).toBe("const");
    expect(view.dom.querySelector(".hljs-built_in")?.textContent).toBe("number");
    expect(view.dom.querySelector(".hljs-number")?.textContent).toBe("42");
    view.destroy();
  });
});

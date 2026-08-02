import { markdown, markdownLanguage } from "@codemirror/lang-markdown";
import { highlightingFor } from "@codemirror/language";
import { EditorState } from "@codemirror/state";
import { EditorView } from "@codemirror/view";
import { GFM } from "@lezer/markdown";
import { tags } from "@lezer/highlight";
import { afterEach, describe, expect, it } from "vitest";
import {
  markdownEditorAppearance,
  sourceModeHeadingExtension
} from "./editorAppearance";

afterEach(() => {
  document.body.replaceChildren();
});

describe("markdownEditorAppearance", () => {
  it("provides explicit theme-aware styles for Markdown semantic formats", () => {
    const state = EditorState.create({
      doc: "# 标题\n\n**加粗**、*斜体*与`代码`",
      extensions: [
        markdown({ base: markdownLanguage, extensions: [GFM] }),
        markdownEditorAppearance
      ]
    });

    expect(highlightingFor(state, [tags.heading1])).toBeTruthy();
    expect(highlightingFor(state, [tags.strong])).toBeTruthy();
    expect(highlightingFor(state, [tags.emphasis])).toBeTruthy();
    expect(highlightingFor(state, [tags.monospace])).toBeTruthy();
    expect(highlightingFor(state, [tags.meta])).toBeTruthy();
  });

  it("marks the cursor line so the theme can keep it visible", () => {
    const parent = document.createElement("div");
    document.body.append(parent);
    const view = new EditorView({
      parent,
      state: EditorState.create({
        doc: "正文\n下一行",
        extensions: [markdownEditorAppearance]
      })
    });

    expect(view.dom.querySelector(".cm-activeLine")).not.toBeNull();
    view.destroy();
  });

  it("keeps all ATX heading levels on heading geometry in source mode", () => {
    const parent = document.createElement("div");
    document.body.append(parent);
    const doc = [
      "# 一级",
      "## 二级",
      "### 三级",
      "#### 四级",
      "##### 五级",
      "###### 六级",
      "正文"
    ].join("\n");
    const view = new EditorView({
      parent,
      state: EditorState.create({
        doc,
        extensions: [
          markdown({ base: markdownLanguage, extensions: [GFM] }),
          markdownEditorAppearance,
          sourceModeHeadingExtension
        ]
      })
    });

    for (let level = 1; level <= 6; level += 1) {
      const heading = view.dom.querySelector(`.cm-source-heading-${level}`);
      expect(heading).not.toBeNull();
      expect(heading?.textContent).toMatch(new RegExp(`^#{${level}} `));
    }
    expect(view.dom.querySelectorAll(".cm-source-heading")).toHaveLength(6);
    expect(view.dom.querySelector(".cm-line:last-child")).not.toHaveClass(
      "cm-source-heading"
    );
    view.destroy();
  });
});

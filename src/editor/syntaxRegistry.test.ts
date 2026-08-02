import { beforeEach, describe, expect, it } from "vitest";
import {
  loadMarkdownSyntaxIds,
  MARKDOWN_SYNTAX_STORAGE_KEY,
  saveMarkdownSyntaxIds
} from "./syntaxRegistry";

describe("syntaxRegistry", () => {
  beforeEach(() => window.localStorage.clear());

  it("enables math and diagrams for existing v2 preferences", () => {
    window.localStorage.setItem(
      "annota:markdown-syntax.v2",
      JSON.stringify(["inline-formatting"])
    );

    expect(loadMarkdownSyntaxIds()).toEqual(["inline-formatting", "math-and-diagrams"]);
  });

  it("preserves an explicit v3 choice when saving and loading", () => {
    saveMarkdownSyntaxIds(["commonmark-structure"]);

    expect(window.localStorage.getItem(MARKDOWN_SYNTAX_STORAGE_KEY)).toBe(
      JSON.stringify(["commonmark-structure"])
    );
    expect(loadMarkdownSyntaxIds()).toEqual(["commonmark-structure"]);
  });
});

import { beforeEach, describe, expect, it } from "vitest";
import {
  loadMarkdownSyntaxIds,
  MARKDOWN_SYNTAX_STORAGE_KEY,
  saveMarkdownSyntaxIds
} from "./syntaxRegistry";

describe("syntaxRegistry", () => {
  beforeEach(() => window.localStorage.clear());

  it("preserves an explicit v3 choice when saving and loading", () => {
    saveMarkdownSyntaxIds(["commonmark-structure"]);

    expect(window.localStorage.getItem(MARKDOWN_SYNTAX_STORAGE_KEY)).toBe(
      JSON.stringify(["commonmark-structure"])
    );
    expect(loadMarkdownSyntaxIds()).toEqual(["commonmark-structure"]);
  });

  it("ignores unknown entries in current preferences", () => {
    window.localStorage.setItem(
      MARKDOWN_SYNTAX_STORAGE_KEY,
      JSON.stringify(["inline-formatting", "unknown-syntax"])
    );

    expect(loadMarkdownSyntaxIds()).toEqual(["inline-formatting"]);
  });
});

import { describe, expect, it } from "vitest";
import type { ContentBlock, InlineMark } from "../types";
import {
  mergeBlockMarks,
  splitBlockMarks,
  toggleInlineMark,
  transformMarksForTextChange
} from "./inlineMarks";

function block(text: string, marks: InlineMark[] = []): ContentBlock {
  return { id: "block-1", kind: "paragraph", text, marks };
}

function withoutIds(marks: InlineMark[] | undefined) {
  return (marks ?? []).map(({ id: _id, ...mark }) => mark);
}

describe("inline mark ranges", () => {
  it("adds a boolean mark to the selected range", () => {
    const result = toggleInlineMark(block("abcdefgh"), { start: 2, end: 6 }, "bold");

    expect(withoutIds(result.marks)).toEqual([{ type: "bold", start: 2, end: 6 }]);
  });

  it("removes only the selected part when the same mark already covers it", () => {
    const result = toggleInlineMark(
      block("abcdefgh", [{ id: "bold-1", type: "bold", start: 2, end: 6 }]),
      { start: 3, end: 5 },
      "bold"
    );

    expect(withoutIds(result.marks)).toEqual([
      { type: "bold", start: 2, end: 3 },
      { type: "bold", start: 5, end: 6 }
    ]);
  });

  it("replaces text color inside the selected range while preserving the outside color", () => {
    const result = toggleInlineMark(
      block("abcdefgh", [
        { id: "yellow-1", type: "textColor", start: 0, end: 5, color: "#ca8a04" }
      ]),
      { start: 2, end: 5 },
      "textColor",
      "#2563eb"
    );

    expect(withoutIds(result.marks)).toEqual([
      { type: "textColor", start: 0, end: 2, color: "#ca8a04" },
      { type: "textColor", start: 2, end: 5, color: "#2563eb" }
    ]);
  });

  it("shifts a mark when text is inserted before it", () => {
    const result = transformMarksForTextChange(
      block("abcdef", [{ id: "bold-1", type: "bold", start: 2, end: 4 }]),
      "abXXcdef"
    );

    expect(result.text).toBe("abXXcdef");
    expect(withoutIds(result.marks)).toEqual([{ type: "bold", start: 4, end: 6 }]);
  });

  it("shrinks a mark when text inside it is deleted", () => {
    const result = transformMarksForTextChange(
      block("abcdefgh", [{ id: "bold-1", type: "bold", start: 2, end: 7 }]),
      "abfgh"
    );

    expect(result.text).toBe("abfgh");
    expect(withoutIds(result.marks)).toEqual([{ type: "bold", start: 2, end: 4 }]);
  });

  it("splits a crossing mark between the two resulting blocks", () => {
    const [left, right] = splitBlockMarks(
      block("abcdefgh", [{ id: "underline-1", type: "underline", start: 2, end: 6 }]),
      4
    );

    expect(left.text).toBe("abcd");
    expect(right.text).toBe("efgh");
    expect(withoutIds(left.marks)).toEqual([{ type: "underline", start: 2, end: 4 }]);
    expect(withoutIds(right.marks)).toEqual([{ type: "underline", start: 0, end: 2 }]);
  });

  it("shifts marks from the right block when blocks are merged", () => {
    const result = mergeBlockMarks(
      block("abc", [{ id: "bold-1", type: "bold", start: 0, end: 2 }]),
      {
        id: "block-2",
        kind: "paragraph",
        text: "de",
        marks: [{ id: "italic-1", type: "italic", start: 0, end: 2 }]
      }
    );

    expect(result.text).toBe("abcde");
    expect(withoutIds(result.marks)).toEqual([
      { type: "bold", start: 0, end: 2 },
      { type: "italic", start: 3, end: 5 }
    ]);
  });
});

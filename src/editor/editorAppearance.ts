import { HighlightStyle, syntaxHighlighting } from "@codemirror/language";
import { Decoration, EditorView, highlightActiveLine } from "@codemirror/view";
import { tags } from "@lezer/highlight";

export const markdownHighlightStyle = HighlightStyle.define([
  { tag: tags.heading1, color: "var(--color-heading-1)", fontWeight: "700" },
  { tag: tags.heading2, color: "var(--color-heading-2)", fontWeight: "700" },
  { tag: tags.heading3, color: "var(--color-heading-3)", fontWeight: "700" },
  { tag: tags.heading4, color: "var(--color-heading-4)", fontWeight: "700" },
  { tag: tags.heading5, color: "var(--color-heading-5)", fontWeight: "700" },
  { tag: tags.heading6, color: "var(--color-heading-6)", fontWeight: "700" },
  { tag: tags.strong, color: "var(--color-mark-strong)", fontWeight: "600" },
  { tag: tags.emphasis, color: "var(--color-mark-emphasis)", fontStyle: "italic" },
  { tag: tags.strikethrough, color: "var(--color-editor-marker)", textDecoration: "line-through" },
  { tag: [tags.link, tags.url], color: "var(--color-link)", textDecoration: "none" },
  { tag: tags.monospace, color: "var(--color-code-text)" },
  { tag: [tags.meta, tags.punctuation], color: "var(--color-editor-marker)" },
  { tag: [tags.keyword, tags.operatorKeyword], color: "var(--color-syntax-keyword)" },
  { tag: [tags.string, tags.character], color: "var(--color-syntax-string)" },
  { tag: [tags.number, tags.bool, tags.atom], color: "var(--color-syntax-number)" },
  { tag: [tags.comment, tags.docComment], color: "var(--color-syntax-comment)", fontStyle: "italic" },
  { tag: [tags.typeName, tags.className], color: "var(--color-syntax-type)" },
  { tag: tags.invalid, color: "var(--color-syntax-invalid)", textDecoration: "underline wavy" }
]);

export const sourceModeHeadingExtension = EditorView.decorations.compute(
  ["doc"],
  (state) => {
    const decorations = [];
    for (let lineNumber = 1; lineNumber <= state.doc.lines; lineNumber += 1) {
      const line = state.doc.line(lineNumber);
      const heading = /^(#{1,6})\s+/.exec(line.text);
      if (!heading) continue;
      decorations.push(
        Decoration.line({
          class: `cm-source-heading cm-source-heading-${heading[1].length}`
        }).range(line.from)
      );
    }
    return Decoration.set(decorations);
  }
);

export const markdownEditorAppearance = [
  highlightActiveLine(),
  EditorView.theme({
    "&": {
      color: "var(--color-editor-text)",
      backgroundColor: "transparent"
    },
    ".cm-content": {
      caretColor: "var(--color-editor-caret)"
    },
    ".cm-cursor, .cm-dropCursor": {
      borderLeftColor: "var(--color-editor-caret)",
      borderLeftWidth: "2px"
    },
    ".cm-activeLine": {
      backgroundColor: "var(--color-editor-active-line)"
    },
    "&.cm-focused .cm-selectionBackground, .cm-selectionBackground": {
      backgroundColor: "var(--color-editor-selection)"
    },
    ".cm-content ::selection": {
      color: "var(--color-editor-selection-text)",
      backgroundColor: "var(--color-editor-selection)"
    }
  }),
  syntaxHighlighting(markdownHighlightStyle)
];

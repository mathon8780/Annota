import { StateField, type EditorState } from "@codemirror/state";

export interface FencedCodeBlock {
  startLine: number;
  endLine: number;
  language: string;
}

export interface FencedCodeSnapshot {
  blocks: readonly FencedCodeBlock[];
  code: ReadonlySet<number>;
  fences: ReadonlySet<number>;
}

function scanFencedCode(state: EditorState): FencedCodeSnapshot {
  const blocks: FencedCodeBlock[] = [];
  const code = new Set<number>();
  const fences = new Set<number>();
  let open: { startLine: number; language: string; marker: string; length: number } | null = null;

  for (let lineNumber = 1; lineNumber <= state.doc.lines; lineNumber += 1) {
    const match = /^ {0,3}(`{3,}|~{3,})(.*)$/.exec(state.doc.line(lineNumber).text);
    if (!open && match) {
      open = {
        startLine: lineNumber,
        language: match[2].trim().split(/\s+/)[0] ?? "",
        marker: match[1][0],
        length: match[1].length
      };
      code.add(lineNumber);
      fences.add(lineNumber);
      continue;
    }
    if (!open) continue;
    code.add(lineNumber);
    if (match && match[1][0] === open.marker &&
      match[1].length >= open.length && !match[2].trim()) {
      fences.add(lineNumber);
      blocks.push({ startLine: open.startLine, endLine: lineNumber, language: open.language });
      open = null;
    }
  }
  if (open) blocks.push({ startLine: open.startLine, endLine: state.doc.lines, language: open.language });
  return { blocks, code, fences };
}

export const fencedCodeState = StateField.define<FencedCodeSnapshot>({
  create: scanFencedCode,
  update(value, transaction) {
    return transaction.docChanged ? scanFencedCode(transaction.state) : value;
  }
});

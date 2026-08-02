import type { EditorState, Extension } from "@codemirror/state";
import {
  Decoration,
  EditorView,
  WidgetType
} from "@codemirror/view";
import { highlightedCodeLineHtml } from "./codeHighlight";
import {
  findInlineMath,
  renderMathHtml,
  renderMermaidDiagram
} from "./richPreview";
import type { MarkdownSyntaxId } from "./syntaxRegistry";

type DecorationRange = ReturnType<Decoration["range"]>;

type TableAlignment = "left" | "center" | "right" | undefined;

interface TableCell {
  text: string;
}

interface TableRow {
  cells: readonly TableCell[];
}

interface TableBlock {
  alignments: readonly TableAlignment[];
  from: number;
  header: TableRow;
  rows: readonly TableRow[];
  source: string;
  startLine: number;
  to: number;
}

interface CodeLine {
  from: number;
  isFence: boolean;
  text: string;
}

interface CodeBlock {
  endLine: number;
  from: number;
  language: string;
  lines: readonly CodeLine[];
  source: string;
  startLine: number;
  to: number;
}

interface MathBlock {
  endLine: number;
  expression: string;
  from: number;
  source: string;
  startLine: number;
  to: number;
}

type MathDelimiter = "$$" | "\\[";

interface CalloutLine {
  from: number;
  text: string;
}

interface CalloutBlock {
  endLine: number;
  from: number;
  lines: readonly CalloutLine[];
  source: string;
  startLine: number;
  title: string;
  to: number;
  type: string;
}

interface BlockLines {
  callouts: ReadonlyMap<number, CalloutBlock>;
  code: ReadonlySet<number>;
  codeBlocks: ReadonlyMap<number, CodeBlock>;
  fences: ReadonlySet<number>;
  mathBlocks: ReadonlyMap<number, MathBlock>;
  tables: ReadonlyMap<number, TableBlock>;
}

function tableCells(source: string): TableCell[] {
  const firstContent = source.search(/\S/);
  if (firstContent < 0) return [];
  const trimmedEnd = source.trimEnd().length;
  const startsWithPipe = source[firstContent] === "|";
  const endsWithPipe = source[trimmedEnd - 1] === "|";
  const start = firstContent + (startsWithPipe ? 1 : 0);
  const end = trimmedEnd - (endsWithPipe ? 1 : 0);
  const cells: TableCell[] = [];
  let cellStart = start;

  const pushCell = (cellEnd: number) => {
    const raw = source.slice(cellStart, cellEnd);
    cells.push({
      text: raw.trim().replace(/\\\|/g, "|")
    });
  };

  for (let index = start; index < end; index += 1) {
    if (source[index] !== "|") continue;
    let slashCount = 0;
    for (let cursor = index - 1; cursor >= start && source[cursor] === "\\"; cursor -= 1) {
      slashCount += 1;
    }
    if (slashCount % 2) continue;
    pushCell(index);
    cellStart = index + 1;
  }
  pushCell(end);
  return cells;
}

function isTableRow(source: string) {
  return source.includes("|") && tableCells(source).length >= 2;
}

function isTableDelimiter(source: string) {
  const cells = tableCells(source);
  return cells.length >= 2 && cells.every((cell) => /^:?-+:?$/.test(cell.text));
}

function mathOpening(source: string): { delimiter: MathDelimiter; remainder: string } | null {
  const dollars = /^ {0,3}\$\$(?!\$)(.*)$/.exec(source);
  if (dollars) return { delimiter: "$$", remainder: dollars[1] };
  const brackets = /^ {0,3}\\\[(.*)$/.exec(source);
  if (brackets) return { delimiter: "\\[", remainder: brackets[1] };
  return null;
}

function expressionBeforeMathClose(source: string, delimiter: MathDelimiter): string | null {
  const close = delimiter === "$$" ? "$$" : "\\]";
  const trimmed = source.trimEnd();
  if (!trimmed.endsWith(close)) return null;
  const closeFrom = trimmed.length - close.length;
  if (delimiter === "$$") {
    let slashCount = 0;
    for (let cursor = closeFrom - 1; cursor >= 0 && trimmed[cursor] === "\\"; cursor -= 1) {
      slashCount += 1;
    }
    if (slashCount % 2 === 1) return null;
  }
  return trimmed.slice(0, closeFrom);
}

function tableAlignment(cell: TableCell): TableAlignment {
  if (cell.text.startsWith(":")) return cell.text.endsWith(":") ? "center" : "left";
  return cell.text.endsWith(":") ? "right" : undefined;
}

class CodeBlockWidget extends WidgetType {
  constructor(private readonly block: CodeBlock) {
    super();
  }

  eq(other: CodeBlockWidget) {
    return this.block.source === other.block.source && this.block.from === other.block.from;
  }

  toDOM(view: EditorView) {
    const pre = document.createElement("pre");
    pre.className = "cm-live-code-widget";
    pre.setAttribute("aria-label", "Markdown 代码块，点击代码行编辑源码");
    if (this.block.language) pre.dataset.language = this.block.language;

    const code = document.createElement("code");
    code.className = "hljs";
    this.block.lines.forEach((line) => {
      const element = document.createElement("span");
      element.className = `cm-live-code-widget-line${line.isFence ? " cm-live-code-widget-fence" : ""}${line.text ? "" : " cm-live-code-widget-empty"}`;
      element.dataset.sourcePos = String(line.from);
      if (line.isFence) {
        element.textContent = "";
      } else {
        const highlighted = highlightedCodeLineHtml(line.text, this.block.language);
        if (highlighted === null) element.textContent = line.text;
        else element.innerHTML = highlighted;
      }
      code.append(element);
    });
    pre.append(code);

    pre.addEventListener("mousedown", (event) => {
      const line = (event.target as HTMLElement).closest<HTMLElement>("[data-source-pos]");
      if (!line) return;
      const anchor = Number(line.dataset.sourcePos);
      if (!Number.isFinite(anchor)) return;
      event.preventDefault();
      view.dispatch({ selection: { anchor }, scrollIntoView: true });
      view.focus();
    });
    view.requestMeasure();
    return pre;
  }

  ignoreEvent() {
    return false;
  }
}

function codeBlockBody(block: CodeBlock) {
  return block.lines
    .filter((line) => !line.isFence)
    .map((line) => line.text)
    .join("\n");
}

class MathWidget extends WidgetType {
  constructor(
    private readonly expression: string,
    private readonly sourceFrom: number,
    private readonly displayMode: boolean
  ) {
    super();
  }

  eq(other: MathWidget) {
    return this.expression === other.expression &&
      this.sourceFrom === other.sourceFrom &&
      this.displayMode === other.displayMode;
  }

  toDOM(view: EditorView) {
    const element = document.createElement(this.displayMode ? "div" : "span");
    element.className = this.displayMode ? "cm-live-math-block" : "cm-live-math-inline";
    element.dataset.sourcePos = String(this.sourceFrom);
    element.setAttribute("aria-label", `${this.displayMode ? "块级" : "行内"}数学公式：${this.expression}`);
    element.innerHTML = renderMathHtml(this.expression, this.displayMode);
    element.addEventListener("mousedown", (event) => {
      event.preventDefault();
      view.dispatch({ selection: { anchor: this.sourceFrom }, scrollIntoView: true });
      view.focus();
    });
    return element;
  }

  ignoreEvent() {
    return false;
  }
}

class MermaidWidget extends WidgetType {
  private readonly disposed = new WeakSet<HTMLElement>();

  constructor(private readonly block: CodeBlock) {
    super();
  }

  eq(other: MermaidWidget) {
    return this.block.source === other.block.source && this.block.from === other.block.from;
  }

  toDOM(view: EditorView) {
    const figure = document.createElement("figure");
    figure.className = "cm-live-mermaid";
    figure.dataset.sourcePos = String(this.block.from);
    figure.setAttribute("aria-label", "Mermaid 图表，点击编辑源代码");

    const stage = document.createElement("div");
    stage.className = "cm-live-mermaid-stage is-loading";
    stage.setAttribute("aria-busy", "true");
    stage.textContent = "正在渲染 Mermaid 图表…";
    figure.append(stage);

    void renderMermaidDiagram(codeBlockBody(this.block))
      .then(({ svg, bindFunctions }) => {
        if (this.disposed.has(figure) || !figure.isConnected) return;
        stage.classList.remove("is-loading");
        stage.removeAttribute("aria-busy");
        stage.innerHTML = svg;
        bindFunctions?.(stage);
        view.requestMeasure();
      })
      .catch((error) => {
        if (this.disposed.has(figure) || !figure.isConnected) return;
        const message = error instanceof Error ? error.message.split("\n")[0] : String(error);
        stage.className = "cm-live-mermaid-error";
        stage.removeAttribute("aria-busy");
        stage.replaceChildren();
        const title = document.createElement("strong");
        title.textContent = "Mermaid 图表渲染失败";
        const detail = document.createElement("span");
        detail.textContent = message;
        stage.append(title, detail);
        view.requestMeasure();
      });

    figure.addEventListener("mousedown", (event) => {
      event.preventDefault();
      view.dispatch({ selection: { anchor: this.block.from }, scrollIntoView: true });
      view.focus();
    });
    return figure;
  }

  destroy(dom: HTMLElement) {
    this.disposed.add(dom);
  }

  ignoreEvent() {
    return false;
  }
}

const calloutTitles: Readonly<Record<string, string>> = {
  abstract: "摘要",
  bug: "问题",
  danger: "危险",
  error: "错误",
  example: "示例",
  failure: "失败",
  info: "信息",
  note: "笔记",
  question: "问题",
  quote: "引用",
  success: "完成",
  tip: "提示",
  todo: "待办",
  warning: "警告"
};

function calloutTone(type: string) {
  if (["success", "check", "done"].includes(type)) return "success";
  if (["warning", "caution", "attention", "question", "help", "faq"].includes(type)) {
    return "warning";
  }
  if (["danger", "error", "failure", "fail", "missing", "bug"].includes(type)) {
    return "error";
  }
  if (["example", "quote", "cite"].includes(type)) return "neutral";
  return "info";
}

function createCalloutIcon(type: string) {
  const namespace = "http://www.w3.org/2000/svg";
  const svg = document.createElementNS(namespace, "svg");
  svg.setAttribute("viewBox", "0 0 24 24");
  svg.setAttribute("aria-hidden", "true");
  svg.classList.add("cm-live-callout-icon");
  const tone = calloutTone(type);
  if (tone === "warning" || tone === "error") {
    const outline = document.createElementNS(namespace, "path");
    outline.setAttribute("d", "M10.3 3.6 2.4 18a2 2 0 0 0 1.8 3h15.6a2 2 0 0 0 1.8-3L13.7 3.6a2 2 0 0 0-3.4 0Z");
    const mark = document.createElementNS(namespace, "path");
    mark.setAttribute("d", "M12 9v4m0 4h.01");
    svg.append(outline, mark);
  } else if (tone === "success") {
    const circle = document.createElementNS(namespace, "circle");
    circle.setAttribute("cx", "12");
    circle.setAttribute("cy", "12");
    circle.setAttribute("r", "9");
    const check = document.createElementNS(namespace, "path");
    check.setAttribute("d", "m8 12 2.6 2.6L16.5 9");
    svg.append(circle, check);
  } else {
    const circle = document.createElementNS(namespace, "circle");
    circle.setAttribute("cx", "12");
    circle.setAttribute("cy", "12");
    circle.setAttribute("r", "9");
    const info = document.createElementNS(namespace, "path");
    info.setAttribute("d", "M12 11v5m0-8h.01");
    svg.append(circle, info);
  }
  return svg;
}

class CalloutWidget extends WidgetType {
  constructor(private readonly block: CalloutBlock) {
    super();
  }

  eq(other: CalloutWidget) {
    return this.block.source === other.block.source && this.block.from === other.block.from;
  }

  toDOM(view: EditorView) {
    const callout = document.createElement("aside");
    callout.className = "cm-live-callout";
    callout.dataset.callout = this.block.type;
    callout.dataset.calloutTone = calloutTone(this.block.type);
    callout.setAttribute("aria-label", `${this.block.title || calloutTitles[this.block.type] || this.block.type} callout`);

    this.block.lines.forEach((line, index) => {
      const row = document.createElement(index === 0 ? "div" : "p");
      row.className = index === 0
        ? "cm-live-callout-title"
        : `cm-live-callout-line${line.text ? "" : " cm-live-callout-empty"}`;
      row.dataset.sourcePos = String(line.from);
      if (index === 0) {
        row.append(createCalloutIcon(this.block.type));
        const label = document.createElement("span");
        renderTableInlineMarkdown(
          label,
          this.block.title || calloutTitles[this.block.type] || this.block.type
        );
        row.append(label);
      } else {
        renderTableInlineMarkdown(row, line.text);
      }
      callout.append(row);
    });

    callout.addEventListener("mousedown", (event) => {
      const row = (event.target as HTMLElement).closest<HTMLElement>("[data-source-pos]");
      if (!row) return;
      const anchor = Number(row.dataset.sourcePos);
      if (!Number.isFinite(anchor)) return;
      event.preventDefault();
      view.dispatch({ selection: { anchor }, scrollIntoView: true });
      view.focus();
    });
    view.requestMeasure();
    return callout;
  }

  ignoreEvent() {
    return false;
  }
}

type TableInlineMatch = {
  content: string;
  index: number;
  length: number;
  tagName: "em" | "strong";
};

function nextTableInlineMatch(source: string): TableInlineMatch | null {
  const patterns: ReadonlyArray<{
    expression: RegExp;
    tagName: TableInlineMatch["tagName"];
  }> = [
    { expression: /\*\*([^\n]+?)\*\*/, tagName: "strong" },
    { expression: /(?<![A-Za-z0-9_])__([^_\n]+?)__(?![A-Za-z0-9_])/, tagName: "strong" },
    { expression: /(?<!\*)\*([^*\n]+?)\*(?!\*)/, tagName: "em" },
    { expression: /(?<![A-Za-z0-9_])_((?=\S)[^_\n]*?\S)_(?![A-Za-z0-9_])/, tagName: "em" }
  ];
  const matches = patterns
    .map(({ expression, tagName }) => {
      const match = expression.exec(source);
      return match
        ? { content: match[1], index: match.index, length: match[0].length, tagName }
        : null;
    })
    .filter((match): match is TableInlineMatch => match !== null)
    .sort((left, right) => left.index - right.index || right.length - left.length);
  return matches[0] ?? null;
}

function renderTableInlineMarkdown(target: HTMLElement, source: string) {
  target.replaceChildren();
  const append = (parent: HTMLElement, value: string) => {
    let remaining = value;
    while (remaining) {
      const match = nextTableInlineMatch(remaining);
      if (!match) {
        parent.append(document.createTextNode(remaining));
        break;
      }
      if (match.index > 0) {
        parent.append(document.createTextNode(remaining.slice(0, match.index)));
      }
      const formatted = document.createElement(match.tagName);
      append(formatted, match.content);
      parent.append(formatted);
      remaining = remaining.slice(match.index + match.length);
    }
  };
  append(target, source);
}

function serializeTableInlineEditor(editor: HTMLElement) {
  const serializeNode = (node: Node): string => {
    if (node.nodeType === Node.TEXT_NODE) return node.textContent ?? "";
    if (!(node instanceof HTMLElement)) return "";
    if (node.tagName === "BR") return " ";
    const content = Array.from(node.childNodes).map(serializeNode).join("");
    if (node.matches("strong, b")) return `**${content}**`;
    if (node.matches("em, i")) return `*${content}*`;
    return content;
  };
  return Array.from(editor.childNodes)
    .map(serializeNode)
    .join("")
    .replace(/\r?\n/g, " ")
    .trim();
}

function wrapTableInlineSelection(editor: HTMLElement, tagName: "em" | "strong") {
  const selection = window.getSelection();
  if (!selection?.rangeCount || selection.isCollapsed) return false;
  const range = selection.getRangeAt(0);
  const ancestor = range.commonAncestorContainer;
  if (!editor.contains(ancestor.nodeType === Node.ELEMENT_NODE ? ancestor : ancestor.parentNode)) {
    return false;
  }
  const wrapper = document.createElement(tagName);
  wrapper.append(range.extractContents());
  range.insertNode(wrapper);
  range.selectNodeContents(wrapper);
  selection.removeAllRanges();
  selection.addRange(range);
  return true;
}

class TableWidget extends WidgetType {
  private cleanup: (() => void) | null = null;

  constructor(private readonly block: TableBlock) {
    super();
  }

  eq(other: TableWidget) {
    return this.block.source === other.block.source && this.block.from === other.block.from;
  }

  toDOM(view: EditorView) {
    const frame = document.createElement("div");
    frame.className = "cm-live-table-widget";
    frame.dataset.tableFrom = String(this.block.from);
    frame.setAttribute("aria-label", "Markdown 表格编辑器");

    const scroll = document.createElement("div");
    scroll.className = "cm-live-table-scroll";
    const selectionOutline = document.createElement("div");
    selectionOutline.className = "cm-live-table-selection-outline";
    selectionOutline.hidden = true;
    selectionOutline.setAttribute("aria-hidden", "true");

    const table = document.createElement("table");
    const columnCount = Math.max(
      1,
      this.block.alignments.length,
      this.block.header.cells.length,
      ...this.block.rows.map((row) => row.cells.length)
    );
    table.style.setProperty("--table-column-count", String(columnCount));
    const head = document.createElement("thead");
    const headRow = document.createElement("tr");
    const body = document.createElement("tbody");
    const rows = [
      Array.from({ length: columnCount }, (_, index) => this.block.header.cells[index]?.text ?? ""),
      ...this.block.rows.map((row) =>
        Array.from({ length: columnCount }, (_, index) => row.cells[index]?.text ?? "")
      )
    ];
    let alignments = Array.from(
      { length: columnCount },
      (_, index) => this.block.alignments[index]
    );
    let selectionAnchor: { column: number; row: number } | null = null;
    let selectionFocus: { column: number; row: number } | null = null;
    let pointerSelecting = false;
    let pointerMovedAcrossCells = false;
    let dragState: { index: number; kind: "column" | "row" } | null = null;
    let dragTargetIndex: number | null = null;
    let tableResizeObserver: ResizeObserver | null = null;

    const serializeTable = (nextRows: readonly (readonly string[])[]) => {
      const escapeCell = (value: string) => value.replace(/\r?\n/g, " ").replace(/\|/g, "\\|").trim();
      const nextColumnCount = Math.max(
        1,
        alignments.length,
        ...nextRows.map((row) => row.length)
      );
      const serializeRow = (row: readonly string[]) =>
        `| ${Array.from({ length: nextColumnCount }, (_, index) => escapeCell(row[index] ?? "")).join(" | ")} |`;
      const delimiter = Array.from({ length: nextColumnCount }, (_, index) => alignments[index]).map((alignment) => {
        if (alignment === "left") return ":---";
        if (alignment === "center") return ":---:";
        if (alignment === "right") return "---:";
        return "---";
      });
      return [serializeRow(nextRows[0] ?? []), serializeRow(delimiter), ...nextRows.slice(1).map(serializeRow)].join("\n");
    };

    const focusCell = (focus: { column: number; row: number }) => {
      window.requestAnimationFrame(() => {
        const nextFrame = view.dom.querySelector<HTMLElement>(
          `.cm-live-table-widget[data-table-from="${this.block.from}"]`
        );
        nextFrame
          ?.querySelector<HTMLElement>(
            `[data-table-row="${focus.row}"][data-table-column="${focus.column}"] .cm-live-table-cell-editor`
          )
          ?.focus();
      });
    };

    const applyTable = (
      nextRows: readonly (readonly string[])[],
      focus?: { column: number; row: number }
    ) => {
      const source = serializeTable(nextRows);
      if (source === this.block.source) return;
      view.dispatch({
        changes: { from: this.block.from, to: this.block.to, insert: source }
      });
      if (focus) focusCell(focus);
    };

    const move = <Value,>(values: readonly Value[], from: number, to: number) => {
      const next = [...values];
      const [value] = next.splice(from, 1);
      if (value !== undefined) next.splice(to, 0, value);
      return next;
    };

    const setSelectedCells = () => {
      if (!selectionAnchor || !selectionFocus) return;
      const firstRow = Math.min(selectionAnchor.row, selectionFocus.row);
      const lastRow = Math.max(selectionAnchor.row, selectionFocus.row);
      const firstColumn = Math.min(selectionAnchor.column, selectionFocus.column);
      const lastColumn = Math.max(selectionAnchor.column, selectionFocus.column);
      let count = 0;
      frame.querySelectorAll<HTMLElement>(".cm-live-table-cell").forEach((cell) => {
        const row = Number(cell.dataset.tableRow);
        const column = Number(cell.dataset.tableColumn);
        const selected = row >= firstRow && row <= lastRow && column >= firstColumn && column <= lastColumn;
        cell.classList.toggle("is-selected", selected);
        cell.setAttribute("aria-selected", String(selected));
        if (selected) count += 1;
      });
      frame.dataset.selectedCells = String(count);
      const firstCell = frame.querySelector<HTMLElement>(
        `.cm-live-table-cell[data-table-row="${firstRow}"][data-table-column="${firstColumn}"]`
      );
      const lastCell = frame.querySelector<HTMLElement>(
        `.cm-live-table-cell[data-table-row="${lastRow}"][data-table-column="${lastColumn}"]`
      );
      if (count <= 1 || !firstCell || !lastCell) {
        selectionOutline.hidden = true;
        return;
      }
      const scrollRect = scroll.getBoundingClientRect();
      const firstRect = firstCell.getBoundingClientRect();
      const lastRect = lastCell.getBoundingClientRect();
      selectionOutline.hidden = false;
      selectionOutline.style.left = `${firstRect.left - scrollRect.left + scroll.scrollLeft}px`;
      selectionOutline.style.top = `${firstRect.top - scrollRect.top + scroll.scrollTop}px`;
      selectionOutline.style.width = `${lastRect.right - firstRect.left}px`;
      selectionOutline.style.height = `${lastRect.bottom - firstRect.top}px`;
    };

    const coordinateFrom = (target: EventTarget | null) => {
      const cell = (target as HTMLElement | null)?.closest<HTMLElement>(".cm-live-table-cell");
      if (!cell || !frame.contains(cell)) return null;
      return {
        row: Number(cell.dataset.tableRow),
        column: Number(cell.dataset.tableColumn)
      };
    };

    const clearDragState = () => {
      dragState = null;
      dragTargetIndex = null;
      frame.classList.remove("is-reordering-column", "is-reordering-row");
      frame.querySelectorAll(".is-dragging, .is-drop-target").forEach((element) => {
        element.classList.remove("is-dragging", "is-drop-target");
        element.removeAttribute("aria-grabbed");
      });
    };

    const startDrag = (event: MouseEvent, handle: HTMLButtonElement) => {
      if (event.button !== 0) return;
      const kind = handle.dataset.dragKind as "column" | "row";
      const index = Number(handle.dataset.dragIndex);
      if (!Number.isFinite(index)) return;
      event.preventDefault();
      event.stopPropagation();
      pointerSelecting = false;
      dragState = { kind, index };
      dragTargetIndex = index;
      handle.classList.add("is-dragging");
      handle.setAttribute("aria-grabbed", "true");
      frame.classList.add(kind === "column" ? "is-reordering-column" : "is-reordering-row");
    };

    const appendGripDots = (handle: HTMLButtonElement) => {
      const dots = document.createElement("span");
      dots.className = "cm-live-table-grip-dots";
      dots.setAttribute("aria-hidden", "true");
      for (let index = 0; index < 6; index += 1) {
        dots.append(document.createElement("span"));
      }
      handle.append(dots);
    };

    const addColumnHandle = (cell: HTMLTableCellElement, column: number) => {
      const handle = document.createElement("button");
      handle.className = "cm-live-table-drag-handle cm-live-table-column-handle";
      handle.type = "button";
      handle.dataset.dragKind = "column";
      handle.dataset.dragIndex = String(column);
      handle.setAttribute("aria-label", `拖动第 ${column + 1} 列`);
      handle.title = `拖动第 ${column + 1} 列`;
      appendGripDots(handle);
      handle.addEventListener("mousedown", (event) => startDrag(event, handle));
      frame.append(handle);
    };

    const addRowHandle = (cell: HTMLTableCellElement, row: number) => {
      const handle = document.createElement("button");
      handle.className = "cm-live-table-drag-handle cm-live-table-row-handle";
      handle.type = "button";
      handle.dataset.dragKind = "row";
      handle.dataset.dragIndex = String(row);
      handle.setAttribute("aria-label", `拖动第 ${row} 行`);
      handle.title = `拖动第 ${row} 行`;
      appendGripDots(handle);
      handle.addEventListener("mousedown", (event) => startDrag(event, handle));
      frame.append(handle);
    };

    const appendCells = (values: readonly string[], target: HTMLTableRowElement, row: number) => {
      target.dataset.tableRow = String(row);
      values.forEach((value, index) => {
        const header = row === 0;
        const element = document.createElement(header ? "th" : "td");
        element.className = "cm-live-table-cell";
        element.dataset.tableRow = String(row);
        element.dataset.tableColumn = String(index);
        element.setAttribute("aria-selected", "false");
        const alignment = this.block.alignments[index];
        if (alignment) element.style.textAlign = alignment;
        if (header) element.setAttribute("scope", "col");

        const editor = document.createElement("span");
        editor.className = "cm-live-table-cell-editor";
        editor.contentEditable = "plaintext-only";
        editor.spellcheck = true;
        editor.dataset.initialValue = value;
        editor.setAttribute("role", "textbox");
        editor.setAttribute("aria-label", `${header ? "表头" : `第 ${row} 行`}第 ${index + 1} 列`);
        renderTableInlineMarkdown(editor, value);
        editor.addEventListener("keydown", (event) => {
          if ((event.ctrlKey || event.metaKey) && !event.altKey) {
            const key = event.key.toLowerCase();
            if (key === "b" || key === "i") {
              event.preventDefault();
              wrapTableInlineSelection(editor, key === "b" ? "strong" : "em");
              return;
            }
          }
          if (event.key === "Enter") {
            event.preventDefault();
            editor.blur();
          }
          if (event.key === "Escape") {
            event.preventDefault();
            renderTableInlineMarkdown(editor, editor.dataset.initialValue ?? "");
            editor.blur();
          }
          if (event.key === "Tab") {
            event.preventDefault();
            const direction = event.shiftKey ? -1 : 1;
            const flatIndex = row * columnCount + index + direction;
            const nextRow = Math.max(0, Math.min(rows.length - 1, Math.floor(flatIndex / columnCount)));
            const nextColumn = Math.max(0, Math.min(columnCount - 1, flatIndex - nextRow * columnCount));
            editor.blur();
            focusCell({ row: nextRow, column: nextColumn });
          }
        });
        editor.addEventListener("paste", (event) => {
          const plainText = event.clipboardData?.getData("text/plain").replace(/\r?\n/g, " ");
          if (plainText === undefined) return;
          event.preventDefault();
          const selection = window.getSelection();
          if (!selection?.rangeCount) return;
          const range = selection.getRangeAt(0);
          range.deleteContents();
          const textNode = document.createTextNode(plainText);
          range.insertNode(textNode);
          range.setStartAfter(textNode);
          range.collapse(true);
          selection.removeAllRanges();
          selection.addRange(range);
        });
        editor.addEventListener("blur", () => {
          const valueAfterEdit = serializeTableInlineEditor(editor);
          if (valueAfterEdit === (editor.dataset.initialValue ?? "")) return;
          const nextRows = rows.map((current) => [...current]);
          nextRows[row][index] = valueAfterEdit;
          applyTable(nextRows);
        });
        element.append(editor);
        if (header) addColumnHandle(element, index);
        if (!header && index === 0) addRowHandle(element, row);
        target.append(element);
      });
    };

    appendCells(rows[0], headRow, 0);
    head.append(headRow);
    rows.slice(1).forEach((row, index) => {
      const bodyRow = document.createElement("tr");
      appendCells(row, bodyRow, index + 1);
      body.append(bodyRow);
    });
    table.append(head, body);
    scroll.append(table, selectionOutline);
    frame.append(scroll);

    const positionTableControls = () => {
      const frameRect = frame.getBoundingClientRect();
      const scrollRect = scroll.getBoundingClientRect();
      frame.querySelectorAll<HTMLElement>(".cm-live-table-column-handle").forEach((handle) => {
        const column = handle.dataset.dragIndex;
        const cell = table.querySelector<HTMLElement>(
          `.cm-live-table-cell[data-table-row="0"][data-table-column="${column}"]`
        );
        if (!cell) return;
        const cellRect = cell.getBoundingClientRect();
        handle.hidden = cellRect.right <= scrollRect.left || cellRect.left >= scrollRect.right;
        handle.style.left = `${cellRect.left - frameRect.left + cellRect.width / 2}px`;
        handle.style.top = `${cellRect.top - frameRect.top}px`;
      });
      frame.querySelectorAll<HTMLElement>(".cm-live-table-row-handle").forEach((handle) => {
        const row = handle.dataset.dragIndex;
        const cell = table.querySelector<HTMLElement>(
          `.cm-live-table-cell[data-table-row="${row}"][data-table-column="0"]`
        );
        if (!cell) return;
        const cellRect = cell.getBoundingClientRect();
        handle.style.left = `${cellRect.left - frameRect.left}px`;
        handle.style.top = `${cellRect.top - frameRect.top + cellRect.height / 2}px`;
      });
    };
    window.requestAnimationFrame(positionTableControls);
    window.addEventListener("resize", positionTableControls);
    if (typeof ResizeObserver !== "undefined") {
      tableResizeObserver = new ResizeObserver(positionTableControls);
      tableResizeObserver.observe(table);
      tableResizeObserver.observe(scroll);
    }

    const addColumn = document.createElement("button");
    addColumn.className = "cm-live-table-add cm-live-table-add-column";
    addColumn.type = "button";
    addColumn.setAttribute("aria-label", "在右侧新增列");
    addColumn.title = "在右侧新增列";
    addColumn.textContent = "+";
    addColumn.addEventListener("click", () => {
      const nextRows = rows.map((row) => [...row, ""]);
      alignments = [...alignments, undefined];
      applyTable(nextRows, { row: 0, column: columnCount });
    });

    const addRow = document.createElement("button");
    addRow.className = "cm-live-table-add cm-live-table-add-row";
    addRow.type = "button";
    addRow.setAttribute("aria-label", "在下方新增行");
    addRow.title = "在下方新增行";
    addRow.textContent = "+";
    addRow.addEventListener("click", () => {
      const nextRows = [...rows.map((row) => [...row]), Array.from({ length: columnCount }, () => "")];
      applyTable(nextRows, { row: rows.length, column: 0 });
    });
    frame.append(addColumn, addRow);

    frame.addEventListener("mousedown", (event) => {
      if (event.button !== 0 || (event.target as HTMLElement).closest("button")) return;
      const coordinate = coordinateFrom(event.target);
      if (!coordinate) return;
      if (event.shiftKey && selectionAnchor) {
        event.preventDefault();
        selectionFocus = coordinate;
        setSelectedCells();
        return;
      }
      selectionAnchor = coordinate;
      selectionFocus = coordinate;
      pointerSelecting = true;
      pointerMovedAcrossCells = false;
      setSelectedCells();
    });
    const updateDragTarget = (target: EventTarget | null) => {
      if (!dragState) return false;
      const targetElement = dragState.kind === "column"
        ? (target as HTMLElement | null)?.closest<HTMLElement>(".cm-live-table-cell[data-table-column]")
        : (target as HTMLElement | null)?.closest<HTMLElement>("tbody tr[data-table-row]");
      const targetIndex = Number(
        dragState.kind === "column"
          ? targetElement?.dataset.tableColumn
          : targetElement?.dataset.tableRow
      );
      if (!targetElement || !Number.isFinite(targetIndex)) return false;
      dragTargetIndex = targetIndex;
      frame.querySelectorAll(".is-drop-target").forEach((element) => {
        element.classList.remove("is-drop-target");
      });
      if (dragState.kind === "column") {
        frame
          .querySelectorAll<HTMLElement>(`[data-table-column="${targetIndex}"]`)
          .forEach((cell) => cell.classList.add("is-drop-target"));
      } else {
        targetElement.classList.add("is-drop-target");
      }
      return true;
    };
    frame.addEventListener("mouseover", (event) => {
      if (dragState) {
        event.preventDefault();
        updateDragTarget(event.target);
        return;
      }
      if (!pointerSelecting || !(event.buttons & 1)) return;
      const coordinate = coordinateFrom(event.target);
      if (!coordinate || !selectionAnchor) return;
      if (coordinate.row === selectionFocus?.row && coordinate.column === selectionFocus?.column) return;
      event.preventDefault();
      pointerMovedAcrossCells = true;
      selectionFocus = coordinate;
      window.getSelection()?.removeAllRanges();
      setSelectedCells();
    });
    frame.addEventListener("click", (event) => {
      if (!pointerMovedAcrossCells) return;
      event.preventDefault();
      pointerMovedAcrossCells = false;
    }, true);
    frame.addEventListener("copy", (event) => {
      if (!selectionAnchor || !selectionFocus) return;
      const firstRow = Math.min(selectionAnchor.row, selectionFocus.row);
      const lastRow = Math.max(selectionAnchor.row, selectionFocus.row);
      const firstColumn = Math.min(selectionAnchor.column, selectionFocus.column);
      const lastColumn = Math.max(selectionAnchor.column, selectionFocus.column);
      if (firstRow === lastRow && firstColumn === lastColumn) return;
      const value = Array.from({ length: lastRow - firstRow + 1 }, (_, rowOffset) =>
        Array.from({ length: lastColumn - firstColumn + 1 }, (_, columnOffset) =>
          frame.querySelector<HTMLElement>(
            `.cm-live-table-cell[data-table-row="${firstRow + rowOffset}"][data-table-column="${firstColumn + columnOffset}"] .cm-live-table-cell-editor`
          )?.textContent ?? ""
        ).join("\t")
      )
        .join("\n");
      event.preventDefault();
      event.clipboardData?.setData("text/plain", value);
    });

    const finishPointerInteraction = () => {
      pointerSelecting = false;
      if (!dragState) return;
      const { index, kind } = dragState;
      const targetIndex = dragTargetIndex;
      if (targetIndex !== null && targetIndex !== index) {
        if (kind === "column") {
          const nextRows = rows.map((row) => move(row, index, targetIndex));
          alignments = move(alignments, index, targetIndex);
          applyTable(nextRows);
        } else {
          applyTable(move(rows, index, targetIndex));
        }
      }
      clearDragState();
    };
    const trackPointerDrag = (event: MouseEvent) => {
      if (!dragState) return;
      updateDragTarget(document.elementFromPoint(event.clientX, event.clientY));
    };
    const refreshSelectionOutline = () => {
      if (!selectionOutline.hidden) setSelectedCells();
      positionTableControls();
    };
    document.addEventListener("mouseup", finishPointerInteraction);
    document.addEventListener("mousemove", trackPointerDrag);
    scroll.addEventListener("scroll", refreshSelectionOutline);
    this.cleanup = () => {
      document.removeEventListener("mouseup", finishPointerInteraction);
      document.removeEventListener("mousemove", trackPointerDrag);
      scroll.removeEventListener("scroll", refreshSelectionOutline);
      window.removeEventListener("resize", positionTableControls);
      tableResizeObserver?.disconnect();
    };
    view.requestMeasure();
    return frame;
  }

  ignoreEvent() {
    return true;
  }

  destroy() {
    this.cleanup?.();
    this.cleanup = null;
  }
}

class ListBulletWidget extends WidgetType {
  constructor(private readonly sourcePosition: number) {
    super();
  }

  eq(other: ListBulletWidget) {
    return this.sourcePosition === other.sourcePosition;
  }

  toDOM(view: EditorView) {
    const bullet = document.createElement("span");
    bullet.className = "cm-live-list-bullet";
    bullet.setAttribute("aria-hidden", "true");
    bullet.textContent = "•";
    bullet.addEventListener("mousedown", (event) => {
      event.preventDefault();
      view.dispatch({
        selection: { anchor: this.sourcePosition },
        scrollIntoView: true
      });
      view.focus();
    });
    return bullet;
  }

  ignoreEvent() {
    return false;
  }
}

class TaskCheckboxWidget extends WidgetType {
  constructor(
    private readonly markerFrom: number,
    private readonly checked: boolean
  ) {
    super();
  }

  eq(other: TaskCheckboxWidget) {
    return this.markerFrom === other.markerFrom && this.checked === other.checked;
  }

  toDOM(view: EditorView) {
    const checkbox = document.createElement("input");
    checkbox.className = `cm-live-task-checkbox${this.checked ? " cm-live-task-checked" : " cm-live-task-unchecked"}`;
    checkbox.type = "checkbox";
    checkbox.checked = this.checked;
    checkbox.setAttribute("aria-label", this.checked ? "标记任务为未完成" : "标记任务为已完成");
    checkbox.addEventListener("mousedown", (event) => {
      event.preventDefault();
      event.stopPropagation();
    });
    checkbox.addEventListener("click", (event) => {
      event.preventDefault();
      event.stopPropagation();
      view.dispatch({
        changes: {
          from: this.markerFrom + 1,
          to: this.markerFrom + 2,
          insert: this.checked ? " " : "x"
        }
      });
      view.focus();
    });
    return checkbox;
  }

  ignoreEvent() {
    return false;
  }
}

function collectBlockLines(state: EditorState): BlockLines {
  const callouts = new Map<number, CalloutBlock>();
  const code = new Set<number>();
  const codeBlocks = new Map<number, CodeBlock>();
  const fences = new Set<number>();
  const mathBlocks = new Map<number, MathBlock>();
  const tables = new Map<number, TableBlock>();
  let openFence: {
    language: string;
    length: number;
    marker: "`" | "~";
    startLine: number;
  } | null = null;

  const registerCodeBlock = (startLine: number, endLine: number, language: string) => {
    const firstLine = state.doc.line(startLine);
    const lastLine = state.doc.line(endLine);
    const lines = Array.from(
      { length: endLine - startLine + 1 },
      (_, index) => {
        const line = state.doc.line(startLine + index);
        const isFence = fences.has(line.number);
        return { from: line.from, isFence, text: isFence ? "" : line.text };
      }
    );
    const block: CodeBlock = {
      endLine,
      from: firstLine.from,
      language,
      lines,
      source: state.doc.sliceString(firstLine.from, lastLine.to),
      startLine,
      to: lastLine.to
    };
    for (let line = startLine; line <= endLine; line += 1) codeBlocks.set(line, block);
  };

  for (let lineNumber = 1; lineNumber <= state.doc.lines; lineNumber += 1) {
    const text = state.doc.line(lineNumber).text;
    const fence = /^ {0,3}(`{3,}|~{3,})(.*)$/.exec(text);
    if (!openFence && fence) {
      openFence = {
        language: fence[2].trim().split(/\s+/)[0] ?? "",
        marker: fence[1][0] as "`" | "~",
        length: fence[1].length,
        startLine: lineNumber
      };
      code.add(lineNumber);
      fences.add(lineNumber);
      continue;
    }
    if (!openFence) continue;
    code.add(lineNumber);
    if (
      fence &&
      fence[1][0] === openFence.marker &&
      fence[1].length >= openFence.length &&
      !fence[2].trim()
    ) {
      fences.add(lineNumber);
      registerCodeBlock(openFence.startLine, lineNumber, openFence.language);
      openFence = null;
    }
  }
  if (openFence) {
    registerCodeBlock(openFence.startLine, state.doc.lines, openFence.language);
  }

  const registerMathBlock = (startLine: number, endLine: number, expression: string) => {
    const firstLine = state.doc.line(startLine);
    const lastLine = state.doc.line(endLine);
    const block: MathBlock = {
      endLine,
      expression,
      from: firstLine.from,
      source: state.doc.sliceString(firstLine.from, lastLine.to),
      startLine,
      to: lastLine.to
    };
    for (let line = startLine; line <= endLine; line += 1) mathBlocks.set(line, block);
  };

  for (let lineNumber = 1; lineNumber <= state.doc.lines; lineNumber += 1) {
    if (code.has(lineNumber)) continue;
    const opening = mathOpening(state.doc.line(lineNumber).text);
    if (!opening) continue;

    const sameLineExpression = expressionBeforeMathClose(opening.remainder, opening.delimiter);
    if (sameLineExpression !== null) {
      if (sameLineExpression.trim()) {
        registerMathBlock(lineNumber, lineNumber, sameLineExpression.trim());
      }
      continue;
    }

    const expressionLines = opening.remainder ? [opening.remainder] : [];
    let endLine = lineNumber + 1;
    let expression: string | null = null;
    while (endLine <= state.doc.lines && !code.has(endLine)) {
      const closingLine = state.doc.line(endLine).text;
      const beforeClose = expressionBeforeMathClose(closingLine, opening.delimiter);
      if (beforeClose !== null) {
        if (beforeClose) expressionLines.push(beforeClose);
        expression = expressionLines.join("\n").trim();
        break;
      }
      expressionLines.push(closingLine);
      endLine += 1;
    }
    if (expression === null) continue;
    if (expression) registerMathBlock(lineNumber, endLine, expression);
    lineNumber = endLine;
  }

  for (let lineNumber = 1; lineNumber <= state.doc.lines; lineNumber += 1) {
    if (code.has(lineNumber) || mathBlocks.has(lineNumber)) continue;
    const first = state.doc.line(lineNumber);
    const marker = /^ {0,3}>\s*\[!([A-Za-z0-9_-]+)\](?:[+-])?(?:\s+(.*))?\s*$/.exec(first.text);
    if (!marker) continue;
    let endLine = lineNumber;
    const lines: CalloutLine[] = [{ from: first.from, text: "" }];
    for (let next = lineNumber + 1; next <= state.doc.lines; next += 1) {
      if (code.has(next) || mathBlocks.has(next)) break;
      const sourceLine = state.doc.line(next);
      const quote = /^ {0,3}>\s?(.*)$/.exec(sourceLine.text);
      if (!quote) break;
      lines.push({ from: sourceLine.from, text: quote[1] });
      endLine = next;
    }
    const last = state.doc.line(endLine);
    const block: CalloutBlock = {
      endLine,
      from: first.from,
      lines,
      source: state.doc.sliceString(first.from, last.to),
      startLine: lineNumber,
      title: marker[2]?.trim() ?? "",
      to: last.to,
      type: marker[1].toLowerCase()
    };
    for (let line = lineNumber; line <= endLine; line += 1) callouts.set(line, block);
    lineNumber = endLine;
  }

  for (let lineNumber = 1; lineNumber < state.doc.lines; lineNumber += 1) {
    if (
      code.has(lineNumber) ||
      code.has(lineNumber + 1) ||
      mathBlocks.has(lineNumber) ||
      mathBlocks.has(lineNumber + 1) ||
      callouts.has(lineNumber) ||
      callouts.has(lineNumber + 1)
    ) continue;
    const header = state.doc.line(lineNumber).text;
    const delimiter = state.doc.line(lineNumber + 1).text;
    if (!isTableRow(header) || !isTableDelimiter(delimiter)) continue;
    const startLine = lineNumber;
    let endLine = lineNumber + 1;
    for (let row = lineNumber + 2; row <= state.doc.lines; row += 1) {
      if (code.has(row) || mathBlocks.has(row) || !isTableRow(state.doc.line(row).text)) break;
      endLine = row;
    }
    const headerLine = state.doc.line(startLine);
    const delimiterLine = state.doc.line(startLine + 1);
    const lastLine = state.doc.line(endLine);
    const block: TableBlock = {
      alignments: tableCells(delimiterLine.text).map(tableAlignment),
      from: headerLine.from,
      header: {
        cells: tableCells(headerLine.text)
      },
      rows: Array.from({ length: Math.max(0, endLine - startLine - 1) }, (_, index) => {
        const rowLine = state.doc.line(startLine + index + 2);
        return {
          cells: tableCells(rowLine.text)
        };
      }),
      source: state.doc.sliceString(headerLine.from, lastLine.to),
      startLine,
      to: lastLine.to
    };
    for (let row = startLine; row <= endLine; row += 1) tables.set(row, block);
    lineNumber = endLine;
  }

  return { callouts, code, codeBlocks, fences, mathBlocks, tables };
}

function livePreviewDecorations(
  state: EditorState,
  enabledSyntax: ReadonlySet<MarkdownSyntaxId>
) {
  const decorations: DecorationRange[] = [];
  const blockLines = collectBlockLines(state);
  const activeLines = new Set<number>();
  state.selection.ranges.forEach((range) => {
    if (range.empty) activeLines.add(state.doc.lineAt(range.head).number);
  });

  const replaceRanges: Array<[number, number]> = [];
  const overlapsReplacement = (from: number, to: number) =>
    replaceRanges.some(([left, right]) => from < right && to > left);
  const canReplace = (from: number, to: number) =>
    from < to && !overlapsReplacement(from, to);
  const replace = (from: number, to: number) => {
    if (!canReplace(from, to)) return;
    replaceRanges.push([from, to]);
    decorations.push(Decoration.replace({}).range(from, to));
  };
  const mark = (from: number, to: number, className: string) => {
    if (from < to) decorations.push(Decoration.mark({ class: className }).range(from, to));
  };

  for (let lineNumber = 1; lineNumber <= state.doc.lines; lineNumber += 1) {
    const line = state.doc.line(lineNumber);
    const text = line.text;
    const isActive = activeLines.has(lineNumber);

    if (/^\^[A-Za-z0-9_-]+\s*$/.test(text)) {
      replace(line.from, line.to);
      decorations.push(
        Decoration.line({ class: "cm-live-block-id-line" }).range(line.from)
      );
      continue;
    }
    if (isActive) {
      decorations.push(
        Decoration.line({ class: "cm-live-source-line" }).range(line.from)
      );
    }

    const candidateCodeBlock = blockLines.codeBlocks.get(lineNumber);
    const candidateIsMermaid = candidateCodeBlock?.language.toLowerCase() === "mermaid";
    const codeBlock = candidateCodeBlock && (
      enabledSyntax.has("block-structures") ||
      (candidateIsMermaid && enabledSyntax.has("math-and-diagrams"))
    ) ? candidateCodeBlock : undefined;
    if (codeBlock) {
      const codeBlockIsActive = Array.from(activeLines).some(
        (activeLine) => activeLine >= codeBlock.startLine && activeLine <= codeBlock.endLine
      );
      if (!codeBlockIsActive) {
        if (lineNumber === codeBlock.startLine && canReplace(codeBlock.from, codeBlock.to)) {
          replaceRanges.push([codeBlock.from, codeBlock.to]);
          decorations.push(
            Decoration.replace({
              block: true,
              widget: candidateIsMermaid && enabledSyntax.has("math-and-diagrams")
                ? new MermaidWidget(codeBlock)
                : new CodeBlockWidget(codeBlock)
            }).range(
              codeBlock.from,
              codeBlock.to
            )
          );
        }
        continue;
      }
      decorations.push(
        Decoration.line({
          class: `${blockLines.fences.has(lineNumber)
            ? "cm-live-code-block cm-live-code-editing cm-live-code-fence"
            : `cm-live-code-block cm-live-code-editing cm-live-code-line${text.trim() ? "" : " cm-live-code-empty-line"}`}${lineNumber === codeBlock.startLine ? " cm-live-code-block-first" : ""}${lineNumber === codeBlock.endLine ? " cm-live-code-block-last" : ""}`
        }).range(line.from)
      );
      continue;
    }

    const mathBlock = enabledSyntax.has("math-and-diagrams")
      ? blockLines.mathBlocks.get(lineNumber)
      : undefined;
    if (mathBlock) {
      const mathBlockIsActive = Array.from(activeLines).some(
        (activeLine) => activeLine >= mathBlock.startLine && activeLine <= mathBlock.endLine
      );
      if (!mathBlockIsActive) {
        if (lineNumber === mathBlock.startLine && canReplace(mathBlock.from, mathBlock.to)) {
          replaceRanges.push([mathBlock.from, mathBlock.to]);
          decorations.push(
            Decoration.replace({
              block: true,
              widget: new MathWidget(mathBlock.expression, mathBlock.from, true)
            }).range(mathBlock.from, mathBlock.to)
          );
        }
        continue;
      }
      decorations.push(
        Decoration.line({
          class: `cm-live-math-editing${lineNumber === mathBlock.startLine ? " cm-live-math-editing-first" : ""}${lineNumber === mathBlock.endLine ? " cm-live-math-editing-last" : ""}`
        }).range(line.from)
      );
      continue;
    }

    const callout = enabledSyntax.has("block-structures")
      ? blockLines.callouts.get(lineNumber)
      : undefined;
    if (callout) {
      const calloutIsActive = Array.from(activeLines).some(
        (activeLine) => activeLine >= callout.startLine && activeLine <= callout.endLine
      );
      if (!calloutIsActive) {
        if (lineNumber === callout.startLine && canReplace(callout.from, callout.to)) {
          replaceRanges.push([callout.from, callout.to]);
          decorations.push(
            Decoration.replace({ block: true, widget: new CalloutWidget(callout) }).range(
              callout.from,
              callout.to
            )
          );
        }
        continue;
      }
      decorations.push(
        Decoration.line({
          class: `cm-live-callout-editing${lineNumber === callout.startLine ? " cm-live-callout-editing-first" : ""}${lineNumber === callout.endLine ? " cm-live-callout-editing-last" : ""}`
        }).range(line.from)
      );
      continue;
    }

    if (!text.trim()) {
      decorations.push(
        Decoration.line({ class: "cm-live-blank-line" }).range(line.from)
      );
      continue;
    }

    const table = enabledSyntax.has("block-structures")
      ? blockLines.tables.get(lineNumber)
      : undefined;
    if (table) {
      if (lineNumber === table.startLine && canReplace(table.from, table.to)) {
        replaceRanges.push([table.from, table.to]);
        decorations.push(
          Decoration.replace({ block: true, widget: new TableWidget(table) }).range(
            table.from,
            table.to
          )
        );
      }
      continue;
    }

    if (enabledSyntax.has("block-structures")) {
      const list = /^(\s*)([-+*]|\d+[.)])(\s+)(\[[ xX]\]\s+)?/.exec(text);
      if (list) {
        const markerFrom = line.from + list[1].length;
        const markerTo = markerFrom + list[2].length;
        const isOrdered = /^\d/.test(list[2]);
        const isTask = Boolean(list[4]);
        const isChecked = isTask && /[xX]/.test(list[4]);
        decorations.push(
          Decoration.line({
            class: `cm-live-list-item ${isOrdered ? "cm-live-ordered-item" : "cm-live-bullet-item"}${isTask ? " cm-live-task-item" : ""}${isChecked ? " cm-live-task-complete" : ""}`
          }).range(line.from)
        );
        if (isTask) {
          const taskFrom = markerTo + list[3].length;
          const taskTo = taskFrom + list[4].trimEnd().length;
          if (canReplace(markerFrom, taskTo)) {
            replaceRanges.push([markerFrom, taskTo]);
            decorations.push(
              Decoration.replace({
                widget: new TaskCheckboxWidget(taskFrom, isChecked)
              }).range(markerFrom, taskTo)
            );
          }
        } else if (!isActive && !isOrdered && canReplace(markerFrom, markerTo)) {
          replaceRanges.push([markerFrom, markerTo]);
          decorations.push(
            Decoration.replace({ widget: new ListBulletWidget(markerFrom) }).range(
              markerFrom,
              markerTo
            )
          );
        } else {
          mark(markerFrom, markerTo, "cm-live-list-marker");
        }
      }
    }

    if (enabledSyntax.has("math-and-diagrams") && !isActive) {
      for (const match of findInlineMath(text)) {
        const from = line.from + match.from;
        const to = line.from + match.to;
        if (!canReplace(from, to)) continue;
        replaceRanges.push([from, to]);
        decorations.push(
          Decoration.replace({
            widget: new MathWidget(match.expression, from, false)
          }).range(from, to)
        );
      }
    }

    if (enabledSyntax.has("commonmark-structure")) {
      if (/^\s*(?:-{3,}|\*{3,}|_{3,})\s*$/.test(text)) {
        if (!isActive) replace(line.from, line.to);
        decorations.push(
          Decoration.line({ class: "cm-live-horizontal-rule" }).range(line.from)
        );
        continue;
      }
      const heading = /^(#{1,6})\s+/.exec(text);
      if (heading) {
        if (!isActive) replace(line.from, line.from + heading[0].length);
        decorations.push(
          Decoration.line({ class: `cm-live-heading cm-live-heading-${heading[1].length}` }).range(
            line.from
          )
        );
      }
      const quote = /^(?: {0,3}>[\t ]?)+/.exec(text);
      if (quote) {
        const quoteDepth = Math.max(1, quote[0].split(">").length - 1);
        if (!isActive) replace(line.from, line.from + quote[0].length);
        decorations.push(
          Decoration.line({
            class: `cm-live-quote cm-live-quote-${Math.min(quoteDepth, 6)}`,
            attributes: { "data-quote-depth": String(quoteDepth) }
          }).range(line.from)
        );
      }

      for (const match of text.matchAll(/\[([^\]\n]+)\]\(([^)\n]+)\)/g)) {
        const from = line.from + (match.index ?? 0);
        if (overlapsReplacement(from, from + match[0].length)) continue;
        const labelFrom = from + 1;
        const labelTo = labelFrom + match[1].length;
        if (!isActive) {
          replace(from, labelFrom);
          replace(labelTo, from + match[0].length);
        }
        mark(labelFrom, labelTo, "cm-live-link");
      }
    }

    const applyInline = (
      expression: RegExp,
      className: string,
      openingLength: number,
      closingLength = openingLength
    ) => {
      for (const match of text.matchAll(expression)) {
        const matchIndex = match.index ?? 0;
        const full = match[0];
        const from = line.from + matchIndex;
        const to = from + full.length;
        if (overlapsReplacement(from, to)) continue;
        const contentFrom = from + openingLength;
        const contentTo = to - closingLength;
        if (!isActive) {
          replace(from, contentFrom);
          replace(contentTo, to);
        }
        mark(contentFrom, contentTo, className);
      }
    };

    if (enabledSyntax.has("obsidian-comments")) {
      for (const match of text.matchAll(/%%[^%]*%%/g)) {
        const from = line.from + (match.index ?? 0);
        if (overlapsReplacement(from, from + match[0].length)) continue;
        if (!isActive) replace(from, from + match[0].length);
      }
    }
    if (enabledSyntax.has("obsidian-wiki-links")) {
      for (const match of text.matchAll(/(!?)\[\[([^\]]+)\]\]/g)) {
        const from = line.from + (match.index ?? 0);
        if (overlapsReplacement(from, from + match[0].length)) continue;
        const openingLength = match[1] ? 3 : 2;
        const contentFrom = from + openingLength;
        const contentTo = from + match[0].length - 2;
        if (!isActive) {
          replace(from, contentFrom);
          replace(contentTo, from + match[0].length);
        }
        mark(
          contentFrom,
          contentTo,
          match[1] ? "cm-live-embed" : "cm-live-wiki-link"
        );
      }
    }
    if (enabledSyntax.has("obsidian-highlight")) {
      applyInline(/==[^=\n]+==/g, "cm-live-highlight", 2);
    }
    if (enabledSyntax.has("inline-formatting")) {
      applyInline(/\*\*[^*\n]+\*\*/g, "cm-live-strong", 2);
      applyInline(/(?<![A-Za-z0-9_])__(?!_)[^_\n]+__(?![A-Za-z0-9_])/g, "cm-live-strong", 2);
      applyInline(/~~[^~\n]+~~/g, "cm-live-strike", 2);
      applyInline(/`[^`\n]+`/g, "cm-live-code", 1);
      applyInline(/(?<!\*)\*(?!\*)[^*\n]+\*(?!\*)/g, "cm-live-emphasis", 1);
      applyInline(/(?<![A-Za-z0-9_])_(?!_)(?=\S)[^_\n]*?\S_(?![A-Za-z0-9_])/g, "cm-live-emphasis", 1);
    }
  }
  return Decoration.set(decorations, true);
}

export function livePreviewExtension(
  enabledSyntaxIds: readonly MarkdownSyntaxId[]
): Extension {
  const enabledSyntax = new Set(enabledSyntaxIds);
  return EditorView.decorations.compute(
    ["doc", "selection"],
    (state) => livePreviewDecorations(state, enabledSyntax)
  );
}

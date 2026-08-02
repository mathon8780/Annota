import { EditorState } from "@codemirror/state";
import { EditorView } from "@codemirror/view";
import { afterEach, describe, expect, it, vi } from "vitest";
import { fencedCodeHighlightExtension } from "./codeHighlight";
import { livePreviewExtension } from "./livePreview";

vi.mock("./richPreview", async (importOriginal) => {
  const actual = await importOriginal<typeof import("./richPreview")>();
  return {
    ...actual,
    renderMermaidDiagram: vi.fn(async () => ({
      svg: '<svg data-testid="rendered-mermaid" viewBox="0 0 120 60"><text>流程图</text></svg>'
    }))
  };
});

const syntaxIds = [
  "commonmark-structure",
  "block-structures",
  "inline-formatting",
  "obsidian-highlight",
  "obsidian-wiki-links",
  "obsidian-comments",
  "math-and-diagrams"
] as const;

function createView(
  doc: string,
  selection: number | { anchor: number; head: number } = 0
) {
  const parent = document.createElement("div");
  document.body.append(parent);
  return new EditorView({
    parent,
    state: EditorState.create({
      doc,
      selection: typeof selection === "number" ? { anchor: selection } : selection,
      extensions: [fencedCodeHighlightExtension, livePreviewExtension(syntaxIds)]
    })
  });
}

afterEach(() => {
  document.body.replaceChildren();
});

describe("livePreviewExtension", () => {
  it("collapses internal block anchors and inactive blank lines", () => {
    const doc = "正文\n^root-article-block-1\n\n下一段";
    const anchor = doc.indexOf("^root");
    const view = createView(doc, anchor);

    expect(view.dom.querySelector(".cm-live-block-id-line")).not.toBeNull();
    expect(view.dom.querySelector(".cm-live-block-id-line")?.textContent).toBe("");
    expect(view.dom.querySelector(".cm-live-blank-line")).not.toBeNull();
    view.destroy();
  });

  it("renders links and horizontal rules without their source markers", () => {
    const view = createView("编辑行\n[缺点](#缺点)\n---");

    expect(view.dom.querySelector(".cm-live-link")?.textContent).toBe("缺点");
    expect(view.dom.querySelector(".cm-live-horizontal-rule")?.textContent).toBe("");
    view.destroy();
  });

  it("keeps heading typography attached while revealing the active source", () => {
    const doc = "# 一级标题\n普通正文";
    const inactiveView = createView(doc, doc.indexOf("普通"));
    const inactiveHeading = inactiveView.dom.querySelector(".cm-live-heading-1");
    expect(inactiveHeading).not.toBeNull();
    expect(inactiveHeading?.textContent).toBe("一级标题");
    inactiveView.destroy();

    const activeView = createView(doc, doc.indexOf("标题"));
    const activeHeading = activeView.dom.querySelector(".cm-live-heading-1");
    expect(activeHeading).not.toBeNull();
    expect(activeHeading).toHaveClass("cm-live-source-line");
    expect(activeHeading?.textContent).toBe("# 一级标题");
    activeView.destroy();
  });

  it("renders one guide for each nested blockquote level", () => {
    const doc = [
      "> first level",
      "> > second level",
      "> > > third level",
      "",
      "after"
    ].join("\n");
    const view = createView(doc, doc.indexOf("after"));
    const quotes = Array.from(
      view.dom.querySelectorAll<HTMLElement>(".cm-live-quote")
    );

    expect(quotes).toHaveLength(3);
    expect(quotes.map((quote) => quote.dataset.quoteDepth)).toEqual(["1", "2", "3"]);
    expect(quotes[0]).toHaveClass("cm-live-quote-1");
    expect(quotes[1]).toHaveClass("cm-live-quote-2");
    expect(quotes[2]).toHaveClass("cm-live-quote-3");
    expect(quotes.map((quote) => quote.textContent)).toEqual([
      "first level",
      "second level",
      "third level"
    ]);
    view.destroy();
  });

  it("keeps rendered Markdown stable during a multiline selection", () => {
    const doc = ["# Heading", "Paragraph with **bold** text", "> Quote"].join("\n");
    const view = createView(doc, {
      anchor: doc.indexOf("Heading"),
      head: doc.length
    });

    expect(view.dom.querySelector(".cm-live-source-line")).toBeNull();
    expect(view.dom.querySelector(".cm-live-heading")?.textContent).toBe("Heading");
    expect(view.dom.querySelector(".cm-live-strong")?.textContent).toBe("bold");
    expect(view.dom.querySelector(".cm-live-quote")?.textContent).toBe("Quote");
    expect(view.dom.textContent).not.toContain("**");
    expect(view.dom.textContent).not.toContain("> Quote");
    view.destroy();
  });

  it("decorates fenced code, GFM tables, and list variants", () => {
    const doc = [
      "```ts",
      "const answer = 42;",
      "```",
      "",
      "| 名称 | 状态 |",
      "| --- | ---: |",
      "| 编辑器 | 完成 |",
      "",
      "- 普通列表",
      "1. 有序列表",
      "- [x] 已完成"
    ].join("\n");
    const view = createView(doc, doc.length);

    const codeBlock = view.dom.querySelector(".cm-live-code-widget");
    expect(codeBlock).not.toBeNull();
    expect(codeBlock?.textContent).toBe("const answer = 42;");
    expect(codeBlock?.textContent).not.toContain("```");
    expect(codeBlock?.querySelectorAll(".cm-live-code-widget-line")).toHaveLength(3);
    expect(codeBlock?.querySelectorAll(".cm-live-code-widget-fence")).toHaveLength(2);
    expect(codeBlock).toHaveAttribute("data-language", "ts");
    expect(codeBlock?.querySelector(".hljs-keyword")?.textContent).toBe("const");
    const table = view.dom.querySelector(".cm-live-table-widget table");
    expect(table).not.toBeNull();
    expect(table?.querySelectorAll("th")).toHaveLength(2);
    expect(table?.querySelectorAll("tbody td")).toHaveLength(2);
    expect(table?.querySelectorAll("tr")).toHaveLength(2);
    expect(
      Array.from(table?.querySelectorAll(".cm-live-table-cell-editor") ?? []).map(
        (element) => element.textContent
      )
    ).toEqual(["名称", "状态", "编辑器", "完成"]);
    expect(table?.querySelector(".cm-live-table-delimiter-row")).toBeNull();
    expect(view.dom.querySelectorAll(".cm-live-list-item")).toHaveLength(3);
    expect(view.dom.querySelectorAll(".cm-live-list-bullet")).toHaveLength(1);
    expect(view.dom.querySelector(".cm-live-bullet-item")?.textContent).toBe("• 普通列表");
    expect(view.dom.querySelector<HTMLInputElement>(".cm-live-task-checked")?.checked).toBe(true);
    view.destroy();
  });

  it("renders a table when a delimiter cell contains only two hyphens", () => {
    const doc = [
      "| 姓名    | 类型       | 状态 |",
      "| ----- | -------- | -- |",
      "| Alpha | 文本       | 正常 |",
      "| Beta  | 数字 123   | 正常 |",
      "| Gamma | Emoji 🧪 | 正常 |",
      "",
      "正文"
    ].join("\n");
    const view = createView(doc, doc.indexOf("正文"));
    const table = view.dom.querySelector(".cm-live-table-widget table");

    expect(table).not.toBeNull();
    expect(table?.querySelectorAll("th")).toHaveLength(3);
    expect(table?.querySelectorAll("tbody tr")).toHaveLength(3);
    expect(table?.textContent).toContain("Emoji 🧪");
    expect(view.dom.textContent).not.toContain("| ----- | -------- | -- |");
    view.destroy();
  });

  it("renders inline and block KaTeX while keeping formulas editable on click", () => {
    const doc = [
      "正文包含 $E = mc^2$ 公式。",
      "",
      "$$",
      "\\sum_{i=1}^{n} i = \\frac{n(n+1)}{2}",
      "$$",
      "",
      "正文结束"
    ].join("\n");
    const view = createView(doc, doc.indexOf("正文结束"));

    const inline = view.dom.querySelector<HTMLElement>(".cm-live-math-inline");
    const block = view.dom.querySelector<HTMLElement>(".cm-live-math-block");
    expect(inline?.querySelector(".katex")).not.toBeNull();
    expect(block?.querySelector(".katex-display")).not.toBeNull();
    expect(view.dom.textContent).not.toContain("$E = mc^2$");

    inline?.dispatchEvent(new MouseEvent("mousedown", { bubbles: true, cancelable: true }));
    expect(view.state.selection.main.anchor).toBe(doc.indexOf("$E = mc^2$"));
    expect(view.dom.querySelector(".cm-live-math-inline")).toBeNull();
    expect(view.dom.textContent).toContain("$E = mc^2$");
    view.destroy();
  });

  it.each([
    [
      "matrix with attached dollar delimiters",
      ["$$\\begin{bmatrix}", "a & b \\\\", "c & d", "\\end{bmatrix}$$"]
    ],
    [
      "determinant with LaTeX display delimiters",
      ["\\[", "\\begin{vmatrix}", "a & b \\\\", "c & d", "\\end{vmatrix}", "\\]"]
    ],
    [
      "piecewise function with attached dollar delimiters",
      ["$$f(x)=\\begin{cases}", "x^2, & x \\ge 0 \\\\", "-x, & x < 0", "\\end{cases}$$"]
    ]
  ])("renders a complex %s block through KaTeX", (_, formulaLines) => {
    const doc = [...formulaLines, "", "after"].join("\n");
    const view = createView(doc, doc.indexOf("after"));
    const block = view.dom.querySelector<HTMLElement>(".cm-live-math-block");

    expect(block).not.toBeNull();
    expect(block!.querySelector(".katex-display")).not.toBeNull();
    expect(block!.querySelector(".katex-error")).toBeNull();
    expect(block!.querySelector(".vlist-t")).not.toBeNull();
    expect(view.dom.querySelectorAll(".cm-live-math-block")).toHaveLength(1);
    view.destroy();
  });

  it("renders newline-only matrix, determinant, aligned, and cases environments as rows", () => {
    const doc = [
      "matrix:",
      "$$",
      "A=\\begin{bmatrix}",
      "1 & 2 & 3",
      "4 & 5 & 6",
      "7 & 8 & 9",
      "\\end{bmatrix}",
      "$$",
      "",
      "determinant:",
      "$$",
      "\\begin{vmatrix}",
      "a & b",
      "c & d",
      "\\end{vmatrix}=ad-bc",
      "$$",
      "",
      "aligned:",
      "$$",
      "\\begin{aligned}",
      "(a+b)^2 &= a^2+2ab+b^2",
      "(a-b)^2 &= a^2-2ab+b^2",
      "\\end{aligned}",
      "$$",
      "",
      "piecewise:",
      "$$",
      "f(x)=\\begin{cases}",
      "x^2, & x \\ge 0",
      "-x, & x < 0",
      "\\end{cases}",
      "$$",
      "",
      "after"
    ].join("\n");
    const view = createView(doc, doc.indexOf("after"));
    const blocks = Array.from(view.dom.querySelectorAll<HTMLElement>(".cm-live-math-block"));

    expect(blocks).toHaveLength(4);
    expect(blocks.map((block) => block.querySelectorAll("mtr").length)).toEqual([3, 2, 2, 2]);
    expect(blocks.every((block) => block.querySelector(".katex-error") === null)).toBe(true);
    view.destroy();
  });

  it("renders Mermaid fences as a diagram and reveals their source on click", async () => {
    const doc = [
      "```mermaid",
      "flowchart LR",
      "  A[开始] --> B[完成]",
      "```",
      "",
      "正文"
    ].join("\n");
    const view = createView(doc, doc.indexOf("正文"));

    await vi.waitFor(() => {
      expect(view.dom.querySelector('[data-testid="rendered-mermaid"]')).not.toBeNull();
    });
    const diagram = view.dom.querySelector<HTMLElement>(".cm-live-mermaid");
    expect(diagram).not.toBeNull();
    expect(view.dom.querySelector(".cm-live-code-widget")).toBeNull();
    expect(diagram?.textContent).toContain("流程图");

    diagram?.dispatchEvent(new MouseEvent("mousedown", { bubbles: true, cancelable: true }));
    expect(view.state.selection.main.anchor).toBe(0);
    expect(view.dom.querySelector(".cm-live-mermaid")).toBeNull();
    expect(view.dom.querySelectorAll(".cm-live-code-editing")).toHaveLength(4);
    expect(view.dom.textContent).toContain("flowchart LR");
    view.destroy();
  });

  it("does not render math inside inline code or an active formula line", () => {
    const doc = "`$not_math$` and $x^2$";
    const view = createView(doc, doc.indexOf("x^2"));

    expect(view.dom.querySelector(".cm-live-math-inline")).toBeNull();
    expect(view.dom.textContent).toContain("$x^2$");
    view.destroy();
  });

  it("does not treat underscores inside English words as emphasis", () => {
    const doc = "snake_case_value and _real emphasis_ plus normal_word";
    const view = createView(doc, doc.length);

    const emphasis = view.dom.querySelectorAll(".cm-live-emphasis");
    expect(emphasis).toHaveLength(1);
    expect(emphasis[0]?.textContent).toBe("real emphasis");
    expect(view.dom.textContent).toContain("snake_case_value");
    expect(view.dom.textContent).toContain("normal_word");
    view.destroy();
  });

  it("renders Obsidian info callouts as an icon bubble and returns to source on click", () => {
    const doc = [
      "> [!info] 架构说明",
      "> 这里是 **重要信息**。",
      ">",
      "> 最后一行",
      "",
      "正文"
    ].join("\n");
    const view = createView(doc, doc.indexOf("正文"));
    const callout = view.dom.querySelector<HTMLElement>(".cm-live-callout");

    expect(callout).not.toBeNull();
    expect(callout).toHaveAttribute("data-callout", "info");
    expect(callout).toHaveAttribute("data-callout-tone", "info");
    expect(callout?.querySelector(".cm-live-callout-icon")).not.toBeNull();
    expect(callout?.querySelector(".cm-live-callout-title")?.textContent).toBe("架构说明");
    expect(callout?.querySelector("strong")?.textContent).toBe("重要信息");
    expect(callout?.querySelectorAll(".cm-live-callout-line")).toHaveLength(3);
    expect(callout?.querySelector(".cm-live-callout-empty")).not.toBeNull();
    expect(callout?.textContent).not.toContain("[!info]");

    callout?.querySelector<HTMLElement>(".cm-live-callout-title")?.dispatchEvent(
      new MouseEvent("mousedown", { bubbles: true, cancelable: true })
    );
    expect(view.dom.querySelector(".cm-live-callout")).toBeNull();
    expect(view.dom.querySelectorAll(".cm-live-callout-editing")).toHaveLength(4);
    expect(view.state.selection.main.anchor).toBe(0);
    view.destroy();
  });

  it("toggles task checkboxes and writes the new state back to Markdown", () => {
    const doc = "- [ ] 待完成\n- [x] 已完成\n\n正文";
    const view = createView(doc, doc.indexOf("正文"));
    const checkboxes = view.dom.querySelectorAll<HTMLInputElement>(".cm-live-task-checkbox");

    expect(checkboxes).toHaveLength(2);
    expect(checkboxes[0]?.checked).toBe(false);
    expect(checkboxes[1]?.checked).toBe(true);
    checkboxes[0]?.click();

    expect(view.state.doc.line(1).text).toBe("- [x] 待完成");
    expect(view.dom.querySelector<HTMLInputElement>(".cm-live-task-checkbox")?.checked).toBe(true);
    view.destroy();
  });

  it("falls back to plain code for unknown fence languages", () => {
    const doc = ["```customlang", "<unsafe> raw", "```", "", "正文"].join("\n");
    const view = createView(doc, doc.indexOf("正文"));
    const code = view.dom.querySelector(".cm-live-code-widget code");

    expect(code?.textContent).toBe("<unsafe> raw");
    expect(code?.querySelector("[class^='hljs-']")).toBeNull();
    expect(code?.innerHTML).toContain("&lt;unsafe&gt;");
    view.destroy();
  });

  it("renders an inactive unordered marker as a bullet and restores source on click", () => {
    const doc = "- 普通列表\n正文";
    const view = createView(doc, doc.indexOf("正文"));
    const bullet = view.dom.querySelector<HTMLElement>(".cm-live-list-bullet");

    expect(bullet).not.toBeNull();
    expect(view.dom.querySelector(".cm-live-bullet-item")?.textContent).toBe("• 普通列表");

    bullet?.dispatchEvent(new MouseEvent("mousedown", { bubbles: true }));

    expect(view.state.selection.main.anchor).toBe(0);
    expect(view.dom.querySelector(".cm-live-list-bullet")).toBeNull();
    expect(view.dom.querySelector(".cm-live-bullet-item")?.textContent).toBe("- 普通列表");
    view.destroy();
  });

  it("keeps blank code lines inside one continuous widget and reveals source on click", () => {
    const doc = ["```csharp", "// 修改前", "", "private void Update()", "```", "", "正文"].join("\n");
    const view = createView(doc, doc.indexOf("正文"));
    const widget = view.dom.querySelector(".cm-live-code-widget");
    const codeLines = widget?.querySelectorAll(".cm-live-code-widget-line");

    expect(widget).not.toBeNull();
    expect(codeLines).toHaveLength(5);
    expect(codeLines?.[0]).toHaveClass("cm-live-code-widget-fence");
    expect(codeLines?.[2]).toHaveClass("cm-live-code-widget-empty");
    expect(codeLines?.[4]).toHaveClass("cm-live-code-widget-fence");
    expect(codeLines?.[0]?.textContent).toBe("");
    expect(codeLines?.[2]?.textContent).toBe("");
    expect(codeLines?.[4]?.textContent).toBe("");

    codeLines?.[3]?.dispatchEvent(
      new MouseEvent("mousedown", { bubbles: true, cancelable: true })
    );

    expect(view.dom.querySelector(".cm-live-code-widget")).toBeNull();
    const editingLines = view.dom.querySelectorAll(".cm-live-code-editing");
    expect(editingLines).toHaveLength(5);
    expect(editingLines[0]).toHaveClass("cm-live-code-block-first");
    expect(editingLines[4]).toHaveClass("cm-live-code-block-last");
    expect(view.dom.querySelector(".cm-live-code-editing .hljs-keyword")?.textContent).toBe("private");
    expect(view.state.selection.main.head).toBe(doc.indexOf("private void Update()"));
    view.destroy();
  });

  it("keeps hidden fence rows in the preview and reveals their source on click", () => {
    const doc = ["```ts", "const answer = 42;", "```", "正文"].join("\n");
    const view = createView(doc, doc.indexOf("正文"));
    const rows = view.dom.querySelectorAll<HTMLElement>(".cm-live-code-widget-line");

    expect(rows).toHaveLength(3);
    expect(rows[0]).toHaveClass("cm-live-code-widget-fence");
    expect(rows[0]?.textContent).toBe("");
    expect(rows[2]).toHaveClass("cm-live-code-widget-fence");
    expect(rows[2]?.textContent).toBe("");

    rows[0]?.dispatchEvent(
      new MouseEvent("mousedown", { bubbles: true, cancelable: true })
    );

    expect(view.state.selection.main.head).toBe(0);
    expect(view.dom.querySelector(".cm-live-code-widget")).toBeNull();
    expect(view.dom.querySelector(".cm-live-code-fence")?.textContent).toBe("```ts");
    view.destroy();
  });

  it("keeps the interactive table visible when its source range or a cell is selected", () => {
    const doc = "| 名称 | 状态 |\n| --- | ---: |\n| 编辑器 | 完成 |\n\n正文";
    const view = createView(doc, doc.indexOf("完成"));
    const cell = Array.from(view.dom.querySelectorAll<HTMLElement>(".cm-live-table-cell-editor")).find(
      (element) => element.textContent === "完成"
    );

    cell?.dispatchEvent(new MouseEvent("mousedown", { bubbles: true, cancelable: true }));

    expect(view.dom.querySelector(".cm-live-table-widget")).not.toBeNull();
    expect(view.dom.querySelector(".cm-live-table-source")).toBeNull();
    expect(view.dom.textContent).not.toContain("| --- | ---: |");
    view.destroy();
  });

  it("edits a cell in place and writes the normalized table back to Markdown", () => {
    const doc = "| 名称 | 状态 |\n| --- | ---: |\n| 编辑器 | 完成 |\n\n正文";
    const view = createView(doc, doc.indexOf("正文"));
    const cell = Array.from(view.dom.querySelectorAll<HTMLElement>(".cm-live-table-cell-editor")).find(
      (element) => element.textContent === "完成"
    );

    expect(cell).not.toBeNull();
    if (cell) cell.textContent = "进行中";
    cell?.dispatchEvent(new FocusEvent("blur", { bubbles: false }));

    expect(view.state.doc.toString()).toContain(
      "| 名称 | 状态 |\n| --- | ---: |\n| 编辑器 | 进行中 |"
    );
    expect(view.dom.querySelector(".cm-live-table-widget")).not.toBeNull();
    expect(view.dom.querySelector(".cm-live-table-source")).toBeNull();
    view.destroy();
  });

  it("selects a rectangular range of cells without exposing source", () => {
    const doc = "| 名称 | 状态 |\n| --- | ---: |\n| 编辑器 | 完成 |\n\n正文";
    const view = createView(doc, doc.indexOf("正文"));
    const first = view.dom.querySelector<HTMLElement>(
      '.cm-live-table-cell[data-table-row="0"][data-table-column="0"] .cm-live-table-cell-editor'
    );
    const last = view.dom.querySelector<HTMLElement>(
      '.cm-live-table-cell[data-table-row="1"][data-table-column="1"] .cm-live-table-cell-editor'
    );

    first?.dispatchEvent(
      new MouseEvent("mousedown", { bubbles: true, button: 0, buttons: 1 })
    );
    last?.dispatchEvent(new MouseEvent("mouseover", { bubbles: true, buttons: 1 }));
    document.dispatchEvent(new MouseEvent("mouseup", { bubbles: true }));

    const frame = view.dom.querySelector<HTMLElement>(".cm-live-table-widget");
    expect(frame?.dataset.selectedCells).toBe("4");
    expect(frame?.querySelectorAll(".cm-live-table-cell.is-selected")).toHaveLength(4);
    expect(frame?.querySelectorAll(".cm-live-table-selection-outline")).toHaveLength(1);
    expect(frame?.querySelector<HTMLElement>(".cm-live-table-selection-outline")?.hidden).toBe(false);
    expect(view.dom.querySelector(".cm-live-table-source")).toBeNull();
    view.destroy();
  });

  it("renders bold and italic content inside cells and preserves their Markdown on edit", () => {
    const doc = "| **名称** | *状态* |\n| --- | --- |\n| **编辑器** | _完成_ |\n\n正文";
    const view = createView(doc, doc.indexOf("正文"));
    const editors = view.dom.querySelectorAll<HTMLElement>(".cm-live-table-cell-editor");

    expect(editors[0]?.querySelector("strong")?.textContent).toBe("名称");
    expect(editors[1]?.querySelector("em")?.textContent).toBe("状态");
    expect(editors[2]?.querySelector("strong")?.textContent).toBe("编辑器");
    expect(editors[3]?.querySelector("em")?.textContent).toBe("完成");
    expect(view.dom.querySelector(".cm-live-table-widget")?.textContent).not.toContain("**");

    const strong = editors[2]?.querySelector("strong");
    if (strong) strong.textContent = "Markdown 编辑器";
    editors[2]?.dispatchEvent(new FocusEvent("blur", { bubbles: false }));

    expect(view.state.doc.line(3).text).toBe("| **Markdown 编辑器** | _完成_ |");
    view.destroy();
  });

  it("adds a column and a row from the table edge controls", () => {
    const doc = "| 名称 | 状态 |\n| --- | ---: |\n| 编辑器 | 完成 |\n\n正文";
    const view = createView(doc, doc.indexOf("正文"));

    const columnHandles = view.dom.querySelectorAll(".cm-live-table-column-handle");
    const rowHandles = view.dom.querySelectorAll(".cm-live-table-row-handle");
    expect(columnHandles).toHaveLength(2);
    expect(rowHandles).toHaveLength(1);
    expect(columnHandles[0]?.querySelectorAll(".cm-live-table-grip-dots > span")).toHaveLength(6);
    expect(rowHandles[0]?.querySelectorAll(".cm-live-table-grip-dots > span")).toHaveLength(6);

    view.dom.querySelector<HTMLElement>(".cm-live-table-add-column")?.click();
    expect(view.dom.querySelectorAll(".cm-live-table-widget th")).toHaveLength(3);
    expect(view.state.doc.line(1).text).toBe("| 名称 | 状态 |  |");
    expect(view.state.doc.line(2).text).toBe("| --- | ---: | --- |");

    view.dom.querySelector<HTMLElement>(".cm-live-table-add-row")?.click();
    expect(view.dom.querySelectorAll(".cm-live-table-widget tbody tr")).toHaveLength(2);
    expect(view.state.doc.line(4).text).toBe("|  |  |  |");
    view.destroy();
  });

  it("reorders complete columns and rows with their drag handles", () => {
    const doc = [
      "| 名称 | 状态 |",
      "| --- | ---: |",
      "| 编辑器 | 完成 |",
      "| 阅读器 | 进行中 |",
      "",
      "正文"
    ].join("\n");
    const view = createView(doc, doc.indexOf("正文"));
    const drag = (source: Element | null, target: Element | null) => {
      source?.dispatchEvent(
        new MouseEvent("mousedown", { bubbles: true, cancelable: true, button: 0, buttons: 1 })
      );
      target?.dispatchEvent(
        new MouseEvent("mouseover", { bubbles: true, cancelable: true, buttons: 1 })
      );
      document.dispatchEvent(new MouseEvent("mouseup", { bubbles: true, button: 0 }));
    };

    drag(
      view.dom.querySelector('[data-drag-kind="column"][data-drag-index="0"]'),
      view.dom.querySelector('.cm-live-table-cell[data-table-row="0"][data-table-column="1"]')
    );
    expect(view.state.doc.line(1).text).toBe("| 状态 | 名称 |");
    expect(view.state.doc.line(3).text).toBe("| 完成 | 编辑器 |");

    drag(
      view.dom.querySelector('[data-drag-kind="row"][data-drag-index="1"]'),
      view.dom.querySelector('tbody tr[data-table-row="2"]')
    );

    expect(view.state.doc.line(3).text).toBe("| 进行中 | 阅读器 |");
    expect(view.state.doc.line(4).text).toBe("| 完成 | 编辑器 |");
    view.destroy();
  });
});

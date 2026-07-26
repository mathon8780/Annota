import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import App from "./App";
import { seedData } from "./data/seed";
import { AppStoreProvider } from "./store/AppStore";

function renderApp(clearStorage = true) {
  if (clearStorage) window.localStorage.clear();
  return render(
    <AppStoreProvider>
      <App />
    </AppStoreProvider>
  );
}

async function openFirstNotebook(user: ReturnType<typeof userEvent.setup>) {
  const notebook = seedData.notebooks[0];
  await user.click(
    screen.getByRole("button", { name: `打开笔记：${notebook.title}` })
  );
  return seedData.articles[notebook.rootId];
}

function dispatchPointer(
  target: Element,
  type: string,
  pointerId: number,
  clientX: number,
  clientY = 0
) {
  const event = new Event(type, { bubbles: true, cancelable: true });
  Object.defineProperties(event, {
    pointerId: { value: pointerId },
    clientX: { value: clientX },
    clientY: { value: clientY }
  });
  fireEvent(target, event);
}

function setDocumentSelection(block: Element, start: number, end: number) {
  const walker = document.createTreeWalker(block, NodeFilter.SHOW_TEXT);
  const points: Array<{ node: Text; start: number; end: number }> = [];
  let offset = 0;
  while (walker.nextNode()) {
    const node = walker.currentNode as Text;
    points.push({ node, start: offset, end: offset + node.data.length });
    offset += node.data.length;
  }
  const locate = (position: number) => {
    const point =
      points.find((candidate) => position <= candidate.end) ??
      points[points.length - 1];
    if (!point) throw new Error("Cannot select text in an empty document block.");
    return {
      node: point.node,
      offset: Math.min(point.node.data.length, Math.max(0, position - point.start))
    };
  };
  const from = locate(start);
  const to = locate(end);
  const range = document.createRange();
  range.setStart(from.node, from.offset);
  range.setEnd(to.node, to.offset);
  const selection = window.getSelection();
  selection?.removeAllRanges();
  selection?.addRange(range);
  fireEvent.mouseUp(block);
}

describe("Annota core flow", () => {
  it("always starts on the home page even when the last session ended in the reader", () => {
    window.localStorage.clear();
    window.localStorage.setItem(
      "annota.desktop.demo.v1",
      JSON.stringify({
        ...seedData,
        currentNotebookId: seedData.notebooks[0].id,
        currentArticleId: seedData.notebooks[0].rootId
      })
    );

    renderApp(false);

    expect(screen.getByRole("heading", { name: "继续生长你的知识树" })).toBeInTheDocument();
    expect(screen.queryByRole("region", { name: "文章阅读区域" })).not.toBeInTheDocument();
  });

  it("opens a recent notebook in the reader and returns home", async () => {
    const user = userEvent.setup();
    const { container } = renderApp();

    expect(screen.getByRole("heading", { name: "继续生长你的知识树" })).toBeInTheDocument();
    expect(screen.getByRole("banner", { name: "Annota 窗口标题栏" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "最小化窗口" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "最大化窗口" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "关闭窗口" })).toBeInTheDocument();
    const homeContent = container.querySelector(".home-content");
    expect(homeContent?.firstElementChild).toHaveClass("home-topbar");
    expect(homeContent?.querySelector(".home-topbar + .home-main")).toBeInTheDocument();
    expect(container.querySelector(".home-workspace > .home-topbar")).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "返回花园概览" })).not.toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: /打开笔记：ECS 架构/ }));

    expect(
      screen.getByRole("heading", { name: "ECS 架构：从数据布局到系统调度" })
    ).toBeInTheDocument();
    expect(screen.getByText("ECS 架构：从数据布局到系统调度 的子文章")).toBeInTheDocument();
    expect(container.querySelector(".route-stage")).not.toHaveAttribute("data-motion");
    expect(container.querySelector(".article-column")).toHaveAttribute("data-motion", "settle");
    expect(container.querySelector(".reader-breadcrumbs")).not.toBeInTheDocument();
    const readerSurface = screen.getByRole("region", { name: "文章阅读区域" });
    expect(
      within(readerSurface).getByRole("complementary", { name: "下一级子文章" })
    ).toBeInTheDocument();
    expect(container.querySelector(".reader-workspace > .children-column")).not.toBeInTheDocument();
    expect(screen.getByRole("separator", { name: "调整阅读路径宽度" })).toHaveAttribute(
      "aria-valuenow",
      "246"
    );

    const childrenPanel = screen.getByRole("complementary", { name: "下一级子文章" });
    await user.click(within(childrenPanel).getByRole("button", { name: /Component 为什么应该保持纯数据/ }));
    expect(container.querySelector(".article-column")).toHaveAttribute("data-motion", "forward");

    await user.click(screen.getByRole("button", { name: "返回主页" }));
    expect(screen.getByRole("heading", { name: "最近笔记" })).toBeInTheDocument();
    expect(container.querySelector(".route-stage")).not.toHaveAttribute("data-motion");
  });

  it("adjusts the reading path width with the keyboard", async () => {
    const user = userEvent.setup();
    renderApp();
    await user.click(screen.getByRole("button", { name: /打开笔记：ECS 架构/ }));

    const separator = screen.getByRole("separator", { name: "调整阅读路径宽度" });
    await user.click(separator);
    fireEvent.keyDown(separator, { key: "ArrowRight" });

    expect(separator).toHaveAttribute("aria-valuenow", "254");
    expect(window.localStorage.getItem("annota:reading-path-width")).toBe("254");

    dispatchPointer(separator, "pointerdown", 1, 254);
    dispatchPointer(separator, "pointermove", 1, 326);
    dispatchPointer(separator, "pointerup", 1, 326);

    expect(separator).toHaveAttribute("aria-valuenow", "326");
    expect(window.localStorage.getItem("annota:reading-path-width")).toBe("326");

    await user.click(screen.getByRole("button", { name: "返回主页" }));
    await openFirstNotebook(user);

    expect(screen.getByRole("separator", { name: "调整阅读路径宽度" }))
      .toHaveAttribute("aria-valuenow", "326");
  });

  it("separates the topology icon from the content that reveals on hover", async () => {
    const user = userEvent.setup();
    renderApp();
    await user.click(screen.getByRole("button", { name: /打开笔记：ECS 架构/ }));

    const panel = screen.getByRole("complementary", { name: "当前知识树拓扑" });
    expect(panel.querySelector(":scope > .topology-collapsed")).toBeInTheDocument();
    expect(panel.querySelector(":scope > .topology-content")).toBeInTheDocument();
    expect(
      panel.querySelector(".topology-content > .topology-viewport")
    ).toBeInTheDocument();
  });

  it("does not mutate React state when the pointer skims the topology trigger edge", async () => {
    const user = userEvent.setup();
    renderApp();
    await user.click(screen.getByRole("button", { name: /打开笔记：ECS 架构/ }));

    const panel = screen.getByRole("complementary", { name: "当前知识树拓扑" });
    const shell = panel.parentElement;

    expect(shell).toHaveClass("topology-shell");
    fireEvent.pointerEnter(panel);
    expect(shell).not.toHaveClass("is-hovered");
    fireEvent.pointerLeave(panel);
    expect(shell).not.toHaveClass("is-hovered");
  });

  it("elevates the topology shell in fullscreen", async () => {
    const user = userEvent.setup();
    renderApp();
    await user.click(screen.getByRole("button", { name: /打开笔记：ECS 架构/ }));

    const panel = screen.getByRole("complementary", { name: "当前知识树拓扑" });
    const shell = panel.parentElement;

    await user.click(screen.getByRole("button", { name: "全屏查看拓扑" }));
    expect(shell).toHaveClass("is-fullscreen");
  });

  it("resizes the topology from its border and focuses without changing zoom", async () => {
    const user = userEvent.setup();
    const { container } = renderApp();
    await user.click(screen.getByRole("button", { name: /打开笔记：ECS 架构/ }));

    const panel = screen.getByRole("complementary", { name: "当前知识树拓扑" });
    const viewport = container.querySelector(".topology-viewport") as HTMLDivElement;
    Object.defineProperties(viewport, {
      clientWidth: { configurable: true, value: 420 },
      clientHeight: { configurable: true, value: 224 }
    });

    const scene = container.querySelector(".topology-scene") as HTMLDivElement;
    const collapsedTransform = scene.style.transform;
    fireEvent.keyDown(window, { key: "f" });
    expect(scene.style.transform).toBe(collapsedTransform);

    await user.click(screen.getByRole("button", { name: "固定拓扑" }));
    const widthHandle = screen.getByRole("separator", { name: "调整拓扑图宽度" });
    dispatchPointer(widthHandle, "pointerdown", 2, 500, 280);
    dispatchPointer(widthHandle, "pointermove", 2, 420, 280);
    dispatchPointer(widthHandle, "pointerup", 2, 420, 280);

    expect(widthHandle).toHaveAttribute("aria-valuenow", "500");
    expect(window.localStorage.getItem("annota:topology-size")).toBe(
      JSON.stringify({ width: 500, height: 322 })
    );

    await user.click(screen.getByRole("button", { name: "放大拓扑" }));
    const transformBeforeFocus = scene.style.transform;
    fireEvent.keyDown(window, { key: "f" });

    expect(scene.style.transform).not.toBe(transformBeforeFocus);
    expect(scene.style.transform).toMatch(/scale\(0\.9\)$/);
    expect(panel).toHaveClass("is-pinned");
  });

  it("filters recent notebook cards", async () => {
    const user = userEvent.setup();
    renderApp();

    const input = screen.getByPlaceholderText("筛选当前卡片");
    await user.type(input, "Neo4j");

    expect(screen.getByRole("button", { name: /打开笔记：图数据库 Neo4j/ })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /打开笔记：ECS 架构/ })).not.toBeInTheDocument();
  });

  it("enables generation after a single-block selection and shows a placeholder job", async () => {
    const user = userEvent.setup();
    const { container } = renderApp();
    const article = await openFirstNotebook(user);
    const paragraph = article.blocks.find((block) => block.kind === "paragraph")!;
    const block = container.querySelector(`[data-block-id="${paragraph.id}"]`)!;
    setDocumentSelection(block, 0, 12);

    const explain = screen.getByTitle("解释选中文字");
    expect(explain).toBeEnabled();
    await user.click(explain);
    expect(screen.getByText("正在解释选区")).toBeInTheDocument();
  });

  it("keeps the article in one seamless editable surface", async () => {
    const user = userEvent.setup();
    const { container } = renderApp();
    const article = await openFirstNotebook(user);
    const editor = screen.getByRole("textbox", { name: "编辑文章正文" });
    const block = container.querySelector(
      `[data-block-id="${article.blocks[0].id}"]`
    )!;

    expect(editor).toHaveAttribute("contenteditable", "true");
    expect(container.querySelector("textarea")).not.toBeInTheDocument();

    await user.click(block);

    expect(container.querySelector(".block-edit-shell")).not.toBeInTheDocument();
    expect(container.querySelector(".is-focus-visible")).not.toBeInTheDocument();
  });

  it("autosaves text edited in the seamless document", async () => {
    const user = userEvent.setup();
    const { container } = renderApp();
    const article = await openFirstNotebook(user);
    const paragraph = article.blocks.find((block) => block.kind === "paragraph")!;
    const block = container.querySelector(
      `[data-block-id="${paragraph.id}"]`
    ) as HTMLElement;

    block.textContent = `${paragraph.text}新增内容`;
    fireEvent.input(block);

    await waitFor(() => {
      const stored = JSON.parse(
        window.localStorage.getItem("annota.desktop.demo.v1") ?? "{}"
      );
      expect(
        stored.articles[article.id].blocks.find(
          (candidate: { id: string }) => candidate.id === paragraph.id
        ).text
      ).toBe(`${paragraph.text}新增内容`);
    });
  });

  it("creates a paragraph block when Enter is pressed", async () => {
    const user = userEvent.setup();
    const { container } = renderApp();
    const article = await openFirstNotebook(user);
    const paragraph = article.blocks.find((block) => block.kind === "paragraph")!;
    const splitAt = 6;
    const editor = screen.getByRole("textbox", { name: "编辑文章正文" });
    const block = container.querySelector(`[data-block-id="${paragraph.id}"]`)!;

    setDocumentSelection(block, splitAt, splitAt);
    fireEvent.keyDown(editor, { key: "Enter" });

    await waitFor(() => {
      const documentBlocks = Array.from(
        container.querySelectorAll<HTMLElement>(".document-block")
      );
      const blockIndex = documentBlocks.findIndex(
        (candidate) => candidate.dataset.blockId === paragraph.id
      );
      expect(documentBlocks).toHaveLength(article.blocks.length + 1);
      expect(documentBlocks[blockIndex].textContent).toBe(
        paragraph.text.slice(0, splitAt)
      );
      expect(documentBlocks[blockIndex + 1].textContent).toBe(
        paragraph.text.slice(splitAt)
      );
      expect(documentBlocks[blockIndex + 1]).toHaveAttribute(
        "data-block-kind",
        "paragraph"
      );
    });
  });

  it("merges with the previous block on Backspace at block start", async () => {
    const user = userEvent.setup();
    const { container } = renderApp();
    const article = await openFirstNotebook(user);
    const previous = article.blocks[0];
    const current = article.blocks[1];
    const editor = screen.getByRole("textbox", { name: "编辑文章正文" });
    const currentBlock = container.querySelector(
      `[data-block-id="${current.id}"]`
    )!;

    setDocumentSelection(currentBlock, 0, 0);
    fireEvent.keyDown(editor, { key: "Backspace" });

    await waitFor(() => {
      expect(container.querySelectorAll(".document-block")).toHaveLength(
        article.blocks.length - 1
      );
      expect(
        container.querySelector(`[data-block-id="${previous.id}"]`)?.textContent
      ).toBe(`${previous.text}${current.text}`);
      expect(
        container.querySelector(`[data-block-id="${current.id}"]`)
      ).not.toBeInTheDocument();
    });
  });

  it("creates paragraph blocks from multiline plain-text paste", async () => {
    const user = userEvent.setup();
    const { container } = renderApp();
    const article = await openFirstNotebook(user);
    const paragraph = article.blocks.find((block) => block.kind === "paragraph")!;
    const pasteAt = 4;
    const editor = screen.getByRole("textbox", { name: "编辑文章正文" });
    const block = container.querySelector(`[data-block-id="${paragraph.id}"]`)!;

    setDocumentSelection(block, pasteAt, pasteAt);
    fireEvent.paste(editor, {
      clipboardData: { getData: () => "第一行\n第二行\n第三行" }
    });

    await waitFor(() => {
      const documentBlocks = Array.from(
        container.querySelectorAll<HTMLElement>(".document-block")
      );
      const blockIndex = documentBlocks.findIndex(
        (candidate) => candidate.dataset.blockId === paragraph.id
      );
      expect(documentBlocks).toHaveLength(article.blocks.length + 2);
      expect(
        documentBlocks.slice(blockIndex, blockIndex + 3).map((item) => item.textContent)
      ).toEqual([
        `${paragraph.text.slice(0, pasteAt)}第一行`,
        "第二行",
        `第三行${paragraph.text.slice(pasteAt)}`
      ]);
      expect(documentBlocks[blockIndex + 1]).toHaveAttribute(
        "data-block-kind",
        "paragraph"
      );
      expect(documentBlocks[blockIndex + 2]).toHaveAttribute(
        "data-block-kind",
        "paragraph"
      );
    });
  });

  it("dismisses transient reader interactions from whitespace without blocking controls", async () => {
    const user = userEvent.setup();
    const { container } = renderApp();
    const article = await openFirstNotebook(user);
    const paragraph = article.blocks.find((block) => block.kind === "paragraph")!;
    const block = container.querySelector(`[data-block-id="${paragraph.id}"]`)!;
    setDocumentSelection(block, 0, 4);

    await user.click(screen.getByRole("button", { name: "文字颜色" }));
    expect(screen.getByRole("dialog", { name: "文字颜色选项" })).toBeInTheDocument();
    expect(container.querySelector(".selection-toolbar")).not.toBeInTheDocument();
    expect(screen.getByTitle("解释选中文字")).toBeEnabled();

    fireEvent.pointerDown(container.querySelector(".article-scroll-region")!);

    await waitFor(() => {
      expect(
        screen.queryByRole("dialog", { name: "文字颜色选项" })
      ).not.toBeInTheDocument();
      expect(screen.getAllByTitle("先选择正文文字")).toHaveLength(2);
      screen.getAllByTitle("先选择正文文字").forEach((button) => {
        expect(button).toBeDisabled();
      });
      expect(screen.getByRole("textbox", { name: "编辑文章正文" })).not.toHaveFocus();
      expect(window.getSelection()?.rangeCount).toBe(0);
    });
  });

  it("applies bold formatting to a selection and restores it after reopening the reader", async () => {
    const user = userEvent.setup();
    const { container } = renderApp();
    const article = await openFirstNotebook(user);
    const paragraph = article.blocks.find((block) => block.kind === "paragraph")!;
    const selectedText = paragraph.text.slice(0, 6);
    const block = container.querySelector(`[data-block-id="${paragraph.id}"]`)!;
    setDocumentSelection(block, 0, selectedText.length);

    expect(screen.getByRole("button", { name: "加粗" })).toBeEnabled();
    expect(screen.getByRole("button", { name: "斜体" })).toBeEnabled();
    expect(screen.getByRole("button", { name: "删除线" })).toBeEnabled();
    expect(screen.getByRole("button", { name: "下划线" })).toBeEnabled();
    await user.click(screen.getByRole("button", { name: "加粗" }));

    await waitFor(() => {
      const stored = JSON.parse(
        window.localStorage.getItem("annota.desktop.demo.v1") ?? "{}"
      );
      expect(stored.articles[article.id].blocks.find(
        (block: { id: string }) => block.id === paragraph.id
      ).marks).toEqual([
        expect.objectContaining({ type: "bold", start: 0, end: selectedText.length })
      ]);
    });

    await user.click(screen.getByRole("button", { name: "返回主页" }));
    await openFirstNotebook(user);

    expect(screen.getByText(selectedText, { selector: ".inline-mark-bold" }))
      .toBeInTheDocument();
  });

  it("applies the selected text color without storing HTML", async () => {
    const user = userEvent.setup();
    const { container } = renderApp();
    const article = await openFirstNotebook(user);
    const paragraph = article.blocks.find((block) => block.kind === "paragraph")!;
    const selectedText = paragraph.text.slice(0, 4);
    const block = container.querySelector(`[data-block-id="${paragraph.id}"]`)!;
    setDocumentSelection(block, 0, selectedText.length);

    await user.click(screen.getByRole("button", { name: "文字颜色" }));
    await user.click(screen.getByRole("button", { name: "文字颜色：蓝色" }));
    await waitFor(() => {
      const stored = JSON.parse(
        window.localStorage.getItem("annota.desktop.demo.v1") ?? "{}"
      );
      expect(stored.articles[article.id].blocks.find(
        (block: { id: string }) => block.id === paragraph.id
      ).marks).toEqual([
        expect.objectContaining({
          type: "textColor",
          color: "#2563eb",
          start: 0,
          end: selectedText.length
        })
      ]);
    });

    await user.click(screen.getByRole("button", { name: "返回主页" }));
    await openFirstNotebook(user);

    const coloredText = document.querySelector(".inline-mark-text-color");
    expect(coloredText).not.toBeNull();
    expect(coloredText).toHaveTextContent(selectedText.trim());
    expect(coloredText).toHaveStyle({ color: "#2563eb" });
    expect(paragraph.text).not.toContain("<span");
  });

  it("offers preset and custom colors in mutually exclusive menus", async () => {
    const user = userEvent.setup();
    const { container } = renderApp();
    const article = await openFirstNotebook(user);
    const paragraph = article.blocks.find((block) => block.kind === "paragraph")!;
    const selectedText = paragraph.text.slice(0, 5);
    const block = container.querySelector(`[data-block-id="${paragraph.id}"]`)!;
    setDocumentSelection(block, 0, selectedText.length);

    await user.click(screen.getByRole("button", { name: "文字颜色" }));
    expect(screen.getByRole("button", { name: "文字颜色：黄色" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "文字颜色：红色" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "文字颜色：绿色" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "文字颜色：蓝色" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "文字颜色：紫色" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "文字颜色：黑色" })).toBeInTheDocument();
    expect(screen.getByLabelText("自选文字颜色")).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "背景标注颜色" }));
    expect(
      screen.queryByRole("button", { name: "文字颜色：黄色" })
    ).not.toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "背景标注颜色：黄色" })
    ).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "背景标注颜色：橙色" })
    ).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "背景标注颜色：绿色" })
    ).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "背景标注颜色：蓝色" })
    ).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "背景标注颜色：紫色" })
    ).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "背景标注颜色：灰色" })
    ).toBeInTheDocument();
    expect(screen.getByLabelText("自选背景标注颜色")).toBeInTheDocument();

    await user.click(
      screen.getByRole("button", { name: "背景标注颜色：蓝色" })
    );
    await waitFor(() => {
      const stored = JSON.parse(
        window.localStorage.getItem("annota.desktop.demo.v1") ?? "{}"
      );
      expect(stored.articles[article.id].blocks.find(
        (block: { id: string }) => block.id === paragraph.id
      ).marks).toEqual([
        expect.objectContaining({
          type: "backgroundColor",
          color: "#bfdbfe",
          start: 0,
          end: selectedText.length
        })
      ]);
    });

    await user.click(screen.getByRole("button", { name: "返回主页" }));
    await openFirstNotebook(user);

    expect(document.querySelector(".inline-mark-background-color"))
      .toHaveStyle({ backgroundColor: "#bfdbfe" });
  });

  it("opens an empty settings workspace from the bottom of the home sidebar", async () => {
    const user = userEvent.setup();
    const { container } = renderApp();

    const settingsButton = screen.getByRole("button", { name: "打开设置" });
    expect(settingsButton.closest(".home-sidebar-footer")).not.toBeNull();
    await user.click(settingsButton);

    expect(screen.getByRole("heading", { name: "设置" })).toBeInTheDocument();
    const settingsCanvas = screen.getByRole("main", { name: "设置内容" });
    expect(settingsCanvas).toBeEmptyDOMElement();
    expect(container.querySelector(".home-app")).not.toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "返回主页" }));
    expect(screen.getByRole("heading", { name: "最近笔记" })).toBeInTheDocument();
  });
});

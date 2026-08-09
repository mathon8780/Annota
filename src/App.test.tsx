import { act, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { EditorView } from "@codemirror/view";
import App from "./App";
import { markdownRanges } from "./editor/markdownDocument";
import { clearBrowserMarkdownDocuments } from "./editor/markdownRepository";
import { seedData, seedMarkdownDocuments } from "./test/fixtures/seed";
import {
  APP_DATA_STORAGE_KEY,
  AppStoreProvider
} from "./store/AppStore";
import {
  initialModelProviders,
  MODEL_PROVIDERS_STORAGE_KEY
} from "./utils/modelProviders";
import { APP_THEME_STORAGE_KEY } from "./utils/themePreferences";

afterEach(() => {
  vi.restoreAllMocks();
});

function seedStoredAppData(data = seedData) {
  window.localStorage.clear();
  clearBrowserMarkdownDocuments();
  window.localStorage.setItem("annota:content-reset.single-markdown-v1", "done");
  window.localStorage.setItem(APP_DATA_STORAGE_KEY, JSON.stringify(data));
  Object.entries(seedMarkdownDocuments).forEach(([id, markdown]) => {
    window.localStorage.setItem(`annota:markdown-document.v1:${id}`, markdown);
  });
}

function renderApp(clearStorage = true) {
  if (clearStorage) seedStoredAppData();
  return render(
    <AppStoreProvider>
      <App />
    </AppStoreProvider>
  );
}

function showRecentBrowsing() {
  const viewport = screen.getByRole("region", { name: "主页分页内容" });
  if (viewport.getAttribute("data-active-page") === "overview") {
    fireEvent.wheel(viewport, { deltaY: 96 });
  }
}

async function openFirstNotebook(user: ReturnType<typeof userEvent.setup>) {
  const notebook = seedData.notebooks[0];
  showRecentBrowsing();
  await user.click(
    screen.getByRole("button", { name: `打开笔记：${notebook.title}` })
  );
  return seedData.articles[notebook.rootId];
}

async function openGenerationPage(user: ReturnType<typeof userEvent.setup>) {
  renderApp();
  const sidebar = screen.getByRole("complementary", { name: "主页导航" });
  await user.click(
    within(sidebar).getByRole("button", { name: "拓扑节点" })
  );
  return screen.getByRole("region", { name: "拓扑节点内容" });
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

function markdownEditorView() {
  const content = screen.getByRole("textbox", { name: "编辑文章正文" });
  const view = EditorView.findFromDOM(content as HTMLElement);
  if (!view) throw new Error("CodeMirror editor is not ready.");
  return view;
}

function markdownRange(article: (typeof seedData.articles)[string], blockId: string) {
  const range = markdownRanges(seedMarkdownDocuments[article.id] ?? "", article.id)
    .find((candidate) => candidate.id === blockId);
  if (!range) throw new Error(`Unknown Markdown range ${blockId}`);
  return range;
}

function firstParagraph(article: (typeof seedData.articles)[string]) {
  const range = markdownRanges(seedMarkdownDocuments[article.id] ?? "", article.id)
    .find((candidate) => candidate.kind === "paragraph");
  if (!range) throw new Error(`Article ${article.id} has no Markdown paragraph`);
  return range;
}

function markdownBlockStart(article: (typeof seedData.articles)[string], blockId: string) {
  const range = markdownRange(article, blockId);
  const source = seedMarkdownDocuments[article.id] ?? "";
  const start = source.indexOf(range.text, range.from);
  if (start < 0) throw new Error(`Cannot locate range ${blockId} in Markdown source.`);
  return start;
}

function setDocumentSelection(
  article: (typeof seedData.articles)[string],
  blockId: string,
  start: number,
  end: number
) {
  const view = markdownEditorView();
  const block = markdownRange(article, blockId);
  const selectedText = block.text.slice(start, end);
  const locatedSelection = selectedText
    ? view.state.doc.toString().indexOf(selectedText)
    : -1;
  const from =
    locatedSelection >= 0
      ? locatedSelection
      : markdownBlockStart(article, blockId) + start;
  const to = locatedSelection >= 0 ? locatedSelection + selectedText.length : from;
  act(() => {
    view.dispatch({
      selection: { anchor: from, head: to }
    });
    view.focus();
  });
}

function replaceMarkdown(from: number, to: number, insert: string) {
  const view = markdownEditorView();
  act(() => {
    view.dispatch({ changes: { from, to, insert } });
  });
}

describe("Annota core flow", () => {
  it("always starts on the home page even when the last session ended in the reader", () => {
    seedStoredAppData({
      ...seedData,
      currentNotebookId: seedData.notebooks[0].id,
      currentArticleId: seedData.notebooks[0].rootId
    });

    renderApp(false);

    expect(screen.getByRole("heading", { name: "继续生长你的知识树" })).toBeInTheDocument();
    expect(screen.queryByRole("region", { name: "文章阅读区域" })).not.toBeInTheDocument();
  });

  it("starts with an empty library when no user data exists", () => {
    window.localStorage.clear();

    const { container } = renderApp(false);

    expect(container.querySelector(".home-ledger strong")).toHaveTextContent(
      "0"
    );
    expect(screen.getByText("知识库还是空的")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /打开笔记：/ })).toBeNull();
  });

  it("removes bundled notes from legacy storage", () => {
    window.localStorage.clear();
    window.localStorage.setItem(
      "annota.desktop.demo.v1",
      JSON.stringify(seedData)
    );

    const { container } = renderApp(false);

    expect(container.querySelector(".home-ledger strong")).toHaveTextContent(
      "0"
    );
    expect(screen.getByText("知识库还是空的")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /打开笔记：/ })).toBeNull();
  });

  it("clears retired article metadata and browser Markdown content on upgrade", () => {
    window.localStorage.clear();
    window.localStorage.setItem("annota.desktop.library.v1", JSON.stringify(seedData));
    window.localStorage.setItem("annota:markdown-document.v1:ecs-root", "不应保留的旧正文");

    const { container } = renderApp(false);

    expect(container.querySelector(".home-ledger strong")).toHaveTextContent("0");
    expect(window.localStorage.getItem("annota.desktop.library.v1")).toBeNull();
    expect(window.localStorage.getItem("annota:markdown-document.v1:ecs-root")).toBeNull();
    expect(window.localStorage.getItem("annota:content-reset.single-markdown-v1")).toBe("done");
  });

  it("only exposes home and generation in the home navigation", () => {
    renderApp();
    const sidebar = screen.getByRole("complementary", { name: "主页导航" });
    const navigation = within(sidebar).getByRole("navigation");

    expect(within(navigation).getAllByRole("button")).toHaveLength(2);
    expect(within(navigation).getByRole("button", { name: "主页" })).toBeInTheDocument();
    expect(
      within(navigation).getByRole("button", { name: "拓扑节点" })
    ).toBeInTheDocument();
    expect(within(navigation).queryByRole("button", { name: "文件夹" })).toBeNull();
    expect(within(navigation).queryByRole("button", { name: "标签" })).toBeNull();
    expect(within(navigation).queryByRole("button", { name: "收藏" })).toBeNull();
  });

  it("drops retired organization fields when current data is loaded", async () => {
    const retiredData = JSON.parse(JSON.stringify(seedData));
    retiredData.folderProfiles = [{ key: "legacy" }];
    retiredData.deletedFolderKeys = ["legacy"];
    retiredData.notebooks[0].category = "legacy";
    retiredData.notebooks[0].tags = ["legacy"];
    retiredData.articles[retiredData.notebooks[0].rootId].tags = ["legacy"];
    seedStoredAppData(retiredData);

    renderApp(false);

    await waitFor(() => {
      const stored = JSON.parse(
        window.localStorage.getItem(APP_DATA_STORAGE_KEY) ?? "{}"
      );
      expect(stored.folderProfiles).toBeUndefined();
      expect(stored.deletedFolderKeys).toBeUndefined();
      expect(stored.notebooks[0].category).toBeUndefined();
      expect(stored.notebooks[0].tags).toBeUndefined();
      expect(stored.articles[stored.notebooks[0].rootId].tags).toBeUndefined();
    });
  });

  it("removes retired organization terms from custom display settings", () => {
    seedStoredAppData();
    window.localStorage.setItem(
      "annota:custom-content-style",
      JSON.stringify({
        name: "旧风格",
        terms: {
          home: "工作台",
          folders: "旧文件夹",
          tags: "旧标签",
          favorites: "旧收藏"
        }
      })
    );

    renderApp(false);

    const stored = JSON.parse(
      window.localStorage.getItem("annota:custom-content-style") ?? "{}"
    );
    expect(stored.terms.home).toBe("工作台");
    expect(stored.terms.folders).toBeUndefined();
    expect(stored.terms.tags).toBeUndefined();
    expect(stored.terms.favorites).toBeUndefined();
  });

  it("opens generation and prompts as a top-level page above the sidebar footer", async () => {
    const user = userEvent.setup();
    renderApp();
    const sidebar = screen.getByRole("complementary", { name: "主页导航" });
    const navigation = within(sidebar).getByRole("navigation");
    const footer = sidebar.querySelector(".home-sidebar-footer");
    const generationButton = within(navigation).getByRole("button", {
      name: "拓扑节点"
    });

    expect(navigation.nextElementSibling).toBe(footer);
    expect(generationButton.closest(".home-sidebar-footer")).toBeNull();

    await user.click(generationButton);

    expect(generationButton).toHaveAttribute("aria-current", "page");
    expect(
      screen.getByRole("region", { name: "拓扑节点内容" })
    ).toBeInTheDocument();
    expect(
      screen.getByRole("heading", { level: 2, name: "拓扑节点" })
    ).toBeInTheDocument();
  });

  it("switches generation types and validates prompt-template drafts", async () => {
    const user = userEvent.setup();
    const generationPage = await openGenerationPage(user);

    expect(
      within(generationPage).getByRole("button", { name: /^解释\s*内置 · AI$/ })
    ).toBeInTheDocument();
    expect(
      within(generationPage).getByRole("textbox", { name: "节点类型名称" })
    ).toHaveValue("解释");

    await user.click(
      within(generationPage).getByRole("button", {
        name: /^翻译\s*内置/
      })
    );
    expect(
      within(generationPage).getByRole("textbox", { name: "节点类型名称" })
    ).toHaveValue("翻译");

    const systemPrompt = within(generationPage).getByRole("textbox", {
      name: "System Prompt"
    });
    await user.type(systemPrompt, "\n请保持术语一致。");
    expect(within(generationPage).getByRole("status")).toHaveTextContent(
      "提示词修改已自动保存"
    );
    expect(
      within(generationPage).getByText("用户在阅读器中当前选中的文字")
    ).toBeInTheDocument();

    const selectionVariable = within(generationPage).getByRole("button", {
      name: /插入变量 \{\{selection\.text\}\}/
    });
    expect(selectionVariable).toBeInTheDocument();

    const userPrompt = within(generationPage).getByRole("textbox", {
      name: "User Prompt"
    });
    fireEvent.change(userPrompt, { target: { value: "{{unknown.value}}" } });

    expect(
      within(generationPage).getByText(
        "包含未知变量，请修正提示词模板。"
      )
    ).toBeInTheDocument();
    expect(
      within(generationPage).queryByText("保存为新版本")
    ).not.toBeInTheDocument();
  });

  it("uses one progressively wider context scope for each generation type", async () => {
    const user = userEvent.setup();
    const generationPage = await openGenerationPage(user);
    const contextGroup = within(generationPage).getByRole("group", {
      name: "选择生成内容使用的最大上下文范围"
    });
    const contextRadios = within(contextGroup).getAllByRole("radio");

    expect(
      contextRadios.map(
        (radio) =>
          radio.closest("label")?.querySelector("strong")?.textContent
      )
    ).toEqual([
      "所在段落",
      "附近段落（上三个与下三个段落）",
      "整个章节",
      "整篇文章",
      "父一级文章",
      "所有父级文章"
    ]);
    expect(contextRadios).toHaveLength(6);
    expect(contextRadios[0]).toBeChecked();

    await user.click(
      within(contextGroup).getByRole("radio", { name: /附近段落/ })
    );

    expect(
      within(contextGroup).getByRole("radio", { name: /附近段落/ })
    ).toBeChecked();
    expect(contextRadios[0]).not.toBeChecked();
    expect(contextRadios.filter((radio) => radio.matches(":checked"))).toHaveLength(1);
    expect(within(generationPage).getByRole("status")).toHaveTextContent(
      "设置修改已自动保存"
    );
  });

  it("lists the topology card nodes and previews the selected node style", async () => {
    const user = userEvent.setup();
    const generationPage = await openGenerationPage(user);
    const nodeNames = [
      "根节点",
      "解释",
      "翻译",
      "总结",
      "重点",
      "追问",
      "术语",
      "对比",
      "代码",
      "实践清单",
      "个人笔记",
      "原文来源",
      "复习闪卡"
    ];

    nodeNames.forEach((name) => {
      expect(
        within(generationPage).getByRole("button", {
          name: new RegExp(`^${name}\\s*内置`)
        })
      ).toBeInTheDocument();
    });
    expect(
      within(generationPage).getByRole("article", {
        name: "节点样式预览：解释"
      })
    ).toHaveClass("is-explain");

    await user.click(
      within(generationPage).getByRole("button", {
        name: /^翻译\s*内置 · AI$/
      })
    );
    expect(
      within(generationPage).getByRole("article", {
        name: "节点样式预览：翻译"
      })
    ).toHaveClass("is-translate");

    await user.selectOptions(
      within(generationPage).getByRole("combobox", { name: "节点样式" }),
      "compare"
    );
    expect(
      within(generationPage).getByRole("article", {
        name: "节点样式预览：翻译"
      })
    ).toHaveClass("is-compare");
    await waitFor(() => {
      const stored = JSON.parse(
        window.localStorage.getItem("annota.generation-types.v1") ?? "[]"
      );
      expect(stored.find((item: { id: string }) => item.id === "translate"))
        .toMatchObject({ cardVariant: "compare", executionMode: "ai" });
    });

    await user.click(
      within(generationPage).getByRole("button", {
        name: /^重点\s*内置 · 手动$/
      })
    );
    expect(
      within(generationPage).getByRole("article", {
        name: "节点样式预览：重点"
      })
    ).toHaveClass("is-highlight");
    expect(
      within(generationPage).getByRole("combobox", { name: "调用模型" })
    ).toBeDisabled();
    expect(
      within(generationPage).getByRole("textbox", { name: "System Prompt" })
    ).toBeDisabled();
    expect(
      within(generationPage).getByRole("checkbox", { name: "启用重点" })
    ).toBeInTheDocument();
    expect(
      within(generationPage).getByRole("checkbox", {
        name: "允许重点节点互动"
      })
    ).toBeInTheDocument();
  });

  it("creates a custom generation type and opens a request-free template preview", async () => {
    const user = userEvent.setup();
    const fetchSpy = vi.spyOn(globalThis, "fetch");
    const generationPage = await openGenerationPage(user);

    await user.click(
      within(generationPage).getByRole("button", { name: "新建节点类型" })
    );
    expect(
      within(generationPage).getByRole("button", {
        name: /^未命名节点\s*自定义 · AI/
      })
    ).toBeInTheDocument();
    expect(
      within(generationPage).getByRole("textbox", { name: "节点类型名称" })
    ).toHaveValue("未命名节点");
    expect(
      within(generationPage).getAllByRole("radio")[0]
    ).toBeChecked();

    await user.click(
      within(generationPage).getByRole("button", { name: "提示词预览" })
    );
    const preview = await screen.findByRole("dialog", { name: "输出预览" });
    expect(within(preview).getByText(/不会发起模型请求/)).toBeInTheDocument();
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it("keeps creation and enable controls in the generation type rail", async () => {
    const user = userEvent.setup();
    const generationPage = await openGenerationPage(user);
    const typeList = generationPage.querySelector(".generation-type-list");
    const createButton = within(generationPage).getByRole("button", {
      name: "新建节点类型"
    });
    const explainToggle = within(generationPage).getByRole("checkbox", {
      name: "启用解释"
    });
    const explainButton = within(generationPage).getByRole("button", {
      name: /^解释\s*内置 · AI$/
    });

    expect(typeList?.nextElementSibling).toBe(createButton);
    expect(explainToggle.closest(".generation-type-item")).not.toBeNull();
    expect(explainButton).toHaveAttribute("aria-current", "page");
    expect(
      within(generationPage).getByText("2 个已启用")
    ).toBeInTheDocument();
    expect(within(generationPage).getByRole("status")).toHaveTextContent(
      "所有修改都会自动保存到本机"
    );
    expect(
      Array.from(
        generationPage.querySelectorAll(
          ".generation-identity-grid > label > span:first-child, .generation-identity-grid > fieldset > legend"
        )
      ).map((label) => label.textContent)
    ).toEqual([
      "节点类型名称",
      "调用模型",
      "节点样式",
      "拓扑互动",
      "标记颜色",
      "列表图标"
    ]);
    expect(
      within(generationPage).queryByRole("textbox", { name: "关系标签" })
    ).not.toBeInTheDocument();
    expect(
      within(generationPage).queryByRole("textbox", { name: "标记颜色" })
    ).not.toBeInTheDocument();
    expect(
      within(generationPage).getAllByRole("button", {
        name: /使用标记颜色：/
      })
    ).toHaveLength(8);
    expect(
      within(generationPage).queryByText(
        "指定执行此行为时使用的模型；Demo 不会发起真实请求。"
      )
    ).not.toBeInTheDocument();

    await user.click(explainToggle);

    expect(explainToggle).not.toBeChecked();
    expect(explainButton).toHaveAttribute("aria-current", "page");
    expect(
      within(generationPage).getByText("1 个已启用")
    ).toBeInTheDocument();
    expect(generationPage.querySelector(".generation-inspector")).toBeNull();
    expect(
      generationPage.querySelector(".generation-inspector-head")
    ).toBeNull();
    expect(
      generationPage.querySelector(".generation-version-pill")
    ).toBeNull();
    expect(generationPage.querySelector(".generation-auto-save")).toBeNull();
    expect(generationPage.querySelector(".generation-demo-notice")).toBeNull();
    expect(generationPage.querySelector(".generation-type-copy")).toBeNull();
    expect(
      generationPage.querySelector(".generation-enabled-control")
    ).toBeNull();
    expect(
      within(generationPage).queryByText("类型草稿")
    ).not.toBeInTheDocument();
    expect(
      within(generationPage).queryByText("复制当前类型")
    ).not.toBeInTheDocument();
    expect(
      within(generationPage).getByRole("complementary", {
        name: "节点预览与模板检查"
      })
    ).toBeInTheDocument();
    expect(generationPage.querySelector(".generation-trace")).toBeNull();

    const reviewHeadings = within(
      within(generationPage).getByRole("complementary", {
        name: "节点预览与模板检查"
      })
    ).getAllByRole("heading", { level: 3 });
    expect(reviewHeadings.map((heading) => heading.textContent)).toEqual([
      "节点样式预览",
      "上下文策略",
      "输出结构"
    ]);
    expect(
      within(generationPage).queryByText("版本控制")
    ).not.toBeInTheDocument();
    expect(generationPage.querySelector(".generation-version-controller")).toBeNull();
  });

  it("configures a model and list icon for each generation behavior", async () => {
    const user = userEvent.setup();
    renderApp();
    window.localStorage.setItem(
      MODEL_PROVIDERS_STORAGE_KEY,
      JSON.stringify(
        initialModelProviders.map((provider) => {
          if (provider.id === "deepseek") {
            return {
                ...provider,
                apiKey: "sk-deepseek",
                availableModels: ["deepseek-chat", "deepseek-reasoner"],
                enabledModels: ["deepseek-reasoner"],
                model: "deepseek-reasoner"
              };
          }
          if (provider.id === "chatgpt") {
            return {
              ...provider,
              apiKey: "sk-disabled",
              availableModels: ["gpt-disabled"],
              enabledModels: ["gpt-disabled"],
              model: "gpt-disabled",
              enabled: false
            };
          }
          return provider;
        })
      )
    );
    const sidebar = screen.getByRole("complementary", { name: "主页导航" });
    await user.click(
      within(sidebar).getByRole("button", { name: "拓扑节点" })
    );
    const generationPage = screen.getByRole("region", {
      name: "拓扑节点内容"
    });
    const explainButton = within(generationPage).getByRole("button", {
      name: /^解释\s*内置 · AI$/
    });
    const modelSelect = within(generationPage).getByRole("combobox", {
      name: "调用模型"
    });
    const translateIcon = within(generationPage).getByRole("button", {
      name: "使用图标：语言翻译"
    });

    expect(
      within(modelSelect).queryByRole("option", { name: "deepseek-chat" })
    ).not.toBeInTheDocument();
    expect(
      within(modelSelect).queryByRole("option", { name: "gpt-disabled" })
    ).not.toBeInTheDocument();
    await user.selectOptions(modelSelect, "deepseek:deepseek-reasoner");
    await user.click(translateIcon);

    expect(modelSelect).toHaveValue("deepseek:deepseek-reasoner");
    expect(translateIcon).toHaveAttribute("aria-pressed", "true");
    expect(
      explainButton
        .closest(".generation-type-item")
        ?.querySelector(".generation-type-icon")
    ).toHaveAttribute("data-icon", "translate");

    await user.click(
      within(generationPage).getByRole("button", { name: "提示词预览" })
    );
    expect(
      within(
        await screen.findByRole("dialog", { name: "输出预览" })
      ).getByText("Deepseek · deepseek-reasoner")
    ).toBeInTheDocument();
  });

  it("deletes custom generation types while protecting built-in types", async () => {
    const user = userEvent.setup();
    const generationPage = await openGenerationPage(user);

    expect(
      within(generationPage).queryByRole("button", {
        name: "删除节点类型：解释"
      })
    ).toBeNull();
    expect(
      within(generationPage).getByLabelText("解释为内置类型，无法删除")
    ).toBeInTheDocument();

    expect(
      within(generationPage).getByLabelText("追问为内置类型，无法删除")
    ).toBeInTheDocument();
    await user.click(
      within(generationPage).getByRole("button", { name: "新建节点类型" })
    );
    await user.click(
      within(generationPage).getByRole("button", {
        name: "删除节点类型：未命名节点"
      })
    );

    expect(
      within(generationPage).queryByRole("button", {
        name: /未命名节点/
      })
    ).toBeNull();
    expect(
      within(generationPage).getByRole("textbox", { name: "节点类型名称" })
    ).toHaveValue("解释");
    expect(within(generationPage).getByRole("status")).toHaveTextContent(
      "已删除自定义节点类型"
    );
  });

  it("slides from the overview to recent browsing and only returns from its top edge", () => {
    const { container } = renderApp();
    const viewport = screen.getByRole("region", { name: "主页分页内容" });
    const recentPage = container.querySelector(
      ".home-recent-page"
    ) as HTMLElement;

    expect(viewport).toHaveAttribute("data-active-page", "overview");
    fireEvent.wheel(viewport, { deltaY: 96 });
    expect(viewport).toHaveAttribute("data-active-page", "recent");

    Object.defineProperty(recentPage, "scrollTop", {
      configurable: true,
      writable: true,
      value: 80
    });
    fireEvent.wheel(recentPage, { deltaY: -96 });
    expect(viewport).toHaveAttribute("data-active-page", "recent");

    recentPage.scrollTop = 0;
    fireEvent.wheel(recentPage, { deltaY: -96 });
    expect(viewport).toHaveAttribute("data-active-page", "overview");
  });

  it("renders C++ demo notes in a descending recent-browsing timeline", () => {
    const { container } = renderApp();
    const viewport = screen.getByRole("region", { name: "主页分页内容" });
    fireEvent.wheel(viewport, { deltaY: 96 });

    const timeline = screen.getByRole("list", { name: "最近浏览时间线" });
    const timestamps = Array.from(
      timeline.querySelectorAll<HTMLTimeElement>("time[data-timestamp]")
    ).map((item) => Number(item.dataset.timestamp));

    expect(timestamps).toEqual([...timestamps].sort((left, right) => right - left));
    expect(
      screen.getByRole("button", { name: "打开笔记：虚函数与动态多态" })
    ).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "打开笔记：模板基础与函数模板" })
    ).toBeInTheDocument();
    expect(container.querySelector(".recent-timeline-line")).toBeInTheDocument();
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
    expect(homeContent?.firstElementChild).toHaveClass(
      "home-mobile-nav"
    );
    expect(
      homeContent?.querySelector(
        ".home-mobile-nav + .home-page-viewport"
      )
    ).toBeInTheDocument();
    expect(container.querySelector(".home-workspace > .home-topbar")).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "返回主页" })).not.toBeInTheDocument();
    const article = await openFirstNotebook(user);

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

    setDocumentSelection(
      article,
      markdownRanges(seedMarkdownDocuments[article.id], article.id)[0].id,
      0,
      1
    );
    expect(container.querySelector(".article-column")).toHaveAttribute("data-motion", "settle");

    const childrenPanel = screen.getByRole("complementary", { name: "下一级子文章" });
    await user.click(within(childrenPanel).getByRole("button", { name: /Component 为什么应该保持纯数据/ }));
    expect(container.querySelector(".article-column")).toHaveAttribute("data-motion", "forward");

    await user.click(screen.getByRole("button", { name: "返回主页" }));
    expect(screen.getByRole("heading", { name: "继续生长你的知识树" })).toBeInTheDocument();
    expect(container.querySelector("#recent-title")).toHaveTextContent("最近浏览");
    expect(container.querySelector(".route-stage")).not.toHaveAttribute("data-motion");
  });

  it("adjusts the reading path width with the keyboard", async () => {
    const user = userEvent.setup();
    renderApp();
    await openFirstNotebook(user);

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

  it("retains the unread descendant tail when moving up and replaces it on another branch", async () => {
    const user = userEvent.setup();
    const { container } = renderApp();
    await openFirstNotebook(user);

    let childrenPanel = screen.getByRole("complementary", { name: "下一级子文章" });
    await user.click(
      within(childrenPanel).getByRole("button", {
        name: /System 的更新顺序与依赖调度/
      })
    );
    childrenPanel = screen.getByRole("complementary", { name: "下一级子文章" });
    await user.click(
      within(childrenPanel).getByRole("button", {
        name: /为什么物理查询会破坏批处理节奏/
      })
    );

    const readingPath = screen.getByRole("complementary", { name: "阅读路径" });
    await user.click(
      within(readingPath).getByRole("button", {
        name: /System 的更新顺序与依赖调度/
      })
    );

    let retainedStep = container.querySelector(
      ".path-step.is-retained"
    );
    expect(retainedStep).toHaveTextContent("为什么物理查询会破坏批处理节奏");
    expect(
      within(readingPath).getByRole("button", {
        name: "继续阅读：为什么物理查询会破坏批处理节奏"
      })
    ).toBeInTheDocument();

    await user.click(
      within(readingPath).getByRole("button", {
        name: /ECS 架构：从数据布局到系统调度/
      })
    );
    childrenPanel = screen.getByRole("complementary", { name: "下一级子文章" });
    await user.click(
      within(childrenPanel).getByRole("button", {
        name: /Component 为什么应该保持纯数据/
      })
    );

    retainedStep = container.querySelector(".path-step.is-retained");
    expect(retainedStep).toBeNull();
    expect(within(readingPath).queryByText("System 的更新顺序与依赖调度"))
      .not.toBeInTheDocument();
    expect(within(readingPath).queryByText("为什么物理查询会破坏批处理节奏"))
      .not.toBeInTheDocument();
  });

  it("zooms only the article content with Ctrl and the mouse wheel", async () => {
    const user = userEvent.setup();
    const { container } = renderApp();
    await openFirstNotebook(user);

    const readerSurface = screen.getByRole("region", { name: "文章阅读区域" });
    const article = container.querySelector(".article-column");
    const toolbar = container.querySelector(".inline-formatting-toolbar");

    expect(article).toHaveAttribute("data-content-zoom", "1");
    fireEvent.wheel(readerSurface, { deltaY: -100 });
    expect(article).toHaveAttribute("data-content-zoom", "1");

    const browserZoomPrevented = fireEvent.wheel(readerSurface, {
      ctrlKey: true,
      deltaY: -100
    });
    expect(browserZoomPrevented).toBe(false);
    expect(article).toHaveAttribute("data-content-zoom", "1.1");
    expect(article).toHaveStyle({ "--reader-reading-font-size": "17.6px" });
    expect(article).toHaveStyle({ "--reader-body-line-height": "25.52px" });
    expect(toolbar).not.toHaveAttribute("data-content-zoom");
    expect(window.localStorage.getItem("annota:reader-content-zoom.v1")).toBe("1.1");
    expect(screen.getByRole("status")).toHaveTextContent("显示比例 110%");

    fireEvent.wheel(readerSurface, { ctrlKey: true, deltaY: 100 });
    expect(article).toHaveAttribute("data-content-zoom", "1");

    fireEvent.wheel(readerSurface, { ctrlKey: true, deltaY: -100 });
    expect(article).toHaveAttribute("data-content-zoom", "1.1");

    await user.click(screen.getByRole("button", { name: "返回主页" }));
    await openFirstNotebook(user);
    expect(container.querySelector(".article-column"))
      .toHaveAttribute("data-content-zoom", "1.1");
  });

  it("keeps the topology trigger separate from the animated panel", async () => {
    const user = userEvent.setup();
    renderApp();
    await openFirstNotebook(user);

    const panel = screen.getByRole("complementary", { name: "当前知识树拓扑" });
    const shell = panel.parentElement;
    const trigger = screen.getByRole("button", { name: "展开文章拓扑" });

    expect(shell).toHaveClass("topology-shell");
    expect(trigger.parentElement).toBe(shell);
    expect(panel.querySelector(".topology-collapsed")).not.toBeInTheDocument();
    expect(panel.querySelector(":scope > .topology-content")).toBeInTheDocument();
    expect(
      panel.querySelector(".topology-content > .topology-viewport")
    ).toBeInTheDocument();
    expect(
      panel.querySelector(".topology-viewport > .topology-overlay .topology-actions")
    ).toBeInTheDocument();
    expect(panel.querySelector(".topology-header")).not.toBeInTheDocument();
    expect(panel.querySelector(".topology-footer")).not.toBeInTheDocument();
  });

  it("opens from the fixed trigger and closes only after leaving the stable shell", async () => {
    const user = userEvent.setup();
    renderApp();
    await openFirstNotebook(user);

    const panel = screen.getByRole("complementary", { name: "当前知识树拓扑" });
    const shell = panel.parentElement!;
    const trigger = screen.getByRole("button", { name: "展开文章拓扑" });
    const viewport = panel.querySelector(".topology-viewport");

    expect(shell).not.toHaveClass("is-open");
    fireEvent.pointerEnter(panel);
    expect(shell).not.toHaveClass("is-open");

    fireEvent.pointerEnter(trigger);
    expect(shell).toHaveClass("is-open");
    expect(panel.querySelector(".topology-viewport")).toBe(viewport);

    fireEvent.pointerMove(shell);
    expect(shell).toHaveClass("is-open");
    fireEvent.pointerLeave(shell);
    expect(shell).not.toHaveClass("is-open");
    expect(panel.querySelector(".topology-viewport")).toBe(viewport);
  });

  it("does not open the topology when Tab focus reaches its trigger", async () => {
    const user = userEvent.setup();
    renderApp();
    await openFirstNotebook(user);

    const panel = screen.getByRole("complementary", { name: "当前知识树拓扑" });
    const shell = panel.parentElement!;
    const trigger = screen.getByRole("button", { name: "展开文章拓扑" });

    trigger.focus();
    expect(trigger).toHaveFocus();
    expect(trigger).toHaveAttribute("aria-expanded", "false");
    expect(shell).not.toHaveClass("is-open");

    await user.keyboard("{Enter}");
    expect(trigger).toHaveAttribute("aria-expanded", "true");
    expect(shell).toHaveClass("is-open");
  });

  it("keeps the canvas open after unpinning and toggles pinning with D", async () => {
    const user = userEvent.setup();
    renderApp();
    const article = await openFirstNotebook(user);

    const panel = screen.getByRole("complementary", { name: "当前知识树拓扑" });
    const shell = panel.parentElement!;
    const viewport = panel.querySelector(".topology-viewport")!;

    fireEvent.pointerEnter(screen.getByRole("button", { name: "展开文章拓扑" }));
    fireEvent.pointerEnter(shell);
    await user.click(screen.getByRole("button", { name: "固定拓扑" }));
    expect(panel).toHaveClass("is-pinned");

    const unpinButton = screen.getByRole("button", { name: "取消固定拓扑" });
    await user.click(unpinButton);
    fireEvent.blur(unpinButton, { relatedTarget: null });
    fireEvent.pointerDown(viewport, { button: 0, pointerId: 12 });

    expect(panel).not.toHaveClass("is-pinned");
    expect(shell).toHaveClass("is-open");

    fireEvent.pointerUp(viewport, { button: 0, pointerId: 12 });
    fireEvent.keyDown(window, { key: "d" });
    expect(panel).toHaveClass("is-pinned");
    fireEvent.keyDown(window, { key: "d" });
    expect(panel).not.toHaveClass("is-pinned");
    expect(shell).toHaveClass("is-open");
  });

  it("moves between an expanded panel and fullscreen through one focused shared transition", async () => {
    const user = userEvent.setup();
    const startViewTransition = vi.fn((updateCallback: () => void) => {
      updateCallback();
      return { finished: Promise.resolve() };
    });
    Object.defineProperty(document, "startViewTransition", {
      configurable: true,
      value: startViewTransition
    });

    try {
      renderApp();
      await openFirstNotebook(user);

      const panel = screen.getByRole("complementary", { name: "当前知识树拓扑" });
      const shell = panel.parentElement!;
      fireEvent.pointerEnter(screen.getByRole("button", { name: "展开文章拓扑" }));
      expect(shell).toHaveClass("is-open");

      fireEvent.keyDown(window, { key: "e", ctrlKey: true });

      expect(startViewTransition).toHaveBeenCalledTimes(1);
      expect(shell).toHaveClass("is-fullscreen");
      expect(panel).toHaveClass("is-shared-transition");
      expect(panel).toHaveAttribute("data-focus-mode", "overall");

      fireEvent.keyDown(window, { key: "e", ctrlKey: true });

      expect(startViewTransition).toHaveBeenCalledTimes(2);
      expect(shell).not.toHaveClass("is-fullscreen");
      expect(panel).not.toHaveClass("is-shared-transition");
      expect(panel).toHaveAttribute("data-focus-mode", "current");
      expect(shell).toHaveAttribute("data-small-expanded", "true");
    } finally {
      Reflect.deleteProperty(document, "startViewTransition");
    }
  });

  it("elevates the topology shell in fullscreen with Ctrl E", async () => {
    const user = userEvent.setup();
    renderApp();
    await openFirstNotebook(user);

    const panel = screen.getByRole("complementary", { name: "当前知识树拓扑" });
    const shell = panel.parentElement;

    expect(screen.getByText("Ctrl + E 打开拓扑")).toBeInTheDocument();
    fireEvent.keyDown(window, { key: "e", ctrlKey: true });
    expect(shell).toHaveClass("is-fullscreen");
    expect(panel).toHaveAttribute("data-focus-mode", "overall");

    await user.click(screen.getByRole("button", { name: "放大拓扑" }));
    expect(panel).toHaveAttribute("data-focus-mode", "manual");
    fireEvent.keyDown(window, { key: "e", ctrlKey: true });
    fireEvent.keyDown(window, { key: "e", ctrlKey: true });
    expect(panel).toHaveAttribute("data-focus-mode", "overall");
  });

  it("resizes the topology and cycles focus without pinning the panel", async () => {
    const user = userEvent.setup();
    const { container } = renderApp();
    await openFirstNotebook(user);

    const panel = screen.getByRole("complementary", { name: "当前知识树拓扑" });
    const viewport = container.querySelector(".topology-viewport") as HTMLDivElement;
    Object.defineProperties(viewport, {
      clientWidth: { configurable: true, value: 50 },
      clientHeight: { configurable: true, value: 50 }
    });

    const scene = container.querySelector(".topology-scene") as HTMLDivElement;
    const collapsedTransform = scene.style.transform;
    fireEvent.keyDown(window, { key: "f" });
    expect(scene.style.transform).toBe(collapsedTransform);

    fireEvent.pointerEnter(screen.getByRole("button", { name: "展开文章拓扑" }));
    expect(panel).toHaveAttribute("data-focus-mode", "current");
    expect(panel).not.toHaveClass("is-pinned");
    const currentNode = container.querySelector<HTMLElement>(
      ".topology-node-card[aria-current='page']"
    )!;
    const expectedCurrentX =
      420 / 2 - (Number.parseFloat(currentNode.style.left) + 214 / 2) * 0.9;
    const expectedCurrentY =
      322 / 2 -
      (Number.parseFloat(currentNode.style.top) + 118 / 2) * 0.9;
    expect(scene.style.transform).toBe(
      `translate(${expectedCurrentX}px, ${expectedCurrentY}px) scale(0.9)`
    );
    fireEvent.keyDown(window, { key: "f" });
    expect(panel).toHaveAttribute("data-focus-mode", "overall");
    expect(panel).not.toHaveClass("is-pinned");
    fireEvent.keyDown(window, { key: "f" });
    expect(panel).toHaveAttribute("data-focus-mode", "current");

    const widthHandle = screen.getByRole("separator", { name: "调整拓扑图宽度" });
    dispatchPointer(widthHandle, "pointerdown", 2, 500, 280);
    dispatchPointer(widthHandle, "pointermove", 2, 420, 280);
    dispatchPointer(widthHandle, "pointerup", 2, 420, 280);

    expect(widthHandle).toHaveAttribute("aria-valuenow", "500");
    expect(panel).not.toHaveClass("is-pinned");
    const storedTopologySize = JSON.parse(
      window.localStorage.getItem("annota:topology-size")!
    );
    expect(storedTopologySize).toMatchObject({ version: 2 });
    expect(storedTopologySize.widthRatio).toBeCloseTo(
      500 / (window.innerWidth - 32)
    );
    expect(storedTopologySize.heightRatio).toBeCloseTo(
      322 / (window.innerHeight - 128)
    );
    fireEvent.keyDown(widthHandle, { key: "ArrowRight" });
    expect(widthHandle).toHaveAttribute("aria-valuenow", "492");
    expect(panel).not.toHaveClass("is-pinned");

    const originalInnerWidth = window.innerWidth;
    const originalInnerHeight = window.innerHeight;
    try {
      Object.defineProperty(window, "innerWidth", { configurable: true, value: 720 });
      Object.defineProperty(window, "innerHeight", { configurable: true, value: 560 });
      fireEvent.resize(window);
      expect(Number(widthHandle.getAttribute("aria-valuenow"))).toBeLessThan(492);
      expect(
        (panel.parentElement as HTMLElement).style.getPropertyValue("--topology-height")
      ).toBe("220px");
    } finally {
      Object.defineProperty(window, "innerWidth", {
        configurable: true,
        value: originalInnerWidth
      });
      Object.defineProperty(window, "innerHeight", {
        configurable: true,
        value: originalInnerHeight
      });
      fireEvent.resize(window);
    }

    await user.click(screen.getByRole("button", { name: "固定拓扑" }));
    expect(panel).toHaveClass("is-pinned");

    await user.click(screen.getByRole("button", { name: "放大拓扑" }));
    expect(panel).toHaveAttribute("data-focus-mode", "manual");
    fireEvent.keyDown(window, { key: "f" });

    expect(panel).toHaveAttribute("data-focus-mode", "overall");
    expect(panel).toHaveClass("is-pinned");
  });

  it("uses double click navigation semantics in the full knowledge tree", async () => {
    const user = userEvent.setup();
    const { container } = renderApp();
    await openFirstNotebook(user);

    fireEvent.keyDown(window, { key: "e", ctrlKey: true });
    const panel = screen.getByRole("complementary", { name: "当前知识树拓扑" });
    const shell = panel.parentElement!;
    const nodes = Array.from(
      container.querySelectorAll<HTMLButtonElement>(".topology-node-card")
    );
    const firstTarget = nodes.find((node) => !node.matches("[aria-current='page']"))!;
    const firstTitle = firstTarget.querySelector(".topology-node-card-title")!.textContent!;

    await user.click(firstTarget);
    expect(shell).toHaveClass("is-fullscreen");
    expect(screen.queryByRole("heading", { level: 1, name: firstTitle })).not.toBeInTheDocument();

    fireEvent.doubleClick(firstTarget, { ctrlKey: true });
    expect(shell).toHaveClass("is-fullscreen");
    expect(screen.getByRole("heading", { level: 1, name: firstTitle })).toBeInTheDocument();

    const secondTarget = nodes.find((node) => node !== firstTarget)!;
    const secondTitle = secondTarget.querySelector(".topology-node-card-title")!.textContent!;
    fireEvent.doubleClick(secondTarget);
    expect(shell).not.toHaveClass("is-fullscreen");
    expect(screen.getByRole("heading", { level: 1, name: secondTitle })).toBeInTheDocument();
  });

  it("filters recent notebook cards", async () => {
    const user = userEvent.setup();
    renderApp();

    fireEvent.wheel(screen.getByRole("region", { name: "主页分页内容" }), {
      deltaY: 96
    });
    const input = screen.getByPlaceholderText("筛选当前卡片");
    await user.type(input, "Neo4j");

    expect(screen.getByRole("button", { name: /打开笔记：图数据库 Neo4j/ })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /打开笔记：ECS 架构/ })).not.toBeInTheDocument();
  });

  it("does not create generated content when no generation service is configured", async () => {
    const user = userEvent.setup();
    renderApp();
    const article = await openFirstNotebook(user);
    const paragraph = firstParagraph(article);
    setDocumentSelection(article, paragraph.id, 0, 12);

    const explain = screen.getByTitle("解释选中文字");
    expect(explain).toBeEnabled();
    await user.click(explain);
    expect(
       screen.getByText(/没有可用模型/)
    ).toBeInTheDocument();
    expect(screen.queryByText("正在解释选区")).not.toBeInTheDocument();
  });

  it("uses the configured prompt and model to create a generated child article", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({
        choices: [
          {
            message: {
              content: JSON.stringify({
                title: "选择文本的实际解释",
                summary: "模型根据当前段落生成的解释。",
                blocks: [
                  { type: "heading", text: "核心含义" },
                  { type: "paragraph", text: "这是模型返回的正文内容。" }
                ]
              })
            }
          }
        ]
      })
    } as Response);
    seedStoredAppData();
    window.localStorage.setItem(
      MODEL_PROVIDERS_STORAGE_KEY,
      JSON.stringify(
        initialModelProviders.map((provider) =>
          provider.id === "chatgpt"
            ? {
                ...provider,
                apiKey: "sk-runtime",
                availableModels: ["gpt-runtime"],
                enabledModels: ["gpt-runtime"],
                model: "gpt-runtime"
              }
            : provider
        )
      )
    );
    const user = userEvent.setup();
    renderApp(false);
    const article = await openFirstNotebook(user);
    const paragraph = firstParagraph(article);
    setDocumentSelection(article, paragraph.id, 0, 12);

    await user.click(screen.getByTitle("解释选中文字"));
    expect(
      await screen.findByRole("button", {
        name: /打开子文章：选择文本的实际解释/
      })
    ).toBeInTheDocument();
    expect(globalThis.fetch).toHaveBeenCalledWith(
      "https://api.openai.com/v1/chat/completions",
      expect.objectContaining({
        method: "POST",
        body: expect.stringContaining("<context_scope>")
      })
    );
  });

  it("keeps the article in one seamless editable surface", async () => {
    const user = userEvent.setup();
    const { container } = renderApp();
    const article = await openFirstNotebook(user);
    const editor = screen.getByRole("textbox", { name: "编辑文章正文" });
    expect(editor).toHaveAttribute("contenteditable", "true");
    expect(container.querySelector("textarea")).not.toBeInTheDocument();
    expect(container.querySelector(".cm-editor")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "实时预览" })).toHaveAttribute(
      "aria-pressed",
      "true"
    );

    await user.click(editor);

    expect(container.querySelector(".block-edit-shell")).not.toBeInTheDocument();
    expect(container.querySelector(".is-focus-visible")).not.toBeInTheDocument();
  });

  it("does not move the caret when the blank editor root is clicked", async () => {
    const user = userEvent.setup();
    const { container } = renderApp();
    await openFirstNotebook(user);
    const editor = screen.getByTestId("markdown-editor-content");
    const view = markdownEditorView();
    const anchor = Math.min(8, view.state.doc.length);

    act(() => {
      view.dispatch({ selection: { anchor } });
      view.focus();
    });
    fireEvent.pointerDown(editor);
    fireEvent.mouseDown(editor);

    expect(view.state.selection.main.anchor).toBe(anchor);
    expect(view.state.selection.main.empty).toBe(true);
    expect(container.querySelector(".cm-selectionLayer")).toBeNull();
  });

  it("keeps heading geometry when switching between preview and source", async () => {
    const user = userEvent.setup();
    const { container } = renderApp();
    await openFirstNotebook(user);

    expect(container.querySelector(".cm-live-heading-2")).toHaveTextContent(
      "为什么要把数据与行为拆开"
    );

    await user.click(screen.getByRole("button", { name: "源码" }));

    const sourceHeading = container.querySelector(".cm-source-heading-2");
    expect(sourceHeading).toHaveTextContent("## 为什么要把数据与行为拆开");
    expect(sourceHeading).not.toHaveClass("cm-live-heading");
    expect(container.querySelector(".cm-live-heading")).toBeNull();

    await user.click(screen.getByRole("button", { name: "实时预览" }));

    expect(container.querySelector(".cm-live-heading-2")).toHaveTextContent(
      "为什么要把数据与行为拆开"
    );
    expect(container.querySelector(".cm-source-heading")).toBeNull();
  });

  it("places the formatting toolbar across the full reading surface", async () => {
    const user = userEvent.setup();
    const { container } = renderApp();
    await openFirstNotebook(user);

    const readerSurface = screen.getByRole("region", { name: "文章阅读区域" });
    const toolbar = within(readerSurface).getByRole("toolbar", { name: "文字格式" });
    const articleColumn = container.querySelector(".article-column");
    const expandWidth = within(toolbar).getByRole("button", { name: "撑满正文显示区域" });
    const editorControls = container.querySelector(".markdown-editor-controls");
    const articleHeader = container.querySelector(".article-header");

    expect(toolbar.parentElement).toBe(readerSurface);
    expect(readerSurface.firstElementChild).toBe(toolbar);
    expect(within(toolbar).queryByText("选区格式")).not.toBeInTheDocument();
    expect(readerSurface.querySelector(":scope > span")).toBeNull();
    expect(editorControls).toBeInTheDocument();
    expect(editorControls?.querySelector("details")).toBeNull();
    expect(articleHeader?.querySelector(":scope > div")).toBeNull();
    expect(articleHeader?.querySelector(":scope > p")).toBeNull();
    expect(articleHeader?.querySelector(":scope > button")).toBeNull();
    expect(toolbar.lastElementChild).toBe(expandWidth);
    expect(expandWidth).toHaveAttribute("aria-pressed", "false");
    expect(articleColumn).not.toHaveClass("is-full-width");

    await user.click(expandWidth);
    const restoreWidth = within(toolbar).getByRole("button", { name: "恢复居中阅读宽度" });
    expect(restoreWidth).toHaveAttribute("aria-pressed", "true");
    expect(articleColumn).toHaveClass("is-full-width");

    await user.click(restoreWidth);
    expect(articleColumn).not.toHaveClass("is-full-width");
  });

  it("switches the reading path to current-only mode from settings", async () => {
    const user = userEvent.setup();
    renderApp();

    await user.click(screen.getByRole("button", { name: "打开设置" }));
    const modeSwitch = screen.getByRole("switch", {
      name: "保留后续阅读路径"
    });
    expect(modeSwitch).toHaveAttribute("aria-checked", "true");

    await user.click(modeSwitch);

    expect(modeSwitch).toHaveAttribute("aria-checked", "false");
    expect(window.localStorage.getItem("annota:reading-path-mode.v1")).toBe(
      "current-only"
    );

    await user.click(screen.getByRole("button", { name: "主页" }));
    await openFirstNotebook(user);
    let childrenPanel = screen.getByRole("complementary", { name: "下一级子文章" });
    await user.click(
      within(childrenPanel).getByRole("button", {
        name: /System 的更新顺序与依赖调度/
      })
    );
    childrenPanel = screen.getByRole("complementary", { name: "下一级子文章" });
    await user.click(
      within(childrenPanel).getByRole("button", {
        name: /为什么物理查询会破坏批处理节奏/
      })
    );
    const readingPath = screen.getByRole("complementary", { name: "阅读路径" });
    await user.click(
      within(readingPath).getByRole("button", {
        name: /System 的更新顺序与依赖调度/
      })
    );

    expect(within(readingPath).queryByText("为什么物理查询会破坏批处理节奏"))
      .not.toBeInTheDocument();
    expect(document.querySelector(".path-step.is-retained")).toBeNull();
  });

  it("autosaves text edited in the seamless document", async () => {
    const user = userEvent.setup();
    renderApp();
    const article = await openFirstNotebook(user);
    const paragraph = firstParagraph(article);
    const insertion = markdownBlockStart(article, paragraph.id) + paragraph.text.length;
    replaceMarkdown(insertion, insertion, "新增内容");

    await waitFor(() => {
      expect(
        window.localStorage.getItem(`annota:markdown-document.v1:${article.id}`)
      ).toContain(`${paragraph.text}新增内容`);
    });
  });

  it("dismisses transient reader interactions from whitespace without blocking controls", async () => {
    const user = userEvent.setup();
    const { container } = renderApp();
    const article = await openFirstNotebook(user);
    const paragraph = firstParagraph(article);
    setDocumentSelection(article, paragraph.id, 0, 4);

    await user.click(screen.getByRole("button", { name: "选择文字颜色" }));
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

  it("writes bold Markdown and restores it after reopening the reader", async () => {
    const user = userEvent.setup();
    renderApp();
    const article = await openFirstNotebook(user);
    const paragraph = firstParagraph(article);
    const selectedText = paragraph.text.slice(0, 6);
    setDocumentSelection(article, paragraph.id, 0, selectedText.length);

    expect(screen.getByRole("button", { name: "加粗" })).toBeEnabled();
    expect(screen.getByRole("button", { name: "斜体" })).toBeEnabled();
    expect(screen.getByRole("button", { name: "删除线" })).toBeEnabled();
    expect(screen.getByRole("button", { name: "下划线" })).toBeEnabled();
    await user.click(screen.getByRole("button", { name: "加粗" }));

    await waitFor(() => {
      expect(
        window.localStorage.getItem(`annota:markdown-document.v1:${article.id}`)
      ).toContain(`**${selectedText}**`);
    });

    await user.click(screen.getByRole("button", { name: "返回主页" }));
    await openFirstNotebook(user);

    expect(markdownEditorView().state.doc.toString()).toContain(`**${selectedText}**`);
  });

  it("stores selected text color as controlled Markdown HTML", async () => {
    const user = userEvent.setup();
    renderApp();
    const article = await openFirstNotebook(user);
    const paragraph = firstParagraph(article);
    const selectedText = paragraph.text.slice(0, 4);
    setDocumentSelection(article, paragraph.id, 0, selectedText.length);

    await user.click(screen.getByRole("button", { name: "选择文字颜色" }));
    await user.click(screen.getByRole("button", { name: "文字颜色：蓝色" }));
    await waitFor(() => {
      expect(
        window.localStorage.getItem(`annota:markdown-document.v1:${article.id}`)
      ).toContain(`<span style="color:#2563eb">${selectedText}</span>`);
    });

    await user.click(screen.getByRole("button", { name: "返回主页" }));
    await openFirstNotebook(user);

    expect(markdownEditorView().state.doc.toString()).toContain(
      `<span style="color:#2563eb">${selectedText}</span>`
    );
  });

  it("applies the last used text and background colors with one click", async () => {
    const user = userEvent.setup();
    renderApp();
    const article = await openFirstNotebook(user);
    const paragraph = firstParagraph(article);

    setDocumentSelection(article, paragraph.id, 0, 2);
    await user.click(screen.getByRole("button", { name: "选择文字颜色" }));
    await user.click(screen.getByRole("button", { name: "文字颜色：蓝色" }));

    setDocumentSelection(article, paragraph.id, 3, 5);
    await user.click(screen.getByRole("button", { name: "文字颜色" }));

    setDocumentSelection(article, paragraph.id, 6, 8);
    await user.click(screen.getByRole("button", { name: "选择背景标注颜色" }));
    await user.click(
      screen.getByRole("button", { name: "背景标注颜色：紫色" })
    );

    setDocumentSelection(article, paragraph.id, 9, 11);
    await user.click(screen.getByRole("button", { name: "背景标注颜色" }));

    await waitFor(() => {
      const source = window.localStorage.getItem(
        `annota:markdown-document.v1:${article.id}`
      );
      expect(source).toContain("color:#2563eb");
      expect(source).toContain("background-color:#e9d5ff");
    });
  });

  it("offers preset and custom colors in mutually exclusive menus", async () => {
    const user = userEvent.setup();
    renderApp();
    const article = await openFirstNotebook(user);
    const paragraph = firstParagraph(article);
    const selectedText = paragraph.text.slice(0, 5);
    setDocumentSelection(article, paragraph.id, 0, selectedText.length);

    await user.click(screen.getByRole("button", { name: "选择文字颜色" }));
    expect(screen.getByRole("button", { name: "文字颜色：黄色" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "文字颜色：红色" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "文字颜色：绿色" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "文字颜色：蓝色" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "文字颜色：紫色" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "文字颜色：黑色" })).toBeInTheDocument();
    expect(screen.getByLabelText("自选文字颜色")).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "选择背景标注颜色" }));
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
      expect(
        window.localStorage.getItem(`annota:markdown-document.v1:${article.id}`)
      ).toContain(`<mark style="background-color:#bfdbfe">${selectedText}</mark>`);
    });

    await user.click(screen.getByRole("button", { name: "返回主页" }));
    await openFirstNotebook(user);

    expect(markdownEditorView().state.doc.toString()).toContain(
      `<mark style="background-color:#bfdbfe">${selectedText}</mark>`
    );
  });

  it("opens the categorized settings workspace from the bottom of the home sidebar", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({
        data: [
          { id: "gpt-5-mini" },
          { id: "gpt-5.1" },
          { id: "gpt-4.1" }
        ]
      })
    } as Response);
    const user = userEvent.setup();
    const { container } = renderApp();

    const settingsButton = screen.getByRole("button", { name: "打开设置" });
    expect(settingsButton.closest(".home-sidebar-footer")).not.toBeNull();
    await user.click(settingsButton);

    const settingsCanvas = screen.getByRole("region", { name: "设置内容" });
    expect(container.querySelector(".home-app")).toBeInTheDocument();
    expect(container.querySelector(".settings-home-topbar")).not.toBeInTheDocument();
    expect(settingsCanvas.parentElement).toHaveClass(
      "home-content",
      "is-settings-open"
    );
    expect(settingsCanvas).toHaveClass("home-main", "settings-home-main");
    expect(container.querySelector(".settings-category-index")).not.toBeInTheDocument();
    expect(container.querySelector(".settings-display-badge")).not.toBeInTheDocument();
    expect(within(settingsCanvas).queryByText("全局")).not.toBeInTheDocument();
    const categories = [
      "外观与交互",
      "快捷键",
      "AI 模型服务",
      "知识库与存储",
      "备份与恢复",
      "导入、导出与迁移",
      "隐私与安全",
      "更新、诊断与关于"
    ];

    categories.forEach((category) => {
      expect(
        within(settingsCanvas).getByRole("button", { name: category })
      ).toBeInTheDocument();
    });
    expect(
      within(settingsCanvas).queryByRole("button", {
        name: "拓扑节点"
      })
    ).not.toBeInTheDocument();
    expect(
      within(settingsCanvas).getByRole("heading", {
        level: 2,
        name: "外观与交互"
      })
    ).toBeInTheDocument();
    expect(within(settingsCanvas).getByText("界面字体")).toBeInTheDocument();
    expect(
      within(settingsCanvas).getByText("浏览器预览使用内置字体")
    ).toBeInTheDocument();
    expect(
      within(settingsCanvas).getByRole("searchbox", { name: "筛选系统字体" })
    ).toBeDisabled();
    expect(
      within(settingsCanvas).getByRole("radio", { name: /Cobalt 浅色/ })
    ).toBeChecked();
    await user.click(
      within(settingsCanvas).getByRole("radio", { name: /Gruvbox 暖夜/ })
    );
    expect(
      within(settingsCanvas).getByRole("radio", { name: /Gruvbox 暖夜/ })
    ).toBeChecked();
    expect(window.localStorage.getItem(APP_THEME_STORAGE_KEY)).toBe("gruvbox");
    expect(document.documentElement).toHaveAttribute("data-theme", "gruvbox");
    await user.selectOptions(
      within(settingsCanvas).getByRole("combobox", { name: "界面字体" }),
      "system-sans"
    );
    expect(document.documentElement.style.getPropertyValue("--font-body"))
      .toContain("Segoe UI");
    expect(document.documentElement.style.getPropertyValue("--font-mono"))
      .toContain("Segoe UI");
    await user.selectOptions(
      within(settingsCanvas).getByRole("combobox", { name: "正文字体" }),
      "songti"
    );
    expect(document.documentElement.style.getPropertyValue("--font-reading"))
      .toContain("Songti SC");
    await user.selectOptions(
      within(settingsCanvas).getByRole("combobox", { name: "代码字体" }),
      "consolas"
    );
    expect(document.documentElement.style.getPropertyValue("--font-code"))
      .toContain("Consolas");
    expect(document.documentElement.style.getPropertyValue("--font-mono"))
      .toContain("Segoe UI");
    expect(
      JSON.parse(window.localStorage.getItem("annota:font-preferences") ?? "{}")
    ).toMatchObject({
      interfaceFamily: "system-sans",
      readingFamily: "songti",
      codeFamily: "consolas"
    });
    expect(
      within(settingsCanvas).getByRole("radio", { name: /传统模式/ })
    ).toBeChecked();
    await user.click(
      within(settingsCanvas).getByRole("radio", { name: /数字花园/ })
    );
    expect(
      within(settingsCanvas).getByRole("radio", { name: /数字花园/ })
    ).toBeChecked();
    expect(window.localStorage.getItem("annota:content-style")).toBe(
      "digital-garden"
    );
    expect(document.documentElement).toHaveAttribute(
      "data-content-style",
      "digital-garden"
    );
    expect(within(settingsCanvas).getByText("温室")).toBeInTheDocument();
    expect(within(settingsCanvas).getByText("生态圈")).toBeInTheDocument();
    await user.click(
      within(settingsCanvas).getByRole("radio", {
        name: "添加并使用自定义风格"
      })
    );
    const customNameInput = within(settingsCanvas).getByRole("textbox", {
      name: "自定义风格名称"
    });
    const customHomeInput = within(settingsCanvas).getByRole("textbox", {
      name: "自定义主页表述"
    });
    const customRecentInput = within(settingsCanvas).getByRole("textbox", {
      name: "自定义最近浏览表述"
    });
    const customNewNoteInput = within(settingsCanvas).getByRole("textbox", {
      name: "自定义新建文章表述"
    });
    await user.clear(customNameInput);
    await user.type(customNameInput, "专注模式");
    await user.clear(customHomeInput);
    await user.type(customHomeInput, "工作台");
    await user.clear(customRecentInput);
    await user.type(customRecentInput, "最近记录");
    await user.clear(customNewNoteInput);
    await user.type(customNewNoteInput, "写新内容");
    expect(window.localStorage.getItem("annota:content-style")).toBe("custom");
    expect(
      JSON.parse(
        window.localStorage.getItem("annota:custom-content-style") ?? "{}"
      )
    ).toMatchObject({
      name: "专注模式",
      terms: {
        home: "工作台",
        recent: "最近记录",
        newNote: "写新内容"
      }
    });
    expect(settingsCanvas.querySelectorAll("[data-setting-slot]")).not.toHaveLength(0);
    settingsCanvas.querySelectorAll("[data-setting-slot]").forEach((slot) => {
      expect(slot).toBeEmptyDOMElement();
    });

    await user.click(
      within(settingsCanvas).getByRole("button", { name: "快捷键" })
    );
    expect(
      within(settingsCanvas).getByRole("heading", {
        level: 2,
        name: "快捷键"
      })
    ).toBeInTheDocument();
    [
      "打开全局搜索",
      "保存当前文章",
      "返回父文章",
      "回到根文章",
      "打开或关闭拓扑",
      "切换拓扑聚焦",
      "固定或取消固定拓扑"
    ].forEach((shortcut) => {
      expect(within(settingsCanvas).getByText(shortcut)).toBeInTheDocument();
    });
    expect(
      within(settingsCanvas).getByRole("button", { name: "恢复默认" })
    ).toBeInTheDocument();
    const topologyShortcut = within(settingsCanvas).getByRole("button", {
      name: "修改快捷键：打开或关闭拓扑"
    });
    await user.click(topologyShortcut);
    expect(topologyShortcut).toHaveAttribute("aria-pressed", "true");
    fireEvent.keyDown(topologyShortcut, { key: "g", ctrlKey: true });
    expect(topologyShortcut).toHaveTextContent("Ctrl + G");
    expect(
      JSON.parse(window.localStorage.getItem("annota:shortcuts") ?? "{}")
    ).toMatchObject({
      "toggle-topology": {
        key: "G",
        ctrl: true,
        alt: false,
        shift: false
      }
    });

    await user.click(
      within(settingsCanvas).getByRole("button", { name: "AI 模型服务" })
    );
    expect(
      within(settingsCanvas).getByRole("heading", {
        level: 2,
        name: "AI 模型服务"
      })
    ).toBeInTheDocument();
    expect(within(settingsCanvas).getByText("模型服务列表")).toBeInTheDocument();
    expect(
      within(settingsCanvas).getByRole("button", { name: "AI 模型服务" })
    ).toHaveAttribute("aria-current", "page");
    expect(
      within(settingsCanvas).getByRole("button", { name: "配置 Chat GPT" })
    ).toHaveAttribute("aria-current", "page");
    expect(container.querySelector(".model-provider-status")).not.toBeInTheDocument();
    expect(
      within(settingsCanvas).queryByRole("textbox", { name: "Base URL" })
    ).not.toBeInTheDocument();
    expect(
      within(settingsCanvas).queryByRole("textbox", {
        name: "模型列表地址"
      })
    ).not.toBeInTheDocument();
    expect(
      within(settingsCanvas).queryByRole("textbox", { name: "请求路径" })
    ).not.toBeInTheDocument();
    expect(
      within(settingsCanvas).queryByRole("combobox", { name: "使用模型" })
    ).not.toBeInTheDocument();
    expect(
      within(settingsCanvas).getByRole("group", { name: "Chat GPT 模型选择" })
    ).toBeInTheDocument();
    const enabledModels = within(settingsCanvas).getByRole("region", {
      name: "已启用模型"
    });
    const disabledModels = within(settingsCanvas).getByRole("region", {
      name: "未启用模型"
    });
    expect(within(enabledModels).getByText("尚未启用模型")).toBeInTheDocument();
    expect(
      within(disabledModels).getAllByRole("button", { name: /启用模型/ }).length
    ).toBeGreaterThan(0);
    expect(
      within(settingsCanvas).queryByRole("button", {
        name: "添加自定义服务商"
      })
    ).not.toBeInTheDocument();
    const chatGptSwitch = within(settingsCanvas).getByRole("checkbox", {
      name: "关闭 Chat GPT"
    });
    expect(chatGptSwitch).toBeChecked();
    await user.click(chatGptSwitch);
    const closedChatGptSwitch = within(settingsCanvas).getByRole("checkbox", {
      name: "开启 Chat GPT"
    });
    expect(closedChatGptSwitch).not.toBeChecked();
    await user.click(closedChatGptSwitch);
    expect(
      within(settingsCanvas).getByRole("checkbox", { name: "关闭 Chat GPT" })
    ).toBeChecked();
    const connectionTest = within(settingsCanvas).getByRole("button", {
      name: "测试连接"
    });
    expect(connectionTest).toBeDisabled();

    await user.type(
      within(settingsCanvas).getByLabelText("API Key"),
      "sk-test"
    );
    expect(connectionTest).toBeEnabled();
    await user.click(connectionTest);
    expect(
      await within(settingsCanvas).findByRole("button", {
        name: "连接正常：已连接，发现 3 个可用模型"
      })
    ).toBeEnabled();
    expect(globalThis.fetch).toHaveBeenCalledWith(
      "https://api.openai.com/v1/models",
      expect.objectContaining({ headers: expect.any(Headers) })
    );
    expect(
      within(enabledModels).getByText("尚未启用模型")
    ).toBeInTheDocument();
    await user.click(
      within(settingsCanvas).getByRole("button", { name: "全选" })
    );
    expect(
      within(enabledModels).getAllByRole("button", { name: /停用模型/ })
    ).toHaveLength(3);
    await user.click(
      within(settingsCanvas).getByRole("button", { name: "全不选" })
    );
    const gptMiniToggle = within(settingsCanvas).getByRole("button", {
      name: "启用模型 gpt-5-mini"
    });
    const gpt51Toggle = within(settingsCanvas).getByRole("button", {
      name: "启用模型 gpt-5.1"
    });
    await user.click(gptMiniToggle);
    await user.click(gpt51Toggle);
    expect(
      JSON.parse(
        window.localStorage.getItem(MODEL_PROVIDERS_STORAGE_KEY) ?? "[]"
      )
    ).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          id: "chatgpt",
          apiKey: "sk-test",
          model: "gpt-5-mini",
          availableModels: ["gpt-4.1", "gpt-5-mini", "gpt-5.1"],
          enabledModels: ["gpt-5-mini", "gpt-5.1"]
        })
      ])
    );
    expect(container.querySelector(".model-provider-brand-icon.is-zhipu"))
      .toBeInTheDocument();

    ["Chat GPT", "Gemini", "Kimi", "Deepseek", "Claude", "GLM"].forEach(
      (provider) => {
        expect(
          within(settingsCanvas).getByRole("button", {
            name: `配置 ${provider}`
          })
        ).toBeInTheDocument();
      }
    );

    await user.click(
      within(settingsCanvas).getByRole("button", { name: "配置 Deepseek" })
    );
    expect(
      within(settingsCanvas).getByRole("heading", {
        level: 3,
        name: "Deepseek"
      })
    ).toBeInTheDocument();
    expect(
      within(settingsCanvas).getByLabelText("API Key")
    ).toHaveValue("");
    expect(container.querySelector(".home-app")).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "工作台" }));
    expect(container.querySelector("#recent-title")).toHaveTextContent("最近记录");
    expect(screen.getByRole("button", { name: "写新内容" })).toBeInTheDocument();
    await openFirstNotebook(user);
    const topologyPanel = screen.getByRole("complementary", {
      name: "当前知识树拓扑"
    });
    fireEvent.keyDown(window, { key: "g", ctrlKey: true });
    expect(topologyPanel.parentElement).toHaveClass("is-fullscreen");
  });

  it("keeps the model API key after leaving and reopening settings", async () => {
    const user = userEvent.setup();
    renderApp();

    await user.click(screen.getByRole("button", { name: "打开设置" }));
    let settingsCanvas = screen.getByRole("region", { name: "设置内容" });
    await user.click(
      within(settingsCanvas).getByRole("button", { name: "AI 模型服务" })
    );

    await user.type(
      within(settingsCanvas).getByLabelText("API Key"),
      "sk-persisted"
    );
    expect(
      JSON.parse(
        window.localStorage.getItem(MODEL_PROVIDERS_STORAGE_KEY) ?? "[]"
      )
    ).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          id: "chatgpt",
          apiKey: "sk-persisted"
        })
      ])
    );

    await user.click(screen.getByRole("button", { name: "主页" }));
    expect(
      screen.queryByRole("region", { name: "设置内容" })
    ).not.toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "打开设置" }));
    settingsCanvas = screen.getByRole("region", { name: "设置内容" });
    await user.click(
      within(settingsCanvas).getByRole("button", { name: "AI 模型服务" })
    );
    expect(within(settingsCanvas).getByLabelText("API Key")).toHaveValue(
      "sk-persisted"
    );
  });
});

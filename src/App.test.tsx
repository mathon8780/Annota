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

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

function seedStoredAppData(data = seedData) {
  window.localStorage.clear();
  clearBrowserMarkdownDocuments();
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

async function openFirstNotebook(user: ReturnType<typeof userEvent.setup>) {
  const notebook = seedData.notebooks[0];
  await user.click(
    screen.getByRole("button", { name: `打开文章：${seedData.articles[notebook.rootId].title}` })
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

    await user.click(
      within(generationPage).getByRole("tab", { name: "检查" })
    );

    expect(
      within(generationPage).getByText(
        "包含未知变量，请修正提示词模板。"
      )
    ).toBeInTheDocument();
    expect(
      within(generationPage).queryByText("保存为新版本")
    ).not.toBeInTheDocument();
  });

  it("opens a recent notebook in the reader and returns home", async () => {
    const user = userEvent.setup();
    renderApp();
    expect(screen.getByRole("heading", { name: "继续生长你的知识树" })).toBeInTheDocument();
    await openFirstNotebook(user);
    expect(
      screen.getByRole("heading", { name: "ECS 架构：从数据布局到系统调度" })
    ).toBeInTheDocument();
    const childrenPanel = screen.getByRole("complementary", { name: "下一级子文章" });
    await user.click(within(childrenPanel).getByRole("button", { name: /Component 为什么应该保持纯数据/ }));
    expect(screen.getByRole("heading", { name: /Component 为什么应该保持纯数据/ })).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "返回主页" }));
    expect(screen.getByRole("heading", { name: "继续生长你的知识树" })).toBeInTheDocument();
  });

  it("creates a collection and its first article", async () => {
    window.localStorage.clear();
    const user = userEvent.setup();
    renderApp(false);
    await user.click(screen.getAllByRole("button", { name: "新建集合" })[0]);
    await user.type(screen.getByRole("textbox", { name: "集合名称" }), "测试集合");
    await user.click(screen.getByRole("button", { name: "创建集合" }));
    expect(await screen.findByRole("heading", { name: "测试集合" })).toBeInTheDocument();
  });

  it("imports a Markdown file as a readable article", async () => {
    window.localStorage.clear();
    const { container } = renderApp(false);
    const file = new File(["# 导入正文\n内容"], "导入笔记.md", { type: "text/markdown" });
    Object.defineProperty(file, "text", { value: async () => "# 导入正文\n内容" });
    fireEvent.change(container.querySelector('input[type="file"]')!, { target: { files: [file] } });
    expect(await screen.findByRole("heading", { name: "导入笔记" })).toBeInTheDocument();
    expect(markdownEditorView().state.doc.toString()).toContain("# 导入正文");
  });

  it("filters knowledge point articles on the home page", async () => {
    const user = userEvent.setup();
    renderApp();

    const input = screen.getByPlaceholderText("筛选文章");
    await user.type(input, "Neo4j");

    expect(screen.getByRole("button", { name: /打开文章：图数据库 Neo4j/ })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /打开文章：ECS 架构/ })).not.toBeInTheDocument();
  });

  it("collects articles into a collection from the collections view", async () => {
    const user = userEvent.setup();
    renderApp();
    const sidebar = screen.getByRole("complementary", { name: "主页导航" });
    await user.click(within(sidebar).getByRole("button", { name: "集合" }));

    expect(screen.getByRole("heading", { name: "集合" })).toBeInTheDocument();
    const collectButtons = screen.getAllByRole("button", { name: "收集文章" });
    expect(collectButtons.length).toBeGreaterThan(0);
    await user.click(collectButtons[0]);
    const dialog = screen.getByRole("dialog", { name: "收集文章" });
    const option = within(dialog)
      .getAllByRole("checkbox")
      .find((box) => !(box as HTMLInputElement).disabled);
    expect(option).toBeTruthy();
    await user.click(option!);
    await user.click(within(dialog).getByRole("button", { name: "加入集合" }));

    expect(screen.queryByRole("dialog", { name: "收集文章" })).toBeNull();
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

import { fireEvent, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import App from "./App";
import { AppStoreProvider } from "./store/AppStore";

function renderApp() {
  window.localStorage.clear();
  return render(
    <AppStoreProvider>
      <App />
    </AppStoreProvider>
  );
}

function dispatchPointer(target: Element, type: string, pointerId: number, clientX: number) {
  const event = new Event(type, { bubbles: true, cancelable: true });
  Object.defineProperties(event, {
    pointerId: { value: pointerId },
    clientX: { value: clientX }
  });
  fireEvent(target, event);
}

describe("Annota core flow", () => {
  it("opens a recent notebook in the reader and returns home", async () => {
    const user = userEvent.setup();
    const { container } = renderApp();

    expect(screen.getByRole("heading", { name: "继续生长你的知识树" })).toBeInTheDocument();
    expect(screen.getByRole("banner", { name: "Annota 窗口标题栏" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "最小化窗口" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "最大化窗口" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "关闭窗口" })).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: /打开笔记：ECS 架构/ }));

    expect(
      screen.getByRole("heading", { name: "ECS 架构：从数据布局到系统调度" })
    ).toBeInTheDocument();
    expect(screen.getByText("下一级子文章")).toBeInTheDocument();
    expect(container.querySelector(".route-stage")).not.toHaveAttribute("data-motion");
    expect(container.querySelector(".article-column")).toHaveAttribute("data-motion", "settle");
    expect(container.querySelector(".reader-breadcrumbs")).not.toBeInTheDocument();
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
    renderApp();
    await user.click(screen.getByRole("button", { name: /打开笔记：ECS 架构/ }));

    await user.click(
      screen.getByText(
        "ECS 将对象拆成实体标识、纯数据组件与批量处理数据的系统。它不是简单地把类拆成三个目录，而是重新安排数据在内存中的组织方式与处理顺序。"
      )
    );

    const editor = screen.getByLabelText("编辑正文块") as HTMLTextAreaElement;
    editor.setSelectionRange(0, 12);
    fireEvent.select(editor);

    const explain = screen.getByTitle("解释选中文字");
    expect(explain).toBeEnabled();
    await user.click(explain);
    expect(screen.getByText("正在解释选区")).toBeInTheDocument();
  });
});

import { useMemo, useRef, useState } from "react";
import {
  ArrowDownUp,
  BookOpenText,
  Boxes,
  Clock3,
  FileInput,
  FolderTree,
  History,
  Import,
  LibraryBig,
  Network,
  Plus,
  Search,
  Settings2,
  Sparkles,
  X
} from "lucide-react";
import { useAppStore } from "../store/AppStore";
import type { Notebook } from "../types";

interface HomePageProps {
  onOpenSearch: () => void;
  onOpenSettings: () => void;
}

function countDescendants(rootId: string, articles: ReturnType<typeof useAppStore>["data"]["articles"]) {
  const seen = new Set<string>();
  const walk = (id: string) => {
    const article = articles[id];
    if (!article) return;
    article.childIds.forEach((childId) => {
      if (!seen.has(childId)) {
        seen.add(childId);
        walk(childId);
      }
    });
  };
  walk(rootId);
  return seen.size;
}

function formatDate(value: string) {
  const date = new Date(value);
  const today = new Date();
  const diff = Math.max(0, today.getTime() - date.getTime());
  const days = Math.floor(diff / 86_400_000);
  if (days === 0) return "今天";
  if (days === 1) return "昨天";
  return date.toLocaleDateString("zh-CN", { month: "short", day: "numeric" });
}

export function HomePage({ onOpenSearch, onOpenSettings }: HomePageProps) {
  const { data, openNotebook, createNotebook, importPackage, resetDemo } = useAppStore();
  const [sortBy, setSortBy] = useState<"time" | "connections">("time");
  const [filter, setFilter] = useState("");
  const [newTitle, setNewTitle] = useState("");
  const [notice, setNotice] = useState("数据仅保存在这台设备上");
  const fileRef = useRef<HTMLInputElement>(null);
  const newDialogRef = useRef<HTMLDialogElement>(null);

  const notebooks = useMemo(() => {
    const query = filter.trim().toLocaleLowerCase("zh-CN");
    const filtered = data.notebooks.filter((notebook) =>
      [notebook.title, notebook.summary, notebook.category, notebook.tags.join(" ")]
        .join(" ")
        .toLocaleLowerCase("zh-CN")
        .includes(query)
    );
    return [...filtered].sort((left, right) => {
      if (sortBy === "connections") {
        return (
          countDescendants(right.rootId, data.articles) -
          countDescendants(left.rootId, data.articles)
        );
      }
      return new Date(right.updatedAt).getTime() - new Date(left.updatedAt).getTime();
    });
  }, [data.articles, data.notebooks, filter, sortBy]);

  const totalNodes = Object.keys(data.articles).length;
  const totalTags = new Set(data.notebooks.flatMap((notebook) => notebook.tags)).size;

  const handleCreate = () => {
    const title = newTitle.trim() || "未命名笔记";
    createNotebook(title);
    setNewTitle("");
    newDialogRef.current?.close();
  };

  const handleFile = async (file?: File) => {
    if (!file) return;
    const text = await file.text();
    const result = importPackage(text, file.name);
    setNotice(result.message);
    if (fileRef.current) fileRef.current.value = "";
  };

  const sidebarActions = [
    { icon: LibraryBig, label: "花园概览", active: true },
    { icon: Network, label: "拓扑导航" },
    { icon: History, label: "阅读足迹" }
  ];

  return (
    <div className="home-app">
      <main className="home-workspace">
        <aside className="home-sidebar" aria-label="主页导航">
          <nav>
            {sidebarActions.map(({ icon: Icon, label, active }) => (
              <button
                key={label}
                className={`home-nav-item${active ? " is-active" : ""}`}
                type="button"
                onClick={() =>
                  !active &&
                  setNotice(
                    label === "拓扑导航"
                      ? "请先打开一篇笔记，再从右下角展开或全屏查看拓扑。"
                      : "最近打开的主笔记已按时间显示在当前看板。"
                  )
                }
              >
                <Icon aria-hidden="true" size={17} />
                <span>{label}</span>
              </button>
            ))}
          </nav>

          <div className="sidebar-section-title">知识维度</div>
          <div className="dimension-list">
            {[
              ["技术学习", "08"],
              ["概念解析", "05"],
              ["阅读方法", "03"]
            ].map(([label, count]) => (
              <button key={label} type="button" onClick={() => setFilter(label)}>
                <span>{label}</span>
                <small>{count}</small>
              </button>
            ))}
          </div>

          <div className="home-sidebar-footer">
            <button type="button" onClick={() => fileRef.current?.click()}>
              <Import aria-hidden="true" size={16} />
              导入材料
            </button>
            <button type="button" onClick={resetDemo}>
              <Clock3 aria-hidden="true" size={16} />
              重置演示数据
            </button>
            <button type="button" aria-label="打开设置" onClick={onOpenSettings}>
              <Settings2 aria-hidden="true" size={16} />
              设置
            </button>
          </div>
        </aside>

        <div className="home-content">
          <header className="home-topbar">
            <button className="global-search-trigger" type="button" onClick={onOpenSearch}>
              <Search aria-hidden="true" size={17} />
              <span>搜索标题、正文与标签</span>
              <kbd>Ctrl K</kbd>
            </button>
            <div className="home-top-actions">
              <span className="local-status">
                <span aria-hidden="true"></span>
                本地工作区
              </span>
            </div>
          </header>

          <section className="home-main">
          <div className="home-intro">
            <div>
              <p className="context-line">周日，7 月 26 日</p>
              <h1>继续生长你的知识树</h1>
              <p>
                从最近阅读处继续，或导入一份材料开始新的学习路径。每次解释与翻译都会保留来源。
              </p>
            </div>
            <div className="home-primary-actions">
              <button
                className="button primary"
                type="button"
                onClick={() => newDialogRef.current?.showModal()}
              >
                <Plus aria-hidden="true" size={17} />
                新建笔记
              </button>
              <button className="button secondary" type="button" onClick={() => fileRef.current?.click()}>
                <FileInput aria-hidden="true" size={17} />
                导入材料
              </button>
              <input
                ref={fileRef}
                hidden
                type="file"
                accept=".md,.markdown,.txt,.annota,.json,text/plain,text/markdown,application/json"
                onChange={(event) => void handleFile(event.target.files?.[0])}
              />
            </div>
          </div>

          <div className="home-ledger" aria-label="知识库概况">
            <div>
              <BookOpenText aria-hidden="true" size={17} />
              <span>
                <strong>{data.notebooks.length}</strong>
                主笔记
              </span>
            </div>
            <div>
              <FolderTree aria-hidden="true" size={17} />
              <span>
                <strong>{totalNodes}</strong>
                全部节点
              </span>
            </div>
            <div>
              <Boxes aria-hidden="true" size={17} />
              <span>
                <strong>{totalTags}</strong>
                知识标签
              </span>
            </div>
            <div className="ledger-note">
              <span aria-hidden="true"></span>
              {notice}
            </div>
          </div>

          <div className="planned-ai" aria-disabled="true">
            <Sparkles aria-hidden="true" size={17} />
            <span>从一个问题开始构建节点</span>
            <small>规划中 · 请在正文选区后使用解释或翻译</small>
          </div>

          <section className="recent-section" aria-labelledby="recent-title">
            <header className="recent-header">
              <div>
                <h2 id="recent-title">最近笔记</h2>
                <span>主笔记按最近打开或修改排序</span>
              </div>
              <div className="recent-tools">
                <label className="inline-filter">
                  <Search aria-hidden="true" size={15} />
                  <span className="sr-only">筛选最近笔记</span>
                  <input
                    value={filter}
                    onChange={(event) => setFilter(event.target.value)}
                    placeholder="筛选当前卡片"
                  />
                  {filter && (
                    <button type="button" onClick={() => setFilter("")} aria-label="清除筛选">
                      <X aria-hidden="true" size={14} />
                    </button>
                  )}
                </label>
                <button
                  className="sort-button"
                  type="button"
                  onClick={() => setSortBy((value) => (value === "time" ? "connections" : "time"))}
                >
                  <ArrowDownUp aria-hidden="true" size={15} />
                  {sortBy === "time" ? "按时间" : "按连接"}
                </button>
              </div>
            </header>

            {notebooks.length ? (
              <div className="notebook-grid">
                {notebooks.map((notebook) => (
                  <NotebookCard
                    key={notebook.id}
                    notebook={notebook}
                    descendants={countDescendants(notebook.rootId, data.articles)}
                    onOpen={() => openNotebook(notebook.id)}
                  />
                ))}
              </div>
            ) : (
              <div className="home-empty">
                <Search aria-hidden="true" size={22} />
                <strong>没有符合筛选条件的主笔记</strong>
                <span>清除筛选，或导入一份新的 Markdown / TXT 材料。</span>
                <button className="button secondary" type="button" onClick={() => setFilter("")}>
                  清除筛选
                </button>
              </div>
            )}
            </section>
          </section>
        </div>
      </main>

      <dialog
        ref={newDialogRef}
        className="form-dialog"
        aria-labelledby="new-note-title"
        onClick={(event) => {
          if (event.target === newDialogRef.current) newDialogRef.current?.close();
        }}
      >
        <form
          method="dialog"
          onSubmit={(event) => {
            event.preventDefault();
            handleCreate();
          }}
        >
          <header>
            <div>
              <h2 id="new-note-title">新建主笔记</h2>
              <p>创建一棵新的知识树，稍后可在正文中继续编辑。</p>
            </div>
            <button className="icon-button" type="button" onClick={() => newDialogRef.current?.close()}>
              <X aria-hidden="true" size={17} />
              <span className="sr-only">关闭</span>
            </button>
          </header>
          <label htmlFor="new-note-name">笔记标题</label>
          <input
            id="new-note-name"
            value={newTitle}
            onChange={(event) => setNewTitle(event.target.value)}
            placeholder="例如：ECS 架构学习笔记"
            autoFocus
          />
          <small>标题可稍后修改；正文会自动保存在本机。</small>
          <footer>
            <button className="button secondary" type="button" onClick={() => newDialogRef.current?.close()}>
              取消
            </button>
            <button className="button primary" type="submit" disabled={!newTitle.trim()}>
              创建并打开
            </button>
          </footer>
        </form>
      </dialog>
    </div>
  );
}

function NotebookCard({
  notebook,
  descendants,
  onOpen
}: {
  notebook: Notebook;
  descendants: number;
  onOpen: () => void;
}) {
  return (
    <button
      className="notebook-card"
      data-accent={notebook.accent}
      type="button"
      onClick={onOpen}
      aria-label={`打开笔记：${notebook.title}`}
    >
      <span className="card-rail" aria-hidden="true"></span>
      <span className="notebook-meta">
        <span>{formatDate(notebook.updatedAt)}</span>
        <span>{notebook.category}</span>
      </span>
      <strong>{notebook.title}</strong>
      <span className="notebook-summary">{notebook.summary}</span>
      <span className="notebook-footer">
        <span className="connection-count">
          <FolderTree aria-hidden="true" size={14} />
          {descendants ? `${descendants} 个衍生节点` : "尚无子节点"}
        </span>
        <span className="notebook-tags">
          {notebook.tags.slice(0, 2).map((tag) => (
            <small key={tag}>#{tag}</small>
          ))}
        </span>
      </span>
    </button>
  );
}

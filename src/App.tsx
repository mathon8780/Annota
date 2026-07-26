import { useEffect, useMemo, useRef, useState } from "react";
import { BookOpenText, CornerDownLeft, Search, X } from "lucide-react";
import { HomePage } from "./components/HomePage";
import { ReaderPage } from "./components/ReaderPage";
import { SettingsPage } from "./components/SettingsPage";
import { WindowTitleBar } from "./components/WindowTitleBar";
import { useAppStore } from "./store/AppStore";

export default function App() {
  const { data, currentArticle, openNotebook } = useAppStore();
  const [commandOpen, setCommandOpen] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [query, setQuery] = useState("");
  const commandRef = useRef<HTMLDialogElement>(null);

  const results = useMemo(() => {
    const normalized = query.trim().toLocaleLowerCase("zh-CN");
    const values = Object.values(data.articles);
    if (!normalized) return values.slice(0, 8);
    return values
      .filter((article) =>
        [article.title, article.summary, article.tags.join(" "), article.blocks.map((b) => b.text).join(" ")]
          .join(" ")
          .toLocaleLowerCase("zh-CN")
          .includes(normalized)
      )
      .slice(0, 12);
  }, [data.articles, query]);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.ctrlKey && event.key.toLocaleLowerCase() === "k") {
        event.preventDefault();
        setCommandOpen(true);
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, []);

  useEffect(() => {
    const dialog = commandRef.current;
    if (!dialog) return;
    if (commandOpen && !dialog.open) {
      dialog.showModal();
      window.setTimeout(() => dialog.querySelector<HTMLInputElement>("input")?.focus(), 0);
    }
    if (!commandOpen && dialog.open) dialog.close();
  }, [commandOpen]);

  const openResult = (rootId: string, articleId: string) => {
    const notebook = data.notebooks.find((item) => item.rootId === rootId);
    if (!notebook) return;
    openNotebook(notebook.id, articleId);
    setSettingsOpen(false);
    setCommandOpen(false);
    setQuery("");
  };

  return (
    <div className="desktop-shell">
      <WindowTitleBar pageTitle={settingsOpen ? "设置" : currentArticle?.title} />
      <div className="desktop-content">
        <div className="route-stage">
          {settingsOpen ? (
            <SettingsPage onBack={() => setSettingsOpen(false)} />
          ) : currentArticle ? (
            <ReaderPage />
          ) : (
            <HomePage
              onOpenSearch={() => setCommandOpen(true)}
              onOpenSettings={() => setSettingsOpen(true)}
            />
          )}
        </div>
      </div>

      <dialog
        ref={commandRef}
        className="command-dialog"
        aria-labelledby="command-title"
        onClose={() => setCommandOpen(false)}
        onCancel={(event) => {
          event.preventDefault();
          setCommandOpen(false);
        }}
        onClick={(event) => {
          if (event.target === commandRef.current) setCommandOpen(false);
        }}
      >
        <div className="command-panel">
          <header className="command-search">
            <Search aria-hidden="true" size={18} />
            <label className="sr-only" htmlFor="global-search">
              搜索全部笔记与子文章
            </label>
            <input
              id="global-search"
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="搜索标题、正文、标签…"
            />
            <kbd>Esc</kbd>
            <button className="icon-button compact" type="button" onClick={() => setCommandOpen(false)}>
              <X aria-hidden="true" size={16} />
              <span className="sr-only">关闭搜索</span>
            </button>
          </header>
          <div className="command-heading" id="command-title">
            {query ? `${results.length} 个结果` : "最近的节点"}
          </div>
          <div className="command-results" role="listbox">
            {results.length ? (
              results.map((article) => (
                <button
                  key={article.id}
                  className="command-result"
                  type="button"
                  onClick={() => openResult(article.rootId, article.id)}
                >
                  <span className="command-result-icon">
                    <BookOpenText aria-hidden="true" size={17} />
                  </span>
                  <span>
                    <strong>{article.title}</strong>
                    <small>
                      {article.type} · {article.tags.slice(0, 2).join(" / ")}
                    </small>
                  </span>
                  <CornerDownLeft aria-hidden="true" size={15} />
                </button>
              ))
            ) : (
              <div className="command-empty">
                <Search aria-hidden="true" size={22} />
                <strong>没有找到匹配内容</strong>
                <span>换一个关键词，或检查是否只输入了标点。</span>
              </div>
            )}
          </div>
        </div>
      </dialog>
    </div>
  );
}

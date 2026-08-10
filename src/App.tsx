import { useEffect, useMemo, useRef, useState } from "react";
import { BookOpenText, CornerDownLeft, Search, X } from "lucide-react";
import { HomePage } from "./components/HomePage";
import { ReaderPage } from "./components/ReaderPage";
import { WindowTitleBar } from "./components/WindowTitleBar";
import {
  loadMarkdownSearchText,
  pruneMarkdownSearchDocuments,
  subscribeMarkdownSearchDocuments
} from "./editor/markdownRepository";
import { useAppStore } from "./store/AppStore";
import {
  applyContentStyle,
  contentStyleDefinition,
  loadCustomContentStyle,
  loadContentStyle,
  saveCustomContentStyle,
  saveContentStyle
} from "./utils/contentDisplay";
import type {
  ContentStyleId,
  CustomContentStyle
} from "./utils/contentDisplay";
import {
  defaultShortcutPreferences,
  loadShortcutPreferences,
  matchesShortcut,
  saveShortcutPreferences
} from "./utils/shortcuts";
import type {
  ShortcutActionId,
  ShortcutBinding
} from "./utils/shortcuts";
import {
  applyAppTheme,
  loadAppTheme,
  saveAppTheme
} from "./utils/themePreferences";
import type { AppThemeId } from "./utils/themePreferences";
import {
  loadReadingPathMode,
  saveReadingPathMode
} from "./utils/readingPathPreferences";
import type { ReadingPathMode } from "./utils/readingPathPreferences";

export default function App() {
  const { data, currentArticle, openNotebook } = useAppStore();
  const [commandOpen, setCommandOpen] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [searchDocuments, setSearchDocuments] = useState<Record<string, string>>({});
  const [contentStyle, setContentStyle] = useState(loadContentStyle);
  const [customContentStyle, setCustomContentStyle] = useState(
    loadCustomContentStyle
  );
  const [appTheme, setAppTheme] = useState(loadAppTheme);
  const [readingPathMode, setReadingPathMode] = useState(loadReadingPathMode);
  const [shortcuts, setShortcuts] = useState(loadShortcutPreferences);
  const commandRef = useRef<HTMLDialogElement>(null);
  const contentTerms = contentStyleDefinition(
    contentStyle,
    customContentStyle
  ).terms;
  const articleIds = Object.keys(data.articles);
  const articleIdSignature = articleIds.join("\0");
  const searchableArticles = useMemo(
    () =>
      Object.values(data.articles).map((article) => ({
        article,
        text: [
          article.title,
          article.summary,
          searchDocuments[article.id] ?? ""
        ]
          .join(" ")
          .toLocaleLowerCase("zh-CN")
      })),
    [data.articles, searchDocuments]
  );

  const results = useMemo(() => {
    const normalized = query.trim().toLocaleLowerCase("zh-CN");
    if (!normalized) {
      return searchableArticles.slice(0, 8).map(({ article }) => article);
    }
    return searchableArticles
      .filter(({ text }) => text.includes(normalized))
      .slice(0, 12)
      .map(({ article }) => article);
  }, [query, searchableArticles]);

  useEffect(() => {
    pruneMarkdownSearchDocuments(articleIds);
    if (!commandOpen) return;
    let active = true;
    const includedArticleIds = new Set(articleIds);
    const unsubscribe = subscribeMarkdownSearchDocuments((documentId, text) => {
      if (!includedArticleIds.has(documentId)) return;
      setSearchDocuments((current) =>
        current[documentId] === text
          ? current
          : { ...current, [documentId]: text }
      );
    });
    void Promise.all(
      articleIds.map(async (id) => [id, await loadMarkdownSearchText(id)] as const)
    ).then((entries) => {
      if (!active) return;
      const next = Object.fromEntries(entries);
      setSearchDocuments((current) => {
        const currentIds = Object.keys(current);
        return currentIds.length === entries.length &&
          currentIds.every((id) => current[id] === next[id])
          ? current
          : next;
      });
    }).catch(() => {
      if (active) setSearchDocuments({});
    });
    return () => {
      active = false;
      unsubscribe();
    };
  }, [articleIdSignature, commandOpen]);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (matchesShortcut(event, shortcuts["open-search"])) {
        event.preventDefault();
        setCommandOpen(true);
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [shortcuts]);

  useEffect(() => {
    applyContentStyle(contentStyle);
  }, [contentStyle]);

  useEffect(() => {
    applyAppTheme(appTheme);
  }, [appTheme]);

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

  const changeContentStyle = (nextStyle: ContentStyleId) => {
    setContentStyle(nextStyle);
    saveContentStyle(nextStyle);
  };

  const changeCustomContentStyle = (nextStyle: CustomContentStyle) => {
    setCustomContentStyle(nextStyle);
    saveCustomContentStyle(nextStyle);
  };

  const changeAppTheme = (nextTheme: AppThemeId) => {
    setAppTheme(nextTheme);
    saveAppTheme(nextTheme);
  };

  const changeReadingPathMode = (nextMode: ReadingPathMode) => {
    setReadingPathMode(nextMode);
    saveReadingPathMode(nextMode);
  };

  const changeShortcut = (
    actionId: ShortcutActionId,
    binding: ShortcutBinding
  ) => {
    setShortcuts((current) => {
      const next = { ...current, [actionId]: binding };
      saveShortcutPreferences(next);
      return next;
    });
  };

  const resetShortcuts = () => {
    const next = defaultShortcutPreferences();
    setShortcuts(next);
    saveShortcutPreferences(next);
  };

  return (
    <div className="desktop-shell">
      <WindowTitleBar pageTitle={settingsOpen ? "设置" : currentArticle?.title} />
      <div className="desktop-content">
        <div className="route-stage">
          {currentArticle ? (
            <ReaderPage
              readingPathMode={readingPathMode}
              shortcuts={shortcuts}
              terms={contentTerms}
            />
          ) : (
            <HomePage
              appTheme={appTheme}
              contentStyle={contentStyle}
              customContentStyle={customContentStyle}
              readingPathMode={readingPathMode}
              shortcuts={shortcuts}
              terms={contentTerms}
              settingsOpen={settingsOpen}
              onContentStyleChange={changeContentStyle}
              onCustomContentStyleChange={changeCustomContentStyle}
              onAppThemeChange={changeAppTheme}
              onReadingPathModeChange={changeReadingPathMode}
              onShortcutChange={changeShortcut}
              onResetShortcuts={resetShortcuts}
              onOpenSearch={() => setCommandOpen(true)}
              onOpenSettings={() => setSettingsOpen(true)}
              onCloseSettings={() => setSettingsOpen(false)}
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
              搜索全部笔记与{contentTerms.subNotes}
            </label>
            <input
              id="global-search"
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="搜索标题与正文…"
            />
            <kbd>Esc</kbd>
            <button className="icon-button compact" type="button" onClick={() => setCommandOpen(false)}>
              <X aria-hidden="true" size={16} />
              <span className="sr-only">关闭搜索</span>
            </button>
          </header>
          <div className="command-heading" id="command-title">
            {query ? `${results.length} 个结果` : contentTerms.recent}
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
                      {article.type}
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

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { CSSProperties, KeyboardEvent as ReactKeyboardEvent, PointerEvent as ReactPointerEvent } from "react";
import {
  ArrowLeft,
  BookOpenText,
  Check,
  CircleStop,
  Download,
  FileInput,
  Home,
  Languages,
  LoaderCircle,
  MessageSquareText,
  Network,
  Save,
  Sparkles
} from "lucide-react";
import { useAppStore } from "../store/AppStore";
import type {
  ArticleNode,
  GenerationType,
  InlineFormatCommand,
  InlineMarkType,
  SelectionState
} from "../types";
import { BlockEditor } from "./BlockEditor";
import { Brand } from "./Brand";
import { InlineFormattingToolbar } from "./InlineFormattingToolbar";
import { TopologyPanel } from "./TopologyPanel";

const READING_PATH_DEFAULT_WIDTH = 246;
const READING_PATH_MIN_WIDTH = 190;
const READING_PATH_MAX_WIDTH = 420;
const READING_PATH_STORAGE_KEY = "annota:reading-path-width";
type ArticleMotion = "settle" | "forward" | "back";

const READER_INTERACTIVE_TARGETS = [
  "button",
  "a",
  "input",
  "textarea",
  "select",
  "[contenteditable='true']",
  "[role='separator']",
  ".reading-block",
  ".document-editor",
  ".inline-formatting-toolbar"
].join(", ");

function clampReadingPathWidth(width: number) {
  return Math.min(READING_PATH_MAX_WIDTH, Math.max(READING_PATH_MIN_WIDTH, Math.round(width)));
}

function readStoredPathWidth() {
  const stored = Number(window.localStorage.getItem(READING_PATH_STORAGE_KEY));
  return Number.isFinite(stored) && stored > 0
    ? clampReadingPathWidth(stored)
    : READING_PATH_DEFAULT_WIDTH;
}

function descendants(id: string, articles: Record<string, ArticleNode>) {
  const seen = new Set<string>();
  const visit = (nodeId: string) => {
    articles[nodeId]?.childIds.forEach((childId) => {
      if (seen.has(childId)) return;
      seen.add(childId);
      visit(childId);
    });
  };
  visit(id);
  return seen.size;
}

export function ReaderPage() {
  const {
    data,
    currentArticle,
    currentNotebook,
    navigateTo,
    goHome,
    updateBlocks,
    importPackage,
    exportCurrentTree,
    startGeneration,
    cancelGeneration
  } = useAppStore();
  const [selection, setSelection] = useState<SelectionState | null>(null);
  const [formatCommand, setFormatCommand] = useState<InlineFormatCommand | null>(null);
  const [editorResetVersion, setEditorResetVersion] = useState(0);
  const [saveState, setSaveState] = useState("已保存到本机");
  const [fullTopology, setFullTopology] = useState(false);
  const [notice, setNotice] = useState("");
  const [readingPathWidth, setReadingPathWidth] = useState(readStoredPathWidth);
  const [resizingPath, setResizingPath] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);
  const noticeTimer = useRef<number>();
  const formatCommandSequence = useRef(0);
  const pathResizeRef = useRef<{
    pointerId: number;
    startX: number;
    startWidth: number;
  } | null>(null);
  const [articleTransition, setArticleTransition] = useState<{
    articleId: string | null;
    motion: ArticleMotion;
  }>(() => ({
    articleId: currentArticle?.id ?? null,
    motion: "settle"
  }));

  const path = useMemo(() => {
    if (!currentArticle) return [];
    const result: ArticleNode[] = [];
    let cursor: ArticleNode | undefined = currentArticle;
    while (cursor) {
      result.unshift(cursor);
      cursor = cursor.parentId ? data.articles[cursor.parentId] : undefined;
    }
    return result;
  }, [currentArticle, data.articles]);

  const childNodes = useMemo(
    () =>
      currentArticle
        ? currentArticle.childIds
            .map((id) => data.articles[id])
            .filter((item): item is ArticleNode => Boolean(item))
        : [],
    [currentArticle, data.articles]
  );

  const activeJobs = useMemo(
    () => data.jobs.filter((job) => job.parentId === currentArticle?.id),
    [currentArticle?.id, data.jobs]
  );

  let articleMotion = articleTransition.motion;
  if (currentArticle && currentArticle.id !== articleTransition.articleId) {
    articleMotion =
      articleTransition.articleId &&
      currentArticle.childIds.includes(articleTransition.articleId)
        ? "back"
        : articleTransition.articleId
          ? "forward"
          : "settle";
    setArticleTransition({
      articleId: currentArticle.id,
      motion: articleMotion
    });
  }

  const showNotice = useCallback((message: string) => {
    setNotice(message);
    window.clearTimeout(noticeTimer.current);
    noticeTimer.current = window.setTimeout(() => setNotice(""), 2600);
  }, []);

  useEffect(() => {
    setSelection(null);
    setFormatCommand(null);
    setSaveState("已保存到本机");
  }, [currentArticle?.id]);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      const target = event.target;
      const editing =
        target instanceof HTMLElement &&
        (target.matches("textarea, input") || target.isContentEditable);
      if (event.altKey && event.key === "ArrowLeft" && currentArticle?.parentId) {
        event.preventDefault();
        navigateTo(currentArticle.parentId);
      }
      if (event.ctrlKey && event.key.toLocaleLowerCase() === "g") {
        event.preventDefault();
        setFullTopology((value) => !value);
      }
      if (event.ctrlKey && event.key === "Home" && !editing && currentNotebook) {
        event.preventDefault();
        navigateTo(currentNotebook.rootId);
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [currentArticle?.parentId, currentNotebook, navigateTo]);

  if (!currentArticle || !currentNotebook) return null;

  const setAndStorePathWidth = (width: number) => {
    const nextWidth = clampReadingPathWidth(width);
    setReadingPathWidth(nextWidth);
    window.localStorage.setItem(READING_PATH_STORAGE_KEY, String(nextWidth));
  };

  const handlePathPointerDown = (event: ReactPointerEvent<HTMLDivElement>) => {
    event.preventDefault();
    event.currentTarget.setPointerCapture?.(event.pointerId);
    pathResizeRef.current = {
      pointerId: event.pointerId,
      startX: event.clientX,
      startWidth: readingPathWidth
    };
    setResizingPath(true);
  };

  const handlePathPointerMove = (event: ReactPointerEvent<HTMLDivElement>) => {
    const resize = pathResizeRef.current;
    if (!resize || resize.pointerId !== event.pointerId) return;
    setReadingPathWidth(clampReadingPathWidth(resize.startWidth + event.clientX - resize.startX));
  };

  const finishPathResize = (event: ReactPointerEvent<HTMLDivElement>) => {
    const resize = pathResizeRef.current;
    if (!resize || resize.pointerId !== event.pointerId) return;
    const finalWidth =
      event.type === "pointercancel"
        ? readingPathWidth
        : clampReadingPathWidth(resize.startWidth + event.clientX - resize.startX);
    pathResizeRef.current = null;
    setResizingPath(false);
    setReadingPathWidth(finalWidth);
    if (event.currentTarget.hasPointerCapture?.(event.pointerId)) {
      event.currentTarget.releasePointerCapture?.(event.pointerId);
    }
    window.localStorage.setItem(READING_PATH_STORAGE_KEY, String(finalWidth));
  };

  const handlePathKeyDown = (event: ReactKeyboardEvent<HTMLDivElement>) => {
    const step = event.shiftKey ? 24 : 8;
    if (event.key === "ArrowLeft") {
      event.preventDefault();
      setAndStorePathWidth(readingPathWidth - step);
    } else if (event.key === "ArrowRight") {
      event.preventDefault();
      setAndStorePathWidth(readingPathWidth + step);
    } else if (event.key === "Home") {
      event.preventDefault();
      setAndStorePathWidth(READING_PATH_MIN_WIDTH);
    } else if (event.key === "End") {
      event.preventDefault();
      setAndStorePathWidth(READING_PATH_MAX_WIDTH);
    }
  };

  const runGeneration = (type: GenerationType) => {
    if (!selection?.text) {
      showNotice("先在一个正文块内选择要处理的文字。");
      return;
    }
    startGeneration(currentArticle.id, selection.blockId, selection.text, type);
    showNotice(`${type === "translate" ? "翻译" : "解释"}任务已加入右侧列表。`);
    setSelection(null);
    window.getSelection()?.removeAllRanges();
  };

  const applyInlineFormat = (type: InlineMarkType, color?: string) => {
    if (!selection || selection.start === selection.end) {
      showNotice("先在正文中选择要设置格式的文字。");
      return;
    }
    formatCommandSequence.current += 1;
    setFormatCommand({
      id: formatCommandSequence.current,
      selection,
      type,
      color
    });
    setSaveState("保存中…");
  };

  const handleReaderSurfacePointerDown = (event: ReactPointerEvent<HTMLElement>) => {
    const target = event.target;
    if (!(target instanceof Element) || target.closest(READER_INTERACTIVE_TARGETS)) {
      return;
    }
    setSelection(null);
    setFormatCommand(null);
    setEditorResetVersion((version) => version + 1);
    window.getSelection()?.removeAllRanges();
  };

  const handleFile = async (file?: File) => {
    if (!file) return;
    const result = importPackage(await file.text(), file.name);
    showNotice(result.message);
    if (fileRef.current) fileRef.current.value = "";
  };

  return (
    <div
      className={`reader-app${resizingPath ? " is-resizing-path" : ""}`}
      style={{ "--reading-path-width": `${readingPathWidth}px` } as CSSProperties}
    >
      <header className="reader-topbar">
        <button className="reader-home-button" type="button" onClick={goHome} aria-label="返回主页">
          <Brand compact />
          <Home aria-hidden="true" size={16} />
        </button>

        <div className="reader-meta">
          <span className="type-badge">{currentArticle.type}</span>
          <span>第 {path.length} 层</span>
          <span>{childNodes.length} 个子文章</span>
        </div>

        <div className="generation-actions" aria-label="选区生成动作">
          <button
            className="generation-button"
            type="button"
            disabled={!selection}
            onClick={() => runGeneration("explain")}
            title={selection ? "解释选中文字" : "先选择正文文字"}
          >
            <MessageSquareText aria-hidden="true" size={16} />
            解释
          </button>
          <button
            className="generation-button"
            type="button"
            disabled={!selection}
            onClick={() => runGeneration("translate")}
            title={selection ? "翻译选中文字" : "先选择正文文字"}
          >
            <Languages aria-hidden="true" size={16} />
            翻译
          </button>
        </div>

        <div className="reader-actions">
          <span className="save-status">
            <Check aria-hidden="true" size={14} />
            {saveState}
          </span>
          <input
            ref={fileRef}
            hidden
            type="file"
            accept=".md,.markdown,.txt,.annota,.json,text/plain,text/markdown,application/json"
            onChange={(event) => void handleFile(event.target.files?.[0])}
          />
          <button className="icon-button" type="button" onClick={() => fileRef.current?.click()} title="导入材料">
            <FileInput aria-hidden="true" size={17} />
            <span className="sr-only">导入材料</span>
          </button>
          <button className="icon-button" type="button" onClick={exportCurrentTree} title="导出当前知识树">
            <Download aria-hidden="true" size={17} />
            <span className="sr-only">导出当前知识树</span>
          </button>
        </div>
      </header>

      <main className="reader-workspace">
        <aside className="reading-path" aria-label="阅读路径">
          <header>
            <span>阅读路径</span>
            <small>{path.length} 层</small>
          </header>
          <div className="path-stack">
            {path.map((article, index) => (
              <div className="path-step" key={article.id}>
                <button
                  className={article.id === currentArticle.id ? "is-current" : ""}
                  type="button"
                  onClick={() => navigateTo(article.id)}
                  aria-current={article.id === currentArticle.id ? "page" : undefined}
                >
                  <span className="path-step-index">{String(index + 1).padStart(2, "0")}</span>
                  <span>
                    <strong>{article.title}</strong>
                    <small>
                      {article.type} · {article.childIds.length} 个下级
                    </small>
                  </span>
                </button>
                {index < path.length - 1 && <span className="path-line" aria-hidden="true"></span>}
              </div>
            ))}
          </div>
          <div className="path-context">
            <BookOpenText aria-hidden="true" size={17} />
            <strong>{currentArticle.type}</strong>
            <p>当前节点来自这条阅读路径。编辑正文不会覆盖来源与父子关系。</p>
          </div>
          <div className="path-tags">
            {currentArticle.tags.map((tag) => (
              <span key={tag}>#{tag}</span>
            ))}
          </div>
        </aside>

        <div
          className="reading-path-resizer"
          role="separator"
          aria-label="调整阅读路径宽度"
          aria-orientation="vertical"
          aria-valuemin={READING_PATH_MIN_WIDTH}
          aria-valuemax={READING_PATH_MAX_WIDTH}
          aria-valuenow={readingPathWidth}
          tabIndex={0}
          onDoubleClick={() => setAndStorePathWidth(READING_PATH_DEFAULT_WIDTH)}
          onKeyDown={handlePathKeyDown}
          onPointerDown={handlePathPointerDown}
          onPointerMove={handlePathPointerMove}
          onPointerUp={finishPathResize}
          onPointerCancel={finishPathResize}
        >
          <span aria-hidden="true"></span>
        </div>

        <section
          className="reader-surface"
          aria-label="文章阅读区域"
          onPointerDown={handleReaderSurfacePointerDown}
        >
          <div className="article-scroll-region">
            <InlineFormattingToolbar
              selection={selection}
              onFormat={applyInlineFormat}
            />
            <article
              className="article-column"
              data-motion={articleMotion}
              key={currentArticle.id}
            >
              <header className="article-header">
                <div className="article-eyebrow">
                  <span>{currentArticle.type}</span>
                  <span>{new Date(currentArticle.updatedAt).toLocaleDateString("zh-CN")}</span>
                </div>
                <h1>{currentArticle.title}</h1>
                <p>{currentArticle.summary}</p>
                {currentArticle.source && (
                  <button
                    className="source-anchor"
                    type="button"
                    onClick={() => navigateTo(currentArticle.source!.parentId)}
                  >
                    <ArrowLeft aria-hidden="true" size={15} />
                    回到来源：“{currentArticle.source.quote.slice(0, 42)}
                    {currentArticle.source.quote.length > 42 ? "…" : ""}”
                  </button>
                )}
              </header>

              <BlockEditor
                articleId={currentArticle.id}
                blocks={currentArticle.blocks}
                formatCommand={formatCommand}
                resetVersion={editorResetVersion}
                onChange={(blocks) => updateBlocks(currentArticle.id, blocks)}
                onSelection={setSelection}
                onSaveState={setSaveState}
              />

              <footer className="article-footer-nav">
                <button
                  type="button"
                  disabled={!currentArticle.parentId}
                  onClick={() => currentArticle.parentId && navigateTo(currentArticle.parentId)}
                >
                  <ArrowLeft aria-hidden="true" size={16} />
                  阅读上一级
                </button>
                <button
                  type="button"
                  disabled={currentArticle.id === currentNotebook.rootId}
                  onClick={() => navigateTo(currentNotebook.rootId)}
                >
                  <Home aria-hidden="true" size={16} />
                  回到主文章
                </button>
              </footer>
            </article>
          </div>

          <aside className="children-column" aria-label="下一级子文章">
            <header>
              <strong>{currentArticle.title} 的子文章</strong>
              <small>{childNodes.length + activeJobs.length} 个</small>
            </header>

            <div className="children-list">
              {activeJobs.map((job) => (
                <div className="generation-card" key={job.id} role="status">
                  <span className="child-card-icon is-loading">
                    <LoaderCircle aria-hidden="true" size={17} />
                  </span>
                  <div>
                    <strong>{job.type === "translate" ? "正在翻译选区" : "正在解释选区"}</strong>
                    <p>“{job.quote.slice(0, 58)}{job.quote.length > 58 ? "…" : ""}”</p>
                    <span>{job.status === "queued" ? "排队中" : "正在生成本地演示节点"}</span>
                  </div>
                  <button type="button" onClick={() => cancelGeneration(job.id)}>
                    <CircleStop aria-hidden="true" size={15} />
                    取消
                  </button>
                </div>
              ))}

              {childNodes.map((child) => (
                <button
                  className="child-card"
                  type="button"
                  key={child.id}
                  aria-label={`打开子文章：${child.title}`}
                  onClick={() => navigateTo(child.id)}
                >
                  <span className="child-card-icon">
                    {child.type === "翻译" ? (
                      <Languages aria-hidden="true" size={17} />
                    ) : (
                      <Sparkles aria-hidden="true" size={17} />
                    )}
                  </span>
                  <span>
                    <strong>{child.title}</strong>
                    <p>{child.summary}</p>
                    <span className="child-card-meta">
                      <span>{child.type}</span>
                      <small>{descendants(child.id, data.articles)} 篇后续</small>
                    </span>
                  </span>
                </button>
              ))}

              {!childNodes.length && !activeJobs.length && (
                <div className="children-empty">
                  <MessageSquareText aria-hidden="true" size={20} />
                  <strong>还没有下一级文章</strong>
                  <p>在左侧正文中选择一段文字，然后点击顶部“解释”或“翻译”。</p>
                </div>
              )}
            </div>
          </aside>
        </section>
      </main>

      <TopologyPanel
        articles={data.articles}
        rootId={currentNotebook.rootId}
        currentId={currentArticle.id}
        onNavigate={navigateTo}
        fullScreen={fullTopology}
        onFullScreen={setFullTopology}
      />

      {notice && (
        <div className="app-notice" role="status">
          <Save aria-hidden="true" size={15} />
          {notice}
        </div>
      )}

      <div className="reader-shortcut-hint" aria-hidden="true">
        <Network size={14} />
        Ctrl G 打开拓扑
      </div>
    </div>
  );
}

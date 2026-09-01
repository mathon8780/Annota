import { markdown, markdownLanguage } from "@codemirror/lang-markdown";
import { defaultHighlightStyle, syntaxHighlighting } from "@codemirror/language";
import { defaultKeymap, history, historyKeymap } from "@codemirror/commands";
import { Compartment, StateField } from "@codemirror/state";
import { Decoration, EditorView, highlightSpecialChars, keymap } from "@codemirror/view";
import { GFM } from "@lezer/markdown";
import { CodeXml, Eye } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import type {
  InlineFormatCommand,
  MarkdownFormatType,
  SelectionState
} from "../types";
import {
  markdownRanges,
  markdownSelectionFromRanges,
  type MarkdownRange
} from "../editor/markdownDocument";
import {
  markdownEditorAppearance,
  sourceModeHeadingExtension
} from "../editor/editorAppearance";
import { fencedCodeHighlightExtension } from "../editor/codeHighlight";
import {
  loadMarkdownDocument,
  saveMarkdownDocument,
  updateMarkdownSession
} from "../editor/markdownRepository";
import { livePreviewExtension } from "../editor/livePreview";
import { loadMarkdownSyntaxIds } from "../editor/syntaxRegistry";
import { matchesShortcut } from "../utils/shortcuts";
import type { ShortcutBinding } from "../utils/shortcuts";

interface MarkdownEditorProps {
  articleId: string;
  /** 所属知识点的根文章标识;决定 Markdown 文件落盘的文件夹。 */
  knowledgePointId?: string;
  contentZoom: number;
  formatCommand: InlineFormatCommand | null;
  resetVersion: number;
  saveShortcut: ShortcutBinding;
  onPersist: () => void;
  onSelection: (selection: SelectionState | null) => void;
  onSaveState: (label: string) => void;
  onBlockOrder: (blockIds: readonly string[]) => void;
}

type EditorMode = "live" | "source";

const markdownEditorSetup = [
  highlightSpecialChars(),
  history(),
  syntaxHighlighting(defaultHighlightStyle, { fallback: true }),
  keymap.of([...defaultKeymap, ...historyKeymap])
];

interface MarkdownBlockSnapshot {
  ranges: readonly MarkdownRange[];
  source: string;
}

function createMarkdownBlockState(articleId: string) {
  return StateField.define<MarkdownBlockSnapshot>({
    create(state) {
      const source = state.doc.toString();
      return { ranges: markdownRanges(source, articleId), source };
    },
    update(value, transaction) {
      if (!transaction.docChanged) return value;
      const source = transaction.state.doc.toString();
      return { ranges: markdownRanges(source, articleId), source };
    }
  });
}

function blockIdentityExtension(blockState: StateField<MarkdownBlockSnapshot>) {
  return EditorView.decorations.compute([blockState], (state) => {
    const decorations = [];
    for (const range of state.field(blockState).ranges) {
      let line = state.doc.lineAt(Math.min(range.from, state.doc.length));
      const lastLine = state.doc.lineAt(Math.min(range.to, state.doc.length)).number;
      while (line.number <= lastLine) {
        decorations.push(
          Decoration.line({
            attributes: { "data-markdown-block-id": range.id }
          }).range(line.from)
        );
        if (line.number === lastLine) break;
        line = state.doc.line(line.number + 1);
      }
    }
    return Decoration.set(decorations, true);
  });
}

function formatWrapper(type: MarkdownFormatType, color?: string) {
  if (type === "bold") return ["**", "**"] as const;
  if (type === "italic") return ["*", "*"] as const;
  if (type === "strikethrough") return ["~~", "~~"] as const;
  if (type === "underline") return ["<u>", "</u>"] as const;
  if (type === "wavyUnderline") {
    return ["<span class=\"annota-wavy-underline\">", "</span>"] as const;
  }
  if (type === "border") {
    return ["<span class=\"annota-border\">", "</span>"] as const;
  }
  const safeColor = color && /^#[0-9a-f]{3,8}$/i.test(color) ? color : undefined;
  if (type === "textColor" && safeColor) {
    return [`<span style=\"color:${safeColor}\">`, "</span>"] as const;
  }
  if (type === "backgroundColor" && safeColor) {
    return [`<mark style=\"background-color:${safeColor}\">`, "</mark>"] as const;
  }
  return null;
}

export function MarkdownEditor({
  articleId,
  knowledgePointId,
  contentZoom,
  formatCommand,
  resetVersion,
  saveShortcut,
  onPersist,
  onSelection,
  onSaveState,
  onBlockOrder
}: MarkdownEditorProps) {
  const hostRef = useRef<HTMLDivElement>(null);
  const viewRef = useRef<EditorView | null>(null);
  const persistTimer = useRef<number>();
  const handledFormatCommand = useRef(0);
  const previewCompartment = useRef(new Compartment());
  const callbacks = useRef({
    onPersist,
    onSelection,
    onSaveState,
    onBlockOrder,
    saveShortcut
  });
  const [mode, setMode] = useState<EditorMode>("live");
  const [syntaxIds] = useState(loadMarkdownSyntaxIds);
  const [loadError, setLoadError] = useState("");
  callbacks.current = {
    onPersist,
    onSelection,
    onSaveState,
    onBlockOrder,
    saveShortcut
  };

  useEffect(() => {
    const host = hostRef.current;
    if (!host) return;
    let disposed = false;
    let persistedDocument = "";
    const markdownBlockState = createMarkdownBlockState(articleId);

    const syncSelection = (view: EditorView) => {
      const { from, to } = view.state.selection.main;
      const blockSnapshot = view.state.field(markdownBlockState);
      const selection = markdownSelectionFromRanges(
        blockSnapshot.source,
        blockSnapshot.ranges,
        from,
        to
      );
      if (selection) {
        const coordinates = view.coordsAtPos(from);
        if (coordinates) {
          selection.rect = {
            left: coordinates.left,
            top: coordinates.top,
            width: Math.max(1, (view.coordsAtPos(to)?.right ?? coordinates.right) - coordinates.left)
          };
        }
      }
      callbacks.current.onSelection(selection);
    };

    const persist = async (label: string) => {
      const view = viewRef.current;
      if (!view) return;
      const source = view.state.field(markdownBlockState).source;
      if (source === persistedDocument) {
        callbacks.current.onSaveState(label);
        setLoadError("");
        return;
      }
      try {
        await saveMarkdownDocument(articleId, source, knowledgePointId);
        persistedDocument = source;
        callbacks.current.onPersist();
        callbacks.current.onSaveState(label);
        setLoadError("");
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        setLoadError(message);
        callbacks.current.onSaveState("保存失败");
      }
    };

    const schedulePersist = () => {
      window.clearTimeout(persistTimer.current);
      callbacks.current.onSaveState("保存中…");
      persistTimer.current = window.setTimeout(() => void persist("已保存至 Markdown"), 450);
    };

    void loadMarkdownDocument(articleId, "", knowledgePointId)
      .then((snapshot) => {
        if (disposed) return;
        persistedDocument = snapshot.content;
        const view = new EditorView({
          doc: snapshot.content,
          parent: host,
          extensions: [
            markdownEditorSetup,
            markdown({
              base: markdownLanguage,
              extensions: [GFM]
            }),
            markdownEditorAppearance,
            markdownBlockState,
            blockIdentityExtension(markdownBlockState),
            fencedCodeHighlightExtension,
            EditorView.lineWrapping,
            EditorView.contentAttributes.of({
              "aria-label": "编辑文章正文",
              "aria-multiline": "true",
              "data-testid": "markdown-editor-content"
            }),
            EditorView.domEventHandlers({
              pointerdown(event, view) {
                if (event.target !== view.contentDOM) return false;
                event.preventDefault();
                return true;
              },
              mousedown(event, view) {
                if (event.target !== view.contentDOM) return false;
                event.preventDefault();
                return true;
              },
              keydown(event) {
                if (!matchesShortcut(event, callbacks.current.saveShortcut)) return false;
                event.preventDefault();
                window.clearTimeout(persistTimer.current);
                void persist("已保存至 Markdown");
                return true;
              },
              blur() {
                window.clearTimeout(persistTimer.current);
                void persist("已保存至 Markdown");
                return false;
              }
            }),
            EditorView.updateListener.of((update) => {
              if (update.docChanged) {
                const blockSnapshot = update.state.field(markdownBlockState);
                updateMarkdownSession(articleId, blockSnapshot.source);
                callbacks.current.onBlockOrder(
                  blockSnapshot.ranges.map((range) => range.id)
                );
                schedulePersist();
              }
              if (update.selectionSet || update.docChanged) syncSelection(update.view);
            }),
            previewCompartment.current.of(livePreviewExtension(syntaxIds))
          ]
        });
        viewRef.current = view;
        callbacks.current.onBlockOrder(
          view.state.field(markdownBlockState).ranges.map((range) => range.id)
        );
        callbacks.current.onSaveState("已载入 Markdown");
      })
      .catch((error) => {
        if (disposed) return;
        const message = error instanceof Error ? error.message : String(error);
        setLoadError(message);
        callbacks.current.onSaveState("载入失败");
      });

    return () => {
      disposed = true;
      window.clearTimeout(persistTimer.current);
      const view = viewRef.current;
      viewRef.current = null;
      if (view) {
        const source = view.state.field(markdownBlockState).source;
        if (source !== persistedDocument) {
          void saveMarkdownDocument(articleId, source, knowledgePointId);
        }
        view.destroy();
      }
      callbacks.current.onSelection(null);
      callbacks.current.onBlockOrder([]);
    };
  }, [articleId, knowledgePointId]);

  useEffect(() => {
    const view = viewRef.current;
    if (!view) return;
    view.dispatch({
      effects: previewCompartment.current.reconfigure(
        mode === "live"
          ? livePreviewExtension(syntaxIds)
          : sourceModeHeadingExtension
      )
    });
  }, [mode, syntaxIds]);

  useEffect(() => {
    const view = viewRef.current;
    if (!view) return;
    view.requestMeasure();
  }, [contentZoom]);

  useEffect(() => {
    const view = viewRef.current;
    if (!view || !formatCommand || handledFormatCommand.current === formatCommand.id) return;
    handledFormatCommand.current = formatCommand.id;
    const from = formatCommand.selection.documentStart;
    const to = formatCommand.selection.documentEnd;
    const wrapper = formatWrapper(formatCommand.type, formatCommand.color);
    if (from === undefined || to === undefined || !wrapper || from === to) return;
    const selected = view.state.doc.sliceString(from, to);
    view.dispatch({
      changes: { from, to, insert: `${wrapper[0]}${selected}${wrapper[1]}` },
      selection: { anchor: from + wrapper[0].length, head: to + wrapper[0].length }
    });
    view.focus();
  }, [formatCommand]);

  useEffect(() => {
    const view = viewRef.current;
    if (!view) return;
    view.dispatch({ selection: { anchor: view.state.selection.main.head } });
    view.contentDOM.blur();
    callbacks.current.onSelection(null);
  }, [resetVersion]);

  return (
    <section className="markdown-editor-shell block-editor" data-testid="block-editor">
      <div className="markdown-editor-controls">
        <div className="markdown-editor-mode" aria-label="Markdown 编辑模式">
          <button
            className={mode === "live" ? "is-active" : ""}
            type="button"
            onClick={() => setMode("live")}
            aria-pressed={mode === "live"}
          >
            <Eye aria-hidden="true" size={14} />
            实时预览
          </button>
          <button
            className={mode === "source" ? "is-active" : ""}
            type="button"
            onClick={() => setMode("source")}
            aria-pressed={mode === "source"}
          >
            <CodeXml aria-hidden="true" size={14} />
            源码
          </button>
        </div>
      </div>
      {loadError && <p className="markdown-editor-error">{loadError}</p>}
      <div className="markdown-editor-host" ref={hostRef} />
    </section>
  );
}

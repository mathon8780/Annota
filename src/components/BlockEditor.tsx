import {
  useEffect,
  useMemo,
  useRef,
  useState,
  type CompositionEvent,
  type KeyboardEvent,
  type MouseEvent
} from "react";
import { Check, Highlighter, Pilcrow } from "lucide-react";
import type { ContentBlock, SelectionState } from "../types";

interface BlockEditorProps {
  articleId: string;
  blocks: ContentBlock[];
  onChange: (blocks: ContentBlock[]) => void;
  onSelection: (selection: SelectionState | null) => void;
  onSaveState: (label: string) => void;
}

export function BlockEditor({
  articleId,
  blocks,
  onChange,
  onSelection,
  onSaveState
}: BlockEditorProps) {
  const [draft, setDraft] = useState(blocks);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [isComposing, setIsComposing] = useState(false);
  const timer = useRef<number>();
  const textareas = useRef<Record<string, HTMLTextAreaElement | null>>({});

  useEffect(() => {
    setDraft(blocks);
    setActiveId(null);
  }, [articleId, blocks]);

  useEffect(() => {
    if (isComposing) return;
    window.clearTimeout(timer.current);
    if (draft === blocks) return;
    onSaveState("保存中…");
    timer.current = window.setTimeout(() => {
      onChange(draft);
      onSaveState("已自动保存");
    }, 450);
    return () => window.clearTimeout(timer.current);
  }, [blocks, draft, isComposing, onChange, onSaveState]);

  useEffect(() => {
    const textarea = activeId ? textareas.current[activeId] : null;
    if (!textarea) return;
    textarea.style.height = "auto";
    textarea.style.height = `${Math.max(56, textarea.scrollHeight)}px`;
  }, [activeId, draft]);

  const activeIndex = useMemo(
    () => draft.findIndex((block) => block.id === activeId),
    [activeId, draft]
  );

  const updateText = (id: string, text: string) => {
    setDraft((value) => value.map((block) => (block.id === id ? { ...block, text } : block)));
  };

  const commitNow = () => {
    window.clearTimeout(timer.current);
    onChange(draft);
    onSaveState("已保存");
  };

  const splitBlock = (index: number, cursor: number) => {
    const current = draft[index];
    const id = `${articleId}-b-${Date.now()}`;
    const before = current.text.slice(0, cursor);
    const after = current.text.slice(cursor);
    const next: ContentBlock = {
      id,
      kind: current.kind.startsWith("h") ? "paragraph" : current.kind,
      text: after
    };
    setDraft([...draft.slice(0, index), { ...current, text: before }, next, ...draft.slice(index + 1)]);
    setActiveId(id);
    window.setTimeout(() => textareas.current[id]?.focus(), 0);
  };

  const mergeBackward = (index: number) => {
    if (index <= 0) return;
    const previous = draft[index - 1];
    const current = draft[index];
    const cursor = previous.text.length;
    setDraft([
      ...draft.slice(0, index - 1),
      { ...previous, text: `${previous.text}${current.text}` },
      ...draft.slice(index + 1)
    ]);
    setActiveId(previous.id);
    window.setTimeout(() => {
      const textarea = textareas.current[previous.id];
      textarea?.focus();
      textarea?.setSelectionRange(cursor, cursor);
    }, 0);
  };

  const handleKeyDown = (event: KeyboardEvent<HTMLTextAreaElement>, index: number) => {
    if ((event.ctrlKey || event.metaKey) && event.key.toLocaleLowerCase() === "s") {
      event.preventDefault();
      commitNow();
      return;
    }
    if (event.key === "Enter" && !event.shiftKey && !isComposing) {
      event.preventDefault();
      splitBlock(index, event.currentTarget.selectionStart);
      return;
    }
    if (
      event.key === "Backspace" &&
      event.currentTarget.selectionStart === 0 &&
      event.currentTarget.selectionEnd === 0
    ) {
      event.preventDefault();
      mergeBackward(index);
    }
  };

  const selectFromReading = (event: MouseEvent<HTMLElement>, blockId: string) => {
    const selection = window.getSelection();
    const text = selection?.toString().trim() ?? "";
    if (!text) {
      onSelection(null);
      setActiveId(blockId);
      return;
    }
    if (selection && event.currentTarget.contains(selection.anchorNode)) {
      const rect = selection.getRangeAt(0).getBoundingClientRect();
      onSelection({
        text,
        blockId,
        rect: { left: rect.left, top: rect.top, width: rect.width }
      });
    }
  };

  const selectFromTextarea = (element: HTMLTextAreaElement, blockId: string) => {
    const text = element.value.slice(element.selectionStart, element.selectionEnd).trim();
    if (!text) {
      onSelection(null);
      return;
    }
    const rect = element.getBoundingClientRect();
    onSelection({
      text,
      blockId,
      rect: { left: rect.left + Math.min(rect.width * 0.45, 260), top: rect.top, width: 0 }
    });
  };

  const cycleKind = (id: string) => {
    const order: ContentBlock["kind"][] = ["paragraph", "h2", "h3", "quote"];
    setDraft((value) =>
      value.map((block) => {
        if (block.id !== id) return block;
        const index = order.indexOf(block.kind);
        return { ...block, kind: order[(index + 1) % order.length] };
      })
    );
  };

  const handleCompositionEnd = (event: CompositionEvent<HTMLTextAreaElement>) => {
    setIsComposing(false);
    updateText(activeId ?? "", event.currentTarget.value);
  };

  return (
    <div className="block-editor" data-testid="block-editor">
      {draft.map((block, index) => {
        const active = block.id === activeId;
        const Element = block.kind === "quote" ? "blockquote" : block.kind.startsWith("h") ? "h2" : "p";
        return (
          <div className={`content-block${active ? " is-active" : ""}`} key={block.id}>
            {active ? (
              <div className="block-edit-shell">
                <div className="block-tools" aria-label="当前块工具">
                  <button type="button" onClick={() => cycleKind(block.id)} title="切换块类型">
                    <Pilcrow aria-hidden="true" size={14} />
                    {block.kind === "paragraph" ? "正文" : block.kind.toUpperCase()}
                  </button>
                  <button
                    type="button"
                    onClick={() => onSaveState("重点样式已记录（演示）")}
                    title="设置重点"
                  >
                    <Highlighter aria-hidden="true" size={14} />
                    重点
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      commitNow();
                      setActiveId(null);
                    }}
                    title="完成编辑"
                  >
                    <Check aria-hidden="true" size={14} />
                    完成
                  </button>
                </div>
                <textarea
                  ref={(element) => {
                    textareas.current[block.id] = element;
                  }}
                  value={block.text}
                  aria-label={`编辑${block.kind === "paragraph" ? "正文" : "标题"}块`}
                  onChange={(event) => updateText(block.id, event.target.value)}
                  onKeyDown={(event) => handleKeyDown(event, index)}
                  onSelect={(event) => selectFromTextarea(event.currentTarget, block.id)}
                  onCompositionStart={() => setIsComposing(true)}
                  onCompositionEnd={handleCompositionEnd}
                  autoFocus
                />
              </div>
            ) : (
              <Element
                className={`reading-block is-${block.kind}`}
                onMouseUp={(event) => selectFromReading(event, block.id)}
                tabIndex={0}
                onKeyDown={(event) => {
                  if (event.key === "Enter") setActiveId(block.id);
                }}
                aria-label="点击或按 Enter 编辑此块"
              >
                {block.text || "空段落"}
              </Element>
            )}
          </div>
        );
      })}
      {activeIndex < 0 && (
        <button
          className="add-block-button"
          type="button"
          onClick={() => {
            const id = `${articleId}-b-${Date.now()}`;
            setDraft((value) => [...value, { id, kind: "paragraph", text: "" }]);
            setActiveId(id);
          }}
        >
          在文末添加段落
        </button>
      )}
    </div>
  );
}

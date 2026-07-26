import {
  Fragment,
  useEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
  type CompositionEvent,
  type KeyboardEvent,
  type MouseEvent
} from "react";
import type {
  ContentBlock,
  InlineFormatCommand,
  InlineMark,
  SelectionState
} from "../types";
import {
  mergeBlockMarks,
  splitBlockMarks,
  toggleInlineMark,
  transformMarksForTextChange
} from "../utils/inlineMarks";

interface BlockEditorProps {
  articleId: string;
  blocks: ContentBlock[];
  formatCommand: InlineFormatCommand | null;
  onChange: (blocks: ContentBlock[]) => void;
  onSelection: (selection: SelectionState | null) => void;
  onSaveState: (label: string) => void;
}

function markClassName(mark: InlineMark) {
  return `inline-mark-${mark.type.replace(/[A-Z]/g, (letter) => `-${letter.toLowerCase()}`)}`;
}

function renderInlineText(block: ContentBlock) {
  if (!block.text) return "空段落";
  const marks = (block.marks ?? []).filter(
    (mark) => mark.start < block.text.length && mark.end > 0 && mark.end > mark.start
  );
  if (!marks.length) return block.text;

  const boundaries = Array.from(
    new Set([
      0,
      block.text.length,
      ...marks.flatMap((mark) => [
        Math.min(block.text.length, Math.max(0, mark.start)),
        Math.min(block.text.length, Math.max(0, mark.end))
      ])
    ])
  ).sort((left, right) => left - right);

  return boundaries.slice(0, -1).map((start, index) => {
    const end = boundaries[index + 1];
    const text = block.text.slice(start, end);
    const activeMarks = marks.filter((mark) => mark.start <= start && mark.end >= end);
    if (!activeMarks.length) {
      return <Fragment key={`text-${start}`}>{text}</Fragment>;
    }

    const classes = Array.from(new Set(activeMarks.map(markClassName)));
    const style: CSSProperties = {};
    const textColor = activeMarks.find((mark) => mark.type === "textColor")?.color;
    const backgroundColor = activeMarks.find(
      (mark) => mark.type === "backgroundColor"
    )?.color;
    const decorations = [
      activeMarks.some((mark) => mark.type === "underline") ? "underline" : "",
      activeMarks.some((mark) => mark.type === "strikethrough") ? "line-through" : ""
    ].filter(Boolean);

    if (textColor) style.color = textColor;
    if (backgroundColor) style.backgroundColor = backgroundColor;
    if (decorations.length) style.textDecorationLine = decorations.join(" ");

    return (
      <span className={classes.join(" ")} style={style} key={`mark-${start}`}>
        {text}
      </span>
    );
  });
}

export function BlockEditor({
  articleId,
  blocks,
  formatCommand,
  onChange,
  onSelection,
  onSaveState
}: BlockEditorProps) {
  const [draft, setDraft] = useState(blocks);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [focusedId, setFocusedId] = useState<string | null>(null);
  const [isComposing, setIsComposing] = useState(false);
  const timer = useRef<number>();
  const textareas = useRef<Record<string, HTMLTextAreaElement | null>>({});
  const handledFormatCommand = useRef(0);

  useEffect(() => {
    setDraft(blocks);
    setActiveId(null);
    setFocusedId(null);
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

  useEffect(() => {
    if (!formatCommand || handledFormatCommand.current === formatCommand.id) return;
    handledFormatCommand.current = formatCommand.id;
    setDraft((value) =>
      value.map((block) =>
        block.id === formatCommand.selection.blockId
          ? toggleInlineMark(
              block,
              {
                start: formatCommand.selection.start,
                end: formatCommand.selection.end
              },
              formatCommand.type,
              formatCommand.color
            )
          : block
      )
    );
  }, [formatCommand]);

  const activeIndex = useMemo(
    () => draft.findIndex((block) => block.id === activeId),
    [activeId, draft]
  );

  const updateText = (id: string, text: string) => {
    setDraft((value) =>
      value.map((block) =>
        block.id === id ? transformMarksForTextChange(block, text) : block
      )
    );
  };

  const commitNow = () => {
    window.clearTimeout(timer.current);
    onChange(draft);
    onSaveState("已保存");
  };

  const splitBlock = (index: number, cursor: number) => {
    const current = draft[index];
    const id = `${articleId}-b-${Date.now()}`;
    const [before, after] = splitBlockMarks(current, cursor);
    const next: ContentBlock = {
      ...after,
      id,
      kind: current.kind.startsWith("h") ? "paragraph" : current.kind,
    };
    setDraft([...draft.slice(0, index), before, next, ...draft.slice(index + 1)]);
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
      mergeBlockMarks(previous, current),
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
    if (!selection || !selection.rangeCount) {
      onSelection(null);
      setActiveId(blockId);
      return;
    }

    const range = selection.getRangeAt(0);
    const selectionInsideBlock =
      event.currentTarget.contains(range.startContainer) &&
      event.currentTarget.contains(range.endContainer);
    if (!selectionInsideBlock || range.collapsed || !range.toString().trim()) {
      onSelection(null);
      setActiveId(blockId);
      return;
    }

    const prefix = range.cloneRange();
    prefix.selectNodeContents(event.currentTarget);
    prefix.setEnd(range.startContainer, range.startOffset);
    const start = prefix.toString().length;
    const end = start + range.toString().length;
    const rect = range.getBoundingClientRect();
    onSelection({
      text: range.toString(),
      blockId,
      start,
      end,
      rect: { left: rect.left, top: rect.top, width: rect.width }
    });
  };

  const selectFromTextarea = (element: HTMLTextAreaElement, blockId: string) => {
    const start = element.selectionStart;
    const end = element.selectionEnd;
    const text = element.value.slice(start, end);
    if (!text.trim()) {
      onSelection(null);
      return;
    }
    const rect = element.getBoundingClientRect();
    onSelection({
      text,
      blockId,
      start,
      end,
      rect: { left: rect.left + Math.min(rect.width * 0.45, 260), top: rect.top, width: 0 }
    });
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
                <textarea
                  ref={(element) => {
                    textareas.current[block.id] = element;
                  }}
                  className={focusedId === block.id ? "is-focus-visible" : undefined}
                  value={block.text}
                  aria-label={`编辑${block.kind === "paragraph" ? "正文" : "标题"}块`}
                  onChange={(event) => updateText(block.id, event.target.value)}
                  onKeyDown={(event) => handleKeyDown(event, index)}
                  onSelect={(event) => selectFromTextarea(event.currentTarget, block.id)}
                  onFocus={() => setFocusedId(block.id)}
                  onBlur={() =>
                    setFocusedId((value) => value === block.id ? null : value)
                  }
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
                {renderInlineText(block)}
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

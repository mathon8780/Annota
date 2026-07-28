import {
  Fragment,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type CSSProperties,
  type ClipboardEvent,
  type CompositionEvent,
  type FormEvent,
  type KeyboardEvent,
  type PointerEvent
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
import { matchesShortcut } from "../utils/shortcuts";
import type { ShortcutBinding } from "../utils/shortcuts";

interface EditorRange {
  blockId: string;
  start: number;
  end: number;
  text: string;
}

interface BlockEditorProps {
  articleId: string;
  blocks: ContentBlock[];
  formatCommand: InlineFormatCommand | null;
  resetVersion: number;
  saveShortcut: ShortcutBinding;
  onChange: (blocks: ContentBlock[]) => void;
  onSelection: (selection: SelectionState | null) => void;
  onSaveState: (label: string) => void;
}

function markClassName(mark: InlineMark) {
  return `inline-mark-${mark.type.replace(/[A-Z]/g, (letter) => `-${letter.toLowerCase()}`)}`;
}

function renderInlineText(block: ContentBlock) {
  if (!block.text) return null;
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
      activeMarks.some((mark) => mark.type === "underline" || mark.type === "wavyUnderline") ? "underline" : "",
      activeMarks.some((mark) => mark.type === "strikethrough") ? "line-through" : ""
    ].filter(Boolean);

    if (textColor) style.color = textColor;
    if (backgroundColor) style.backgroundColor = backgroundColor;
    if (decorations.length) style.textDecorationLine = decorations.join(" ");
    if (activeMarks.some((mark) => mark.type === "wavyUnderline")) {
      style.textDecorationStyle = "wavy";
      style.textDecorationThickness = "1px";
    }
    if (activeMarks.some((mark) => mark.type === "border")) {
      style.border = "1px solid color-mix(in oklch, currentColor 40%, transparent)";
      style.borderRadius = "var(--radius-sm)";
      style.padding = "0 2px";
      style.margin = "0 1px";
    }

    return (
      <span className={classes.join(" ")} style={style} key={`mark-${start}`}>
        {text}
      </span>
    );
  });
}

function findBlockElement(node: Node | null, root: HTMLElement) {
  const element = node instanceof Element ? node : node?.parentElement;
  const block = element?.closest<HTMLElement>("[data-block-id]") ?? null;
  return block && root.contains(block) ? block : null;
}

function offsetWithin(block: HTMLElement, node: Node, offset: number) {
  const range = document.createRange();
  range.selectNodeContents(block);
  range.setEnd(node, offset);
  return range.toString().length;
}

function readEditorRange(root: HTMLElement): EditorRange | null {
  const selection = window.getSelection();
  if (!selection?.rangeCount) return null;
  const range = selection.getRangeAt(0);
  const startBlock = findBlockElement(range.startContainer, root);
  const endBlock = findBlockElement(range.endContainer, root);
  if (!startBlock || startBlock !== endBlock) return null;
  return {
    blockId: startBlock.dataset.blockId ?? "",
    start: offsetWithin(startBlock, range.startContainer, range.startOffset),
    end: offsetWithin(startBlock, range.endContainer, range.endOffset),
    text: range.toString()
  };
}

function pointAtOffset(block: HTMLElement, requestedOffset: number) {
  const walker = document.createTreeWalker(block, NodeFilter.SHOW_TEXT);
  let remaining = Math.max(0, requestedOffset);
  let lastText: Text | null = null;
  while (walker.nextNode()) {
    const node = walker.currentNode as Text;
    lastText = node;
    if (remaining <= node.data.length) {
      return { node: node as Node, offset: remaining };
    }
    remaining -= node.data.length;
  }
  if (lastText) {
    return { node: lastText as Node, offset: lastText.data.length };
  }
  return { node: block as Node, offset: 0 };
}

function restoreEditorRange(
  root: HTMLElement,
  blockId: string,
  start: number,
  end: number
) {
  const block = Array.from(root.querySelectorAll<HTMLElement>("[data-block-id]"))
    .find((candidate) => candidate.dataset.blockId === blockId);
  if (!block) return;
  const from = pointAtOffset(block, start);
  const to = pointAtOffset(block, end);
  const range = document.createRange();
  range.setStart(from.node, from.offset);
  range.setEnd(to.node, to.offset);
  const selection = window.getSelection();
  selection?.removeAllRanges();
  selection?.addRange(range);
  root.focus({ preventScroll: true });
}

function replaceBlockRange(
  block: ContentBlock,
  start: number,
  end: number,
  text: string
) {
  return transformMarksForTextChange(
    block,
    `${block.text.slice(0, start)}${text}${block.text.slice(end)}`
  );
}

function removeEmptyBlocks(blocks: ContentBlock[]) {
  const populatedBlocks = blocks.filter((block) => block.text.length > 0);
  return populatedBlocks.length > 0 ? populatedBlocks : blocks.slice(0, 1);
}

export function BlockEditor({
  articleId,
  blocks,
  formatCommand,
  resetVersion,
  saveShortcut,
  onChange,
  onSelection,
  onSaveState
}: BlockEditorProps) {
  const [draft, setDraft] = useState(blocks);
  const [isComposing, setIsComposing] = useState(false);
  const timer = useRef<number>();
  const editorRef = useRef<HTMLDivElement>(null);
  const handledFormatCommand = useRef(0);
  const pendingRange = useRef<EditorRange | null>(null);
  const activeBlockId = useRef<string | null>(null);
  const blockSequence = useRef(0);

  useEffect(() => {
    setDraft(blocks);
  }, [blocks]);

  useEffect(() => {
    pendingRange.current = null;
    activeBlockId.current = null;
    onSelection(null);
    window.getSelection()?.removeAllRanges();
    editorRef.current?.blur();
  }, [articleId, onSelection, resetVersion]);

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
    if (!formatCommand || handledFormatCommand.current === formatCommand.id) return;
    handledFormatCommand.current = formatCommand.id;
    pendingRange.current = {
      blockId: formatCommand.selection.blockId,
      start: formatCommand.selection.start,
      end: formatCommand.selection.end,
      text: formatCommand.selection.text
    };
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

  useLayoutEffect(() => {
    const nextRange = pendingRange.current;
    const root = editorRef.current;
    if (!nextRange || !root) return;
    pendingRange.current = null;
    restoreEditorRange(
      root,
      nextRange.blockId,
      nextRange.start,
      nextRange.end
    );
  }, [draft]);

  const updateText = (id: string, text: string) => {
    setDraft((value) =>
      value.map((block) =>
        block.id === id ? transformMarksForTextChange(block, text) : block
      )
    );
  };

  const syncSelection = () => {
    const root = editorRef.current;
    if (!root) return;
    const range = readEditorRange(root);
    if (!range || range.start === range.end || !range.text.trim()) {
      activeBlockId.current = range?.blockId ?? null;
      onSelection(null);
      return;
    }
    activeBlockId.current = range.blockId;
    onSelection(range);
  };

  const handleInput = (event: FormEvent<HTMLDivElement>) => {
    if (isComposing) return;
    const root = event.currentTarget;
    const block = findBlockElement(event.target as Node, root);
    const blockId = block?.dataset.blockId;
    if (!block || !blockId) return;
    activeBlockId.current = blockId;
    const range = readEditorRange(root);
    if (range) pendingRange.current = range;
    updateText(blockId, block.textContent ?? "");
  };

  const commitNow = () => {
    window.clearTimeout(timer.current);
    onChange(draft);
    onSaveState("已保存");
  };

  const createBlockId = () => {
    blockSequence.current += 1;
    return `${articleId}-block-${Date.now()}-${blockSequence.current}`;
  };

  const handleKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    if (matchesShortcut(event, saveShortcut)) {
      event.preventDefault();
      commitNow();
      return;
    }

    if (isComposing || event.shiftKey || event.altKey || event.ctrlKey || event.metaKey) {
      return;
    }

    const range = readEditorRange(event.currentTarget);
    if (!range) return;

    if (event.key === "Enter") {
      event.preventDefault();
      const nextBlockId = createBlockId();
      activeBlockId.current = nextBlockId;
      setDraft((value) => {
        const blockIndex = value.findIndex((block) => block.id === range.blockId);
        if (blockIndex < 0) return value;
        const block = replaceBlockRange(
          value[blockIndex],
          range.start,
          range.end,
          ""
        );
        const [left, right] = splitBlockMarks(block, range.start);
        const nextBlock: ContentBlock = {
          ...right,
          id: nextBlockId,
          kind: "paragraph"
        };
        pendingRange.current = {
          blockId: nextBlockId,
          start: 0,
          end: 0,
          text: ""
        };
        return [
          ...value.slice(0, blockIndex),
          left,
          nextBlock,
          ...value.slice(blockIndex + 1)
        ];
      });
      onSelection(null);
      return;
    }

    if (event.key === "Backspace" && range.start === 0 && range.end === 0) {
      const blockIndex = draft.findIndex((block) => block.id === range.blockId);
      if (blockIndex <= 0) return;
      event.preventDefault();
      setDraft((value) => {
        const currentIndex = value.findIndex((block) => block.id === range.blockId);
        if (currentIndex <= 0) return value;
        const previous = value[currentIndex - 1];
        const caretOffset = previous.text.length;
        const merged = mergeBlockMarks(previous, value[currentIndex]);
        pendingRange.current = {
          blockId: previous.id,
          start: caretOffset,
          end: caretOffset,
          text: ""
        };
        activeBlockId.current = previous.id;
        return [
          ...value.slice(0, currentIndex - 1),
          merged,
          ...value.slice(currentIndex + 1)
        ];
      });
      onSelection(null);
    }
  };

  const handlePaste = (event: ClipboardEvent<HTMLDivElement>) => {
    const range = readEditorRange(event.currentTarget);
    if (!range) return;
    const pastedText = event.clipboardData
      .getData("text/plain")
      .replace(/\r\n?/g, "\n");
    const pastedBlockIds = Array.from(
      { length: pastedText.split("\n").length - 1 },
      () => createBlockId()
    );
    event.preventDefault();

    setDraft((value) => {
      const blockIndex = value.findIndex((block) => block.id === range.blockId);
      if (blockIndex < 0) return value;
      const block = replaceBlockRange(
        value[blockIndex],
        range.start,
        range.end,
        pastedText
      );

      if (!pastedText.includes("\n")) {
        const caretOffset = range.start + pastedText.length;
        pendingRange.current = {
          blockId: block.id,
          start: caretOffset,
          end: caretOffset,
          text: ""
        };
        return [
          ...value.slice(0, blockIndex),
          block,
          ...value.slice(blockIndex + 1)
        ];
      }

      const splitBlocks: ContentBlock[] = [];
      let remainder = block;
      let newlineOffset = remainder.text.indexOf("\n");
      while (newlineOffset >= 0) {
        const [left, rightWithNewline] = splitBlockMarks(remainder, newlineOffset);
        splitBlocks.push(left);
        remainder = transformMarksForTextChange(
          rightWithNewline,
          rightWithNewline.text.slice(1)
        );
        newlineOffset = remainder.text.indexOf("\n");
      }
      splitBlocks.push(remainder);

      const nextBlocks = splitBlocks.map((part, index) =>
        index === 0
          ? part
          : {
              ...part,
              id: pastedBlockIds[index - 1],
              kind: "paragraph" as const
            }
      );
      const finalBlock = nextBlocks[nextBlocks.length - 1];
      const finalLineLength = pastedText.slice(pastedText.lastIndexOf("\n") + 1).length;
      pendingRange.current = {
        blockId: finalBlock.id,
        start: finalLineLength,
        end: finalLineLength,
        text: ""
      };
      activeBlockId.current = finalBlock.id;
      return [
        ...value.slice(0, blockIndex),
        ...nextBlocks,
        ...value.slice(blockIndex + 1)
      ];
    });
    onSelection(null);
  };

  const handleCompositionEnd = (event: CompositionEvent<HTMLDivElement>) => {
    setIsComposing(false);
    const root = event.currentTarget;
    const block = findBlockElement(event.target as Node, root);
    const blockId = block?.dataset.blockId;
    if (block && blockId) updateText(blockId, block.textContent ?? "");
  };

  const saveDraftImmediately = (nextDraft: ContentBlock[]) => {
    window.clearTimeout(timer.current);
    pendingRange.current = null;
    setDraft(nextDraft);
    onChange(nextDraft);
    onSaveState("已保存");
  };

  const handlePointerDown = (event: PointerEvent<HTMLDivElement>) => {
    const root = event.currentTarget;
    const nextBlock = findBlockElement(event.target as Node, root);
    const nextBlockId = nextBlock?.dataset.blockId;
    const currentBlockId =
      activeBlockId.current ?? readEditorRange(root)?.blockId ?? null;
    if (
      !currentBlockId ||
      !nextBlockId ||
      nextBlockId === currentBlockId ||
      draft.length <= 1
    ) {
      return;
    }
    const currentBlock = draft.find((block) => block.id === currentBlockId);
    if (!currentBlock || currentBlock.text.length > 0) return;
    activeBlockId.current = nextBlockId;
    saveDraftImmediately(
      draft.filter((block) => block.id !== currentBlockId)
    );
  };

  const handleBlur = () => {
    const nextDraft = removeEmptyBlocks(draft);
    if (nextDraft.length === draft.length) return;
    saveDraftImmediately(nextDraft);
  };

  return (
    <div
      ref={editorRef}
      className="block-editor document-editor"
      data-testid="block-editor"
      contentEditable
      suppressContentEditableWarning
      role="textbox"
      aria-label="编辑文章正文"
      aria-multiline="true"
      onInput={handleInput}
      onMouseUp={syncSelection}
      onPointerDown={handlePointerDown}
      onKeyUp={syncSelection}
      onKeyDown={handleKeyDown}
      onPaste={handlePaste}
      onBlur={handleBlur}
      onCompositionStart={() => setIsComposing(true)}
      onCompositionEnd={handleCompositionEnd}
    >
      {draft.map((block) => (
        <div
          className="document-block"
          data-block-id={block.id}
          data-block-kind={block.kind}
          data-placeholder={block.text ? undefined : "输入正文"}
          key={block.id}
        >
          {renderInlineText(block)}
        </div>
      ))}
    </div>
  );
}

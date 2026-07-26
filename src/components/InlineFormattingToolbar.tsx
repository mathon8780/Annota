import { useState } from "react";
import {
  Bold,
  Highlighter,
  Italic,
  Strikethrough,
  Type,
  Underline
} from "lucide-react";
import type { InlineMarkType, SelectionState } from "../types";

const DEFAULT_TEXT_COLOR = "#ca8a04";
const DEFAULT_BACKGROUND_COLOR = "#fef08a";

interface InlineFormattingToolbarProps {
  selection: SelectionState | null;
  onFormat: (type: InlineMarkType, color?: string) => void;
}

const formattingActions: Array<{
  type: InlineMarkType;
  label: string;
  icon: typeof Bold;
}> = [
  { type: "bold", label: "加粗", icon: Bold },
  { type: "italic", label: "斜体", icon: Italic },
  { type: "strikethrough", label: "删除线", icon: Strikethrough },
  { type: "underline", label: "下划线", icon: Underline }
];

export function InlineFormattingToolbar({
  selection,
  onFormat
}: InlineFormattingToolbarProps) {
  const [textColor, setTextColor] = useState(DEFAULT_TEXT_COLOR);
  const [backgroundColor, setBackgroundColor] = useState(DEFAULT_BACKGROUND_COLOR);
  const disabled = !selection || selection.start === selection.end;

  return (
    <div className="inline-formatting-toolbar" role="toolbar" aria-label="文字格式">
      <span className="formatting-toolbar-label">选区格式</span>
      <div className="formatting-action-group">
        {formattingActions.map(({ type, label, icon: Icon }) => (
          <button
            key={type}
            type="button"
            disabled={disabled}
            aria-label={label}
            title={disabled ? "请先选择正文文字" : label}
            onClick={() => onFormat(type)}
          >
            <Icon aria-hidden="true" size={16} />
          </button>
        ))}
      </div>

      <span className="formatting-toolbar-divider" aria-hidden="true"></span>

      <div className="formatting-color-group">
        <button
          className="formatting-color-button"
          type="button"
          disabled={disabled}
          aria-label="应用文字颜色"
          title={disabled ? "请先选择正文文字" : "应用文字颜色"}
          onClick={() => onFormat("textColor", textColor)}
        >
          <Type aria-hidden="true" size={17} />
          <span
            className="formatting-color-swatch is-text"
            style={{ backgroundColor: textColor }}
            aria-hidden="true"
          ></span>
        </button>
        <label className="formatting-color-input" title="选择文字颜色">
          <span className="sr-only">文字颜色</span>
          <input
            type="color"
            value={textColor}
            aria-label="文字颜色"
            onChange={(event) => setTextColor(event.target.value)}
          />
        </label>
      </div>

      <div className="formatting-color-group">
        <button
          className="formatting-color-button"
          type="button"
          disabled={disabled}
          aria-label="应用背景高亮颜色"
          title={disabled ? "请先选择正文文字" : "应用背景高亮颜色"}
          onClick={() => onFormat("backgroundColor", backgroundColor)}
        >
          <Highlighter aria-hidden="true" size={17} />
          <span
            className="formatting-color-swatch"
            style={{ backgroundColor }}
            aria-hidden="true"
          ></span>
        </button>
        <label className="formatting-color-input" title="选择背景高亮颜色">
          <span className="sr-only">背景高亮颜色</span>
          <input
            type="color"
            value={backgroundColor}
            aria-label="背景高亮颜色"
            onChange={(event) => setBackgroundColor(event.target.value)}
          />
        </label>
      </div>

      <span className="formatting-selection-status" aria-live="polite">
        {disabled ? "选择文字后可设置格式" : `已选择 ${selection.text.length} 个字符`}
      </span>
    </div>
  );
}

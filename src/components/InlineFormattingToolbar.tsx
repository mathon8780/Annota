import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type CSSProperties
} from "react";
import {
  Bold,
  Check,
  ChevronDown,
  Highlighter,
  Italic,
  Palette,
  Strikethrough,
  Type,
  Underline
} from "lucide-react";
import type { InlineMarkType, SelectionState } from "../types";

const DEFAULT_TEXT_COLOR = "#ca8a04";
const DEFAULT_BACKGROUND_COLOR = "#fef08a";
const COLOR_MENU_WIDTH = 176;

const TEXT_COLOR_PRESETS = [
  { name: "黄色", value: "#ca8a04" },
  { name: "红色", value: "#dc2626" },
  { name: "绿色", value: "#16a34a" },
  { name: "蓝色", value: "#2563eb" },
  { name: "紫色", value: "#9333ea" },
  { name: "黑色", value: "#111827" }
] as const;

const BACKGROUND_COLOR_PRESETS = [
  { name: "黄色", value: "#fef08a" },
  { name: "橙色", value: "#fed7aa" },
  { name: "绿色", value: "#bbf7d0" },
  { name: "蓝色", value: "#bfdbfe" },
  { name: "紫色", value: "#e9d5ff" },
  { name: "灰色", value: "#e5e7eb" }
] as const;

type ColorMenuKind = "text" | "background";

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
  const [openMenu, setOpenMenu] = useState<ColorMenuKind | null>(null);
  const [menuPosition, setMenuPosition] = useState<CSSProperties>();
  const toolbarRef = useRef<HTMLDivElement>(null);
  const textColorButtonRef = useRef<HTMLButtonElement>(null);
  const backgroundColorButtonRef = useRef<HTMLButtonElement>(null);
  const disabled = !selection || selection.start === selection.end;

  const updateMenuPosition = useCallback(() => {
    if (!openMenu) return;
    const trigger =
      openMenu === "text"
        ? textColorButtonRef.current
        : backgroundColorButtonRef.current;
    if (!trigger) return;
    const rect = trigger.getBoundingClientRect();
    setMenuPosition({
      left: Math.min(
        window.innerWidth - COLOR_MENU_WIDTH - 12,
        Math.max(12, rect.left)
      ),
      top: rect.bottom + 8
    });
  }, [openMenu]);

  useLayoutEffect(() => {
    updateMenuPosition();
  }, [updateMenuPosition]);

  useEffect(() => {
    if (!openMenu) return;
    const closeOnOutsidePointer = (event: PointerEvent) => {
      if (!toolbarRef.current?.contains(event.target as Node)) {
        setOpenMenu(null);
      }
    };
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") setOpenMenu(null);
    };
    document.addEventListener("pointerdown", closeOnOutsidePointer);
    document.addEventListener("keydown", closeOnEscape);
    window.addEventListener("resize", updateMenuPosition);
    window.addEventListener("scroll", updateMenuPosition, true);
    return () => {
      document.removeEventListener("pointerdown", closeOnOutsidePointer);
      document.removeEventListener("keydown", closeOnEscape);
      window.removeEventListener("resize", updateMenuPosition);
      window.removeEventListener("scroll", updateMenuPosition, true);
    };
  }, [openMenu, updateMenuPosition]);

  useEffect(() => {
    if (disabled) setOpenMenu(null);
  }, [disabled]);

  const applyColor = (kind: ColorMenuKind, color: string) => {
    if (kind === "text") {
      setTextColor(color);
      onFormat("textColor", color);
    } else {
      setBackgroundColor(color);
      onFormat("backgroundColor", color);
    }
    setOpenMenu(null);
  };

  const applyCurrentColor = (kind: ColorMenuKind) => {
    setOpenMenu(null);
    if (kind === "text") {
      onFormat("textColor", textColor);
    } else {
      onFormat("backgroundColor", backgroundColor);
    }
  };

  const renderColorMenu = (kind: ColorMenuKind) => {
    if (openMenu !== kind) return null;
    const isText = kind === "text";
    const label = isText ? "文字颜色" : "背景标注颜色";
    const color = isText ? textColor : backgroundColor;
    const presets = isText ? TEXT_COLOR_PRESETS : BACKGROUND_COLOR_PRESETS;

    return (
      <div
        className="formatting-color-menu"
        role="dialog"
        aria-label={`${label}选项`}
        style={menuPosition}
      >
        <span className="formatting-color-menu-title">{label}</span>
        <div className="formatting-color-options">
          {presets.map((preset) => (
            <button
              className="formatting-color-option"
              type="button"
              aria-label={`${label}：${preset.name}`}
              aria-pressed={color === preset.value}
              title={preset.name}
              key={preset.value}
              onClick={() => applyColor(kind, preset.value)}
            >
              <span
                className="formatting-color-option-swatch"
                style={{ backgroundColor: preset.value }}
                aria-hidden="true"
              >
                {color === preset.value && <Check size={13} />}
              </span>
            </button>
          ))}
        </div>
        <label className="formatting-custom-color">
          <Palette aria-hidden="true" size={15} />
          <span>自选颜色</span>
          <span
            className="formatting-custom-color-preview"
            style={{ backgroundColor: color }}
            aria-hidden="true"
          ></span>
          <input
            type="color"
            value={color}
            aria-label={`自选${label}`}
            onChange={(event) => applyColor(kind, event.target.value)}
          />
        </label>
      </div>
    );
  };

  return (
    <div
      className="inline-formatting-toolbar"
      role="toolbar"
      aria-label="文字格式"
      ref={toolbarRef}
    >
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
          aria-label="文字颜色"
          title={disabled ? "请先选择正文文字" : "应用文字颜色"}
          onClick={() => applyCurrentColor("text")}
        >
          <Type aria-hidden="true" size={17} />
          <span
            className="formatting-color-swatch is-text"
            style={{ backgroundColor: textColor }}
            aria-hidden="true"
          ></span>
        </button>
        <button
          ref={textColorButtonRef}
          className="formatting-color-menu-button"
          type="button"
          disabled={disabled}
          aria-label="选择文字颜色"
          aria-expanded={openMenu === "text"}
          aria-haspopup="dialog"
          title="选择文字颜色"
          onClick={() => setOpenMenu((value) => value === "text" ? null : "text")}
        >
          <ChevronDown aria-hidden="true" size={13} />
        </button>
        {renderColorMenu("text")}
      </div>

      <div className="formatting-color-group">
        <button
          className="formatting-color-button"
          type="button"
          disabled={disabled}
          aria-label="背景标注颜色"
          title={disabled ? "请先选择正文文字" : "应用背景标注颜色"}
          onClick={() => applyCurrentColor("background")}
        >
          <Highlighter aria-hidden="true" size={17} />
          <span
            className="formatting-color-swatch"
            style={{ backgroundColor }}
            aria-hidden="true"
          ></span>
        </button>
        <button
          ref={backgroundColorButtonRef}
          className="formatting-color-menu-button"
          type="button"
          disabled={disabled}
          aria-label="选择背景标注颜色"
          aria-expanded={openMenu === "background"}
          aria-haspopup="dialog"
          title="选择背景标注颜色"
          onClick={() =>
            setOpenMenu((value) => value === "background" ? null : "background")
          }
        >
          <ChevronDown aria-hidden="true" size={13} />
        </button>
        {renderColorMenu("background")}
      </div>

      <span className="formatting-selection-status" aria-live="polite">
        {disabled ? "选择文字后可设置格式" : `已选择 ${selection.text.length} 个字符`}
      </span>
    </div>
  );
}

export const SHORTCUTS_STORAGE_KEY = "annota:shortcuts";

export type ShortcutActionId =
  | "open-search"
  | "save-article"
  | "go-parent"
  | "toggle-topology"
  | "go-root"
  | "focus-topology";

export interface ShortcutBinding {
  key: string;
  ctrl: boolean;
  alt: boolean;
  shift: boolean;
}

export type ShortcutPreferences = Record<
  ShortcutActionId,
  ShortcutBinding
>;

export interface ShortcutDefinition {
  id: ShortcutActionId;
  group: "全局" | "阅读" | "拓扑";
  label: string;
  description: string;
}

interface KeyboardShortcutEvent {
  key: string;
  ctrlKey: boolean;
  altKey: boolean;
  shiftKey: boolean;
  metaKey: boolean;
}

export const shortcutDefinitions: readonly ShortcutDefinition[] = [
  {
    id: "open-search",
    group: "全局",
    label: "打开全局搜索",
    description: "在任意页面打开文章与节点搜索。"
  },
  {
    id: "save-article",
    group: "阅读",
    label: "保存当前文章",
    description: "在正文编辑器中立即保存当前内容。"
  },
  {
    id: "go-parent",
    group: "阅读",
    label: "返回父文章",
    description: "从当前子文章返回上一级来源文章。"
  },
  {
    id: "go-root",
    group: "阅读",
    label: "回到根文章",
    description: "返回当前知识树的根文章。"
  },
  {
    id: "toggle-topology",
    group: "拓扑",
    label: "打开或关闭拓扑",
    description: "切换当前知识树拓扑的全屏显示。"
  },
  {
    id: "focus-topology",
    group: "拓扑",
    label: "聚焦当前节点",
    description: "拓扑可见时，将当前阅读节点移动到中心。"
  }
];

export const defaultShortcuts: ShortcutPreferences = {
  "open-search": { key: "K", ctrl: true, alt: false, shift: false },
  "save-article": { key: "S", ctrl: true, alt: false, shift: false },
  "go-parent": {
    key: "ArrowLeft",
    ctrl: false,
    alt: true,
    shift: false
  },
  "toggle-topology": {
    key: "E",
    ctrl: true,
    alt: false,
    shift: false
  },
  "go-root": { key: "Home", ctrl: true, alt: false, shift: false },
  "focus-topology": { key: "F", ctrl: false, alt: false, shift: false }
};

const modifierKeys = new Set([
  "Alt",
  "AltGraph",
  "Control",
  "Meta",
  "Shift"
]);

const keyAliases: Record<string, string> = {
  " ": "Space",
  Esc: "Escape",
  Left: "ArrowLeft",
  Right: "ArrowRight",
  Up: "ArrowUp",
  Down: "ArrowDown"
};

const displayKeys: Record<string, string> = {
  ArrowLeft: "←",
  ArrowRight: "→",
  ArrowUp: "↑",
  ArrowDown: "↓",
  Escape: "Esc",
  " ": "Space"
};

export function normalizeShortcutKey(key: string) {
  const normalized = keyAliases[key] ?? key;
  return normalized.length === 1
    ? normalized.toLocaleUpperCase("en-US")
    : normalized;
}

export function shortcutFromKeyboardEvent(
  event: KeyboardShortcutEvent
): ShortcutBinding | null {
  const key = normalizeShortcutKey(event.key);
  if (modifierKeys.has(key) || event.metaKey) return null;
  return {
    key,
    ctrl: event.ctrlKey,
    alt: event.altKey,
    shift: event.shiftKey
  };
}

export function matchesShortcut(
  event: KeyboardShortcutEvent,
  binding: ShortcutBinding
) {
  return (
    !event.metaKey &&
    normalizeShortcutKey(event.key) === binding.key &&
    event.ctrlKey === binding.ctrl &&
    event.altKey === binding.alt &&
    event.shiftKey === binding.shift
  );
}

export function shortcutSignature(binding: ShortcutBinding) {
  return [
    binding.ctrl ? "ctrl" : "",
    binding.alt ? "alt" : "",
    binding.shift ? "shift" : "",
    binding.key.toLocaleLowerCase("en-US")
  ]
    .filter(Boolean)
    .join("+");
}

export function formatShortcut(binding: ShortcutBinding) {
  return [
    binding.ctrl ? "Ctrl" : "",
    binding.alt ? "Alt" : "",
    binding.shift ? "Shift" : "",
    displayKeys[binding.key] ?? binding.key
  ]
    .filter(Boolean)
    .join(" + ");
}

function validBinding(
  value: unknown,
  fallback: ShortcutBinding
): ShortcutBinding {
  if (
    !value ||
    typeof value !== "object" ||
    typeof (value as ShortcutBinding).key !== "string" ||
    typeof (value as ShortcutBinding).ctrl !== "boolean" ||
    typeof (value as ShortcutBinding).alt !== "boolean" ||
    typeof (value as ShortcutBinding).shift !== "boolean"
  ) {
    return { ...fallback };
  }
  const candidate = value as ShortcutBinding;
  const key = normalizeShortcutKey(candidate.key);
  return modifierKeys.has(key) || !key
    ? { ...fallback }
    : { ...candidate, key };
}

export function defaultShortcutPreferences(): ShortcutPreferences {
  return Object.fromEntries(
    shortcutDefinitions.map(({ id }) => [id, { ...defaultShortcuts[id] }])
  ) as ShortcutPreferences;
}

export function loadShortcutPreferences(): ShortcutPreferences {
  try {
    const parsed = JSON.parse(
      window.localStorage.getItem(SHORTCUTS_STORAGE_KEY) ?? "{}"
    ) as Partial<Record<ShortcutActionId, unknown>>;
    return Object.fromEntries(
      shortcutDefinitions.map(({ id }) => [
        id,
        validBinding(parsed[id], defaultShortcuts[id])
      ])
    ) as ShortcutPreferences;
  } catch {
    return defaultShortcutPreferences();
  }
}

export function saveShortcutPreferences(
  preferences: ShortcutPreferences
) {
  window.localStorage.setItem(
    SHORTCUTS_STORAGE_KEY,
    JSON.stringify(preferences)
  );
}

export function conflictingShortcut(
  preferences: ShortcutPreferences,
  actionId: ShortcutActionId,
  binding: ShortcutBinding
) {
  const signature = shortcutSignature(binding);
  return shortcutDefinitions.find(
    ({ id }) =>
      id !== actionId &&
      shortcutSignature(preferences[id]) === signature
  );
}

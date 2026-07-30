export const FONT_PREFERENCES_STORAGE_KEY = "annota:font-preferences";
export const SYSTEM_FONT_PREFIX = "system:";

export const interfaceFontOptions = [
  {
    id: "noto-sans",
    label: "Noto Sans SC",
    stack: '"Noto Sans SC Variable", "Microsoft YaHei UI", sans-serif'
  },
  {
    id: "system-sans",
    label: "系统界面字体",
    stack: '"Segoe UI", "Microsoft YaHei UI", sans-serif'
  }
] as const;

export const readingFontOptions = [
  {
    id: "noto-sans",
    label: "Noto Sans SC",
    stack: '"Noto Sans SC Variable", "Microsoft YaHei UI", sans-serif'
  },
  {
    id: "songti",
    label: "宋体",
    stack: '"Songti SC", SimSun, serif'
  },
  {
    id: "kaiti",
    label: "楷体",
    stack: '"KaiTi", "STKaiti", serif'
  }
] as const;

export const codeFontOptions = [
  {
    id: "cascadia",
    label: "Cascadia Code",
    stack: '"Cascadia Code", "Cascadia Mono", Consolas, monospace'
  },
  {
    id: "consolas",
    label: "Consolas",
    stack: 'Consolas, "Courier New", monospace'
  },
  {
    id: "system-mono",
    label: "系统等宽字体",
    stack: 'ui-monospace, "Cascadia Mono", Consolas, monospace'
  }
] as const;

export const interfaceFontSizes = [13, 14, 15, 16, 17] as const;
export const readingFontSizes = [15, 16, 17, 18, 20, 22] as const;
export const codeFontSizes = [12, 13, 14, 15, 16] as const;

export interface FontPreferences {
  interfaceFamily: string;
  readingFamily: string;
  codeFamily: string;
  interfaceSize: (typeof interfaceFontSizes)[number];
  readingSize: (typeof readingFontSizes)[number];
  codeSize: (typeof codeFontSizes)[number];
}

export const defaultFontPreferences: FontPreferences = {
  interfaceFamily: "noto-sans",
  readingFamily: "noto-sans",
  codeFamily: "cascadia",
  interfaceSize: 14,
  readingSize: 16,
  codeSize: 13
};

function isOptionId(
  options: readonly { id: string }[],
  value: unknown
): value is string {
  return (
    typeof value === "string" &&
    (
      options.some((option) => option.id === value) ||
      (
        value.startsWith(SYSTEM_FONT_PREFIX) &&
        value.slice(SYSTEM_FONT_PREFIX.length).trim().length > 0
      )
    )
  );
}

function isFontSize(
  options: readonly number[],
  value: unknown
): value is FontPreferences["interfaceSize"] {
  return typeof value === "number" && options.includes(value);
}

export function loadFontPreferences(): FontPreferences {
  try {
    const parsed = JSON.parse(
      window.localStorage.getItem(FONT_PREFERENCES_STORAGE_KEY) ?? "{}"
    ) as Partial<FontPreferences>;

    return {
      interfaceFamily: isOptionId(interfaceFontOptions, parsed.interfaceFamily)
        ? parsed.interfaceFamily as FontPreferences["interfaceFamily"]
        : defaultFontPreferences.interfaceFamily,
      readingFamily: isOptionId(readingFontOptions, parsed.readingFamily)
        ? parsed.readingFamily as FontPreferences["readingFamily"]
        : defaultFontPreferences.readingFamily,
      codeFamily: isOptionId(codeFontOptions, parsed.codeFamily)
        ? parsed.codeFamily as FontPreferences["codeFamily"]
        : defaultFontPreferences.codeFamily,
      interfaceSize: isFontSize(interfaceFontSizes, parsed.interfaceSize)
        ? parsed.interfaceSize
        : defaultFontPreferences.interfaceSize,
      readingSize: isFontSize(readingFontSizes, parsed.readingSize)
        ? parsed.readingSize as FontPreferences["readingSize"]
        : defaultFontPreferences.readingSize,
      codeSize: isFontSize(codeFontSizes, parsed.codeSize)
        ? parsed.codeSize as FontPreferences["codeSize"]
        : defaultFontPreferences.codeSize
    };
  } catch {
    return defaultFontPreferences;
  }
}

export function systemFontPreference(fontFamily: string) {
  return `${SYSTEM_FONT_PREFIX}${fontFamily}`;
}

export function systemFontName(preference: string) {
  return preference.startsWith(SYSTEM_FONT_PREFIX)
    ? preference.slice(SYSTEM_FONT_PREFIX.length)
    : null;
}

function cssString(value: string) {
  return JSON.stringify(value.replace(/[\r\n]/g, " "));
}

export function resolveFontStack(
  options: readonly { id: string; stack: string }[],
  selectedId: string
) {
  const selectedSystemFont = systemFontName(selectedId);
  if (selectedSystemFont) {
    return `${cssString(selectedSystemFont)}, ${options[0].stack}`;
  }
  return options.find((option) => option.id === selectedId)?.stack ?? options[0].stack;
}

export function applyFontPreferences(preferences: FontPreferences) {
  const root = document.documentElement;
  const interfaceSize = preferences.interfaceSize;

  root.style.setProperty(
    "--font-body",
    resolveFontStack(interfaceFontOptions, preferences.interfaceFamily)
  );
  root.style.setProperty(
    "--font-display",
    resolveFontStack(interfaceFontOptions, preferences.interfaceFamily)
  );
  root.style.setProperty(
    "--font-reading",
    resolveFontStack(readingFontOptions, preferences.readingFamily)
  );
  const codeFontStack = resolveFontStack(codeFontOptions, preferences.codeFamily);
  root.style.setProperty(
    "--font-mono",
    resolveFontStack(interfaceFontOptions, preferences.interfaceFamily)
  );
  root.style.setProperty(
    "--font-code",
    codeFontStack
  );
  root.style.setProperty("--text-xs", `${Math.round(interfaceSize * 0.86)}px`);
  root.style.setProperty("--text-sm", `${interfaceSize}px`);
  root.style.setProperty("--text-base", `${Math.round(interfaceSize * 1.14)}px`);
  root.style.setProperty("--text-lg", `${Math.round(interfaceSize * 1.29)}px`);
  root.style.setProperty("--text-xl", `${Math.round(interfaceSize * 1.43)}px`);
  root.style.setProperty("--text-2xl", `${Math.round(interfaceSize * 1.71)}px`);
  root.style.setProperty("--text-3xl", `${Math.round(interfaceSize * 2.29)}px`);
  root.style.setProperty("--reading-font-size", `${preferences.readingSize}px`);
  root.style.setProperty("--code-font-size", `${preferences.codeSize}px`);
}

export function saveFontPreferences(preferences: FontPreferences) {
  window.localStorage.setItem(
    FONT_PREFERENCES_STORAGE_KEY,
    JSON.stringify(preferences)
  );
  applyFontPreferences(preferences);
}

export function applyStoredFontPreferences() {
  applyFontPreferences(loadFontPreferences());
}

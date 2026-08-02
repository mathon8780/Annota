export const APP_THEME_STORAGE_KEY = "annota:app-theme.v1";

export type AppThemeId = "cobalt" | "gruvbox";

export interface AppThemeDefinition {
  description: string;
  englishName: string;
  id: AppThemeId;
  name: string;
}

export const appThemes: readonly AppThemeDefinition[] = [
  {
    id: "cobalt",
    name: "Cobalt 浅色",
    englishName: "Cobalt Light",
    description: "冷白纸面与钴蓝强调，适合明亮环境下的清晰阅读。"
  },
  {
    id: "gruvbox",
    name: "Gruvbox 暖夜",
    englishName: "Gruvbox Dark",
    description: "暖深褐表面、奶油色正文与终端风语法色，适合低眩光阅读和编辑。"
  }
] as const;

export function isAppThemeId(value: unknown): value is AppThemeId {
  return appThemes.some((theme) => theme.id === value);
}

export function loadAppTheme(): AppThemeId {
  const stored = window.localStorage.getItem(APP_THEME_STORAGE_KEY);
  return isAppThemeId(stored) ? stored : "cobalt";
}

export function applyAppTheme(theme: AppThemeId) {
  document.documentElement.dataset.theme = theme;
}

export function saveAppTheme(theme: AppThemeId) {
  window.localStorage.setItem(APP_THEME_STORAGE_KEY, theme);
  applyAppTheme(theme);
}

export function applyStoredAppTheme() {
  applyAppTheme(loadAppTheme());
}

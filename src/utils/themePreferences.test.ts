import { afterEach, describe, expect, it } from "vitest";
import {
  APP_THEME_STORAGE_KEY,
  applyStoredAppTheme,
  loadAppTheme,
  saveAppTheme
} from "./themePreferences";

afterEach(() => {
  window.localStorage.removeItem(APP_THEME_STORAGE_KEY);
  delete document.documentElement.dataset.theme;
});

describe("themePreferences", () => {
  it("falls back to the default theme for missing or invalid preferences", () => {
    expect(loadAppTheme()).toBe("cobalt");

    window.localStorage.setItem(APP_THEME_STORAGE_KEY, "unknown-theme");
    applyStoredAppTheme();

    expect(loadAppTheme()).toBe("cobalt");
    expect(document.documentElement).toHaveAttribute("data-theme", "cobalt");
  });

  it("persists and applies the Gruvbox theme", () => {
    saveAppTheme("gruvbox");

    expect(window.localStorage.getItem(APP_THEME_STORAGE_KEY)).toBe("gruvbox");
    expect(document.documentElement).toHaveAttribute("data-theme", "gruvbox");
  });
});

import { beforeEach, describe, expect, it } from "vitest";
import {
  CONTENT_ZOOM_DEFAULT,
  CONTENT_ZOOM_MAX,
  CONTENT_ZOOM_MIN,
  CONTENT_ZOOM_STORAGE_KEY,
  loadContentZoom,
  normalizeContentZoom,
  saveContentZoom,
  stepContentZoom
} from "./contentZoom";

beforeEach(() => {
  window.localStorage.clear();
});

describe("content zoom preferences", () => {
  it("loads the default for missing or invalid values", () => {
    expect(loadContentZoom()).toBe(CONTENT_ZOOM_DEFAULT);
    window.localStorage.setItem(CONTENT_ZOOM_STORAGE_KEY, "invalid");
    expect(loadContentZoom()).toBe(CONTENT_ZOOM_DEFAULT);
  });

  it("steps, clamps, and persists normalized zoom values", () => {
    expect(stepContentZoom(1, -100)).toBe(1.1);
    expect(stepContentZoom(1, 100)).toBe(0.9);
    expect(normalizeContentZoom(100)).toBe(CONTENT_ZOOM_MAX);
    expect(normalizeContentZoom(0.1)).toBe(CONTENT_ZOOM_MIN);

    expect(saveContentZoom(1.26)).toBe(1.3);
    expect(loadContentZoom()).toBe(1.3);
  });
});

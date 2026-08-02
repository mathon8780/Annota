import {
  loadReadingPathMode,
  READING_PATH_MODE_STORAGE_KEY,
  reconcileReadingTrail,
  saveReadingPathMode
} from "./readingPathPreferences";

beforeEach(() => {
  window.localStorage.clear();
});

describe("readingPathPreferences", () => {
  it("defaults to retained branches and persists current-only mode", () => {
    expect(loadReadingPathMode()).toBe("retain-branch");

    saveReadingPathMode("current-only");

    expect(loadReadingPathMode()).toBe("current-only");
    expect(window.localStorage.getItem(READING_PATH_MODE_STORAGE_KEY)).toBe(
      "current-only"
    );
  });

  it("keeps a descendant tail only while navigating within the same branch", () => {
    const trail = ["1", "2", "3", "4"];

    expect(reconcileReadingTrail(trail, ["1", "2"])).toBe(trail);
    expect(reconcileReadingTrail(trail, ["1", "2", "3"])).toBe(trail);
    expect(reconcileReadingTrail(trail, ["1", "21"])).toEqual(["1", "21"]);
    expect(reconcileReadingTrail(trail, ["another-root"])).toEqual([
      "another-root"
    ]);
  });
});

import {
  loadReaderToolbarPreferences,
  READER_TOOLBAR_STORAGE_KEY,
  saveReaderToolbarPreferences
} from "./readerToolbarPreferences";

beforeEach(() => {
  window.localStorage.clear();
});

describe("readerToolbarPreferences", () => {
  it("defaults to labels and persists icon-only mode", () => {
    expect(loadReaderToolbarPreferences()).toEqual({ iconOnly: false });

    saveReaderToolbarPreferences({ iconOnly: true });

    expect(loadReaderToolbarPreferences()).toEqual({ iconOnly: true });
    expect(window.localStorage.getItem(READER_TOOLBAR_STORAGE_KEY)).toContain(
      '"iconOnly":true'
    );
  });

  it("falls back safely when stored preferences are invalid", () => {
    window.localStorage.setItem(READER_TOOLBAR_STORAGE_KEY, "{");
    expect(loadReaderToolbarPreferences()).toEqual({ iconOnly: false });
  });
});

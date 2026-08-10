export const READER_TOOLBAR_STORAGE_KEY = "annota.reader-toolbar.v1";

export interface ReaderToolbarPreferences {
  iconOnly: boolean;
}

const defaults: ReaderToolbarPreferences = {
  iconOnly: false
};

export function loadReaderToolbarPreferences(): ReaderToolbarPreferences {
  try {
    const stored = JSON.parse(
      window.localStorage.getItem(READER_TOOLBAR_STORAGE_KEY) ?? "null"
    ) as Partial<ReaderToolbarPreferences> | null;
    return {
      iconOnly:
        typeof stored?.iconOnly === "boolean" ? stored.iconOnly : defaults.iconOnly
    };
  } catch {
    return defaults;
  }
}

export function saveReaderToolbarPreferences(
  preferences: ReaderToolbarPreferences
) {
  window.localStorage.setItem(
    READER_TOOLBAR_STORAGE_KEY,
    JSON.stringify(preferences)
  );
}

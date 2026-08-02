export const READING_PATH_MODE_STORAGE_KEY = "annota:reading-path-mode.v1";

export type ReadingPathMode = "retain-branch" | "current-only";

export function loadReadingPathMode(): ReadingPathMode {
  return window.localStorage.getItem(READING_PATH_MODE_STORAGE_KEY) === "current-only"
    ? "current-only"
    : "retain-branch";
}

export function saveReadingPathMode(mode: ReadingPathMode) {
  window.localStorage.setItem(READING_PATH_MODE_STORAGE_KEY, mode);
}

function samePath(left: readonly string[], right: readonly string[]) {
  return left.length === right.length && left.every((id, index) => id === right[index]);
}

export function reconcileReadingTrail(
  previousTrail: readonly string[],
  currentPath: readonly string[]
) {
  if (samePath(previousTrail, currentPath)) return previousTrail;
  const isBacktrackingOnSameBranch =
    currentPath.length < previousTrail.length &&
    currentPath.every((id, index) => id === previousTrail[index]);
  return isBacktrackingOnSameBranch ? previousTrail : currentPath;
}

export const CONTENT_ZOOM_STORAGE_KEY = "annota:reader-content-zoom.v1";
export const CONTENT_ZOOM_DEFAULT = 1;
export const CONTENT_ZOOM_MIN = 0.7;
export const CONTENT_ZOOM_MAX = 1.8;
export const CONTENT_ZOOM_STEP = 0.1;

export function normalizeContentZoom(value: number) {
  if (!Number.isFinite(value)) return CONTENT_ZOOM_DEFAULT;
  const rounded = Math.round(value * 10) / 10;
  return Math.min(CONTENT_ZOOM_MAX, Math.max(CONTENT_ZOOM_MIN, rounded));
}

export function stepContentZoom(current: number, wheelDeltaY: number) {
  if (wheelDeltaY === 0) return normalizeContentZoom(current);
  return normalizeContentZoom(
    current + (wheelDeltaY < 0 ? CONTENT_ZOOM_STEP : -CONTENT_ZOOM_STEP)
  );
}

export function loadContentZoom() {
  const stored = Number(window.localStorage.getItem(CONTENT_ZOOM_STORAGE_KEY));
  return stored > 0 ? normalizeContentZoom(stored) : CONTENT_ZOOM_DEFAULT;
}

export function saveContentZoom(value: number) {
  const normalized = normalizeContentZoom(value);
  window.localStorage.setItem(CONTENT_ZOOM_STORAGE_KEY, String(normalized));
  return normalized;
}

import "@testing-library/jest-dom/vitest";

// jsdom 不执行真实布局；观察器仅在测试环境补齐。
if (typeof window !== "undefined") {
  globalThis.ResizeObserver ??= class {
    observe() {}
    unobserve() {}
    disconnect() {}
  };
  globalThis.IntersectionObserver ??= class {
    readonly root = null;
    readonly rootMargin = "0px";
    readonly thresholds = [0];
    observe() {}
    unobserve() {}
    disconnect() {}
    takeRecords(): IntersectionObserverEntry[] { return []; }
  };
}

const emptyRect = {
  bottom: 0,
  height: 0,
  left: 0,
  right: 0,
  top: 0,
  width: 0,
  x: 0,
  y: 0,
  toJSON: () => ({})
};

if (typeof Range !== "undefined") Object.defineProperty(Range.prototype, "getBoundingClientRect", {
  configurable: true,
  value: () => emptyRect
});

if (typeof Range !== "undefined") Object.defineProperty(Range.prototype, "getClientRects", {
  configurable: true,
  value: () => []
});

if (typeof HTMLDialogElement !== "undefined") Object.defineProperty(HTMLDialogElement.prototype, "showModal", {
  configurable: true,
  value() {
    this.setAttribute("open", "");
  }
});

if (typeof HTMLDialogElement !== "undefined") Object.defineProperty(HTMLDialogElement.prototype, "close", {
  configurable: true,
  value() {
    this.removeAttribute("open");
    this.dispatchEvent(new Event("close"));
  }
});

if (typeof window !== "undefined") Object.defineProperty(window, "matchMedia", {
  writable: true,
  value: (query: string) => ({
    matches: false,
    media: query,
    onchange: null,
    addListener: () => undefined,
    removeListener: () => undefined,
    addEventListener: () => undefined,
    removeEventListener: () => undefined,
    dispatchEvent: () => false
  })
});

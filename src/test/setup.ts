import "@testing-library/jest-dom/vitest";

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

Object.defineProperty(Range.prototype, "getBoundingClientRect", {
  configurable: true,
  value: () => emptyRect
});

Object.defineProperty(Range.prototype, "getClientRects", {
  configurable: true,
  value: () => []
});

Object.defineProperty(HTMLDialogElement.prototype, "showModal", {
  configurable: true,
  value() {
    this.setAttribute("open", "");
  }
});

Object.defineProperty(HTMLDialogElement.prototype, "close", {
  configurable: true,
  value() {
    this.removeAttribute("open");
    this.dispatchEvent(new Event("close"));
  }
});

Object.defineProperty(window, "matchMedia", {
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

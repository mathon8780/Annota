import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    environment: "node",
    environmentMatchGlobs: [
      ["src/App.test.tsx", "jsdom"],
      ["src/components/**", "jsdom"],
      ["src/store/**", "jsdom"],
      ["src/editor/!(markdownDocument).test.ts", "jsdom"],
      ["src/utils/{contentZoom,generationConfig,readingPathPreferences,readerToolbarPreferences,themePreferences,topologyRepository}.test.ts", "jsdom"]
    ],
    setupFiles: "./src/test/setup.ts",
    css: true,
    globals: true
  }
});

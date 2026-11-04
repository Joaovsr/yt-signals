import { fileURLToPath } from "node:url";
import { defineConfig } from "vite";

export default defineConfig({
  build: {
    outDir: "dist-extension",
    emptyOutDir: false,
    lib: {
      entry: fileURLToPath(new URL("./src/extension/content.ts", import.meta.url)),
      name: "YTSignals",
      formats: ["iife"],
      fileName: () => "content.js",
    },
  },
});

import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { defineConfig, loadEnv } from "vite";
import react from "@vitejs/plugin-react";

const root = fileURLToPath(new URL(".", import.meta.url));

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, root, "VITE_");
  const apiUrl = new URL(process.env.VITE_API_BASE_URL || env.VITE_API_BASE_URL || "http://127.0.0.1:8080");
  if (apiUrl.username || apiUrl.password || !["http:", "https:"].includes(apiUrl.protocol)) {
    throw new Error("VITE_API_BASE_URL deve ser uma URL HTTP(S) sem credenciais.");
  }
  if (apiUrl.protocol !== "https:" && !["localhost", "127.0.0.1"].includes(apiUrl.hostname)) {
    throw new Error("A API deve usar HTTPS fora do ambiente local.");
  }
  return {
    base: "./",
    define: { "import.meta.env.VITE_API_BASE_URL": JSON.stringify(apiUrl.href.replace(/\/$/, "")) },
    plugins: [react(), {
      name: "extension-manifest",
      generateBundle() {
        this.emitFile({ type: "asset", fileName: "manifest.json", source: JSON.stringify({
          manifest_version: 3,
          name: "YT Signals",
          version: "0.1.0",
          description: "Insights da descrição e dos comentários de vídeos do YouTube.",
          minimum_chrome_version: "116",
          permissions: ["sidePanel", "storage"],
          host_permissions: ["https://www.youtube.com/*", `${apiUrl.origin}/*`],
          action: { default_title: "Ver insights do vídeo" },
          side_panel: { default_path: "sidepanel.html" },
          background: { service_worker: "background.js", type: "module" },
          content_scripts: [{ matches: ["https://www.youtube.com/*"], js: ["content.js"], run_at: "document_idle" }],
        }, null, 2) });
      },
    }],
    build: {
      outDir: "dist-extension",
      rollupOptions: {
        input: { analytics: resolve(root, "index.html"), sidepanel: resolve(root, "sidepanel.html"), background: resolve(root, "src/extension/background.ts") },
        output: { entryFileNames: (chunk) => chunk.name === "background" ? "background.js" : "assets/[name]-[hash].js" },
      },
    },
  };
});

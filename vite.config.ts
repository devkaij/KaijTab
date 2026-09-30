import { defineConfig } from "vite";
import preact from "@preact/preset-vite";
import { resolve } from "node:path";

const root = import.meta.dirname;

export default defineConfig({
  plugins: [preact()],
  base: "./",
  root: resolve(root, "src/newtab"),
  publicDir: resolve(root, "public"),
  resolve: {
    alias: {
      "@": resolve(root, "src"),
    },
  },
  build: {
    outDir: resolve(root, "dist"),
    emptyOutDir: true,
    target: "chrome110",
    sourcemap: false,
    rollupOptions: {
      input: {
        main: resolve(root, "src/newtab/main.html"),
        background: resolve(root, "src/background/index.ts"),
        whost: resolve(root, "src/whost/index.ts"),
        appSw: resolve(root, "src/web/app-sw.ts"),
      },
      output: {
        entryFileNames: (chunk) => {
          if (chunk.name === "background") return "background.js";
          if (chunk.name === "whost") return "whost-sw.js";
          if (chunk.name === "appSw") return "app-sw.js";
          return "assets/[name]-[hash].js";
        },
        chunkFileNames: "assets/[name]-[hash].js",
        assetFileNames: "assets/[name]-[hash][extname]",
      },
    },
  },
});

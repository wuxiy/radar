import path from "node:path";
import { defineConfig } from "vite";
import tailwindcss from "@tailwindcss/vite";

export default defineConfig({
  root: path.resolve(import.meta.dirname, "manage"),
  base: "/manage/",
  plugins: [tailwindcss()],
  resolve: { conditions: ["medical", "module", "browser", "development|production"] },
  build: { outDir: path.resolve(import.meta.dirname, "build/manage"), emptyOutDir: true },
});

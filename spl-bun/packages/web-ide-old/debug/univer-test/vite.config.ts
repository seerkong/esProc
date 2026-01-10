import { defineConfig } from "vite";
import vue from "@vitejs/plugin-vue";
import path from "path";

const packagesRoot = path.resolve(__dirname, "../../..");

export default defineConfig({
  plugins: [vue()],
  base: "/univer-test/",
  server: {
    port: 4174,
  },
  resolve: {
    alias: {
      "@esproc/web-ide": path.resolve(packagesRoot, "web-ide/src/index.ts"),
      "@esproc/expression": path.resolve(packagesRoot, "expression/src/index.ts"),
      "@esproc/spl-dsl": path.resolve(packagesRoot, "spl-dsl/src/index.ts"),
      "@esproc/core": path.resolve(packagesRoot, "core/src/index.ts"),
    },
  },
});

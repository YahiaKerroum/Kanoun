import { defineConfig } from "vite";

// The launcher is the Tauri window's own UI. Workspace windows load the
// staff, back-office, and guest apps from the local runtime instead.
export default defineConfig({
  clearScreen: false,
  server: {
    host: "127.0.0.1",
    port: 1420,
    strictPort: true,
    watch: { ignored: ["**/src-tauri/**", "**/build/**"] },
  },
  build: {
    target: "es2022",
    outDir: "dist",
    emptyOutDir: true,
  },
});

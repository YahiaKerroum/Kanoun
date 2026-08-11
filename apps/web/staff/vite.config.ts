import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

const apiProxyOrigin = process.env.API_PROXY_ORIGIN ?? "http://127.0.0.1:3000";

export default defineConfig({
  plugins: [react()],
  server: {
    host: "127.0.0.1",
    port: 5173,
    strictPort: true,
    proxy: {
      "/api": {
        target: apiProxyOrigin,
        changeOrigin: false,
      },
      "/health": {
        target: apiProxyOrigin,
        changeOrigin: false,
      },
    },
  },
  preview: {
    host: "127.0.0.1",
    port: 4173,
    proxy: {
      "/api": {
        target: apiProxyOrigin,
        changeOrigin: false,
      },
      "/health": {
        target: apiProxyOrigin,
        changeOrigin: false,
      },
    },
  },
});

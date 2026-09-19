import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

// The dev server forwards API calls (and the WebSocket upgrade on /v1/stream) to the local API.
// Override with API_TARGET=http://host:port when the API runs somewhere else.
const target = process.env.API_TARGET ?? "http://127.0.0.1:8080";

export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    proxy: {
      "/v1": { target, changeOrigin: true, ws: true },
      "/health": { target, changeOrigin: true },
    },
  },
  build: { outDir: "dist", sourcemap: true, chunkSizeWarningLimit: 900 },
});

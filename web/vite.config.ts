import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";

export default defineConfig({
  plugins: [react(), tailwindcss()],
  server: {
    port: 5173,
    proxy: { "/api": "http://localhost:8000" },
    // allow tunnel/proxy hosts (sandbox preview, ngrok, etc.) — dev-only option;
    // production serves a static build from Vercel and is unaffected
    allowedHosts: true,
  },
});

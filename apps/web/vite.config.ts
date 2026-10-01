import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";

export default defineConfig({
  plugins: [react(), tailwindcss()],
  server: {
    port: 5173,
    proxy: {
      "/auth": "http://localhost:3000",
      "/projects": "http://localhost:3000",
      "/conversations": "http://localhost:3000",
      "/agent": "http://localhost:3000",
      "/approvals": "http://localhost:3000",
      "/documents": "http://localhost:3000",
      "/audit-logs": "http://localhost:3000",
      "/health": "http://localhost:3000",
    },
  },
});

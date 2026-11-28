import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";

export default defineConfig({
  plugins: [react(), tailwindcss()],
  build: {
    outDir: "../public",
    emptyOutDir: false,
  },
  server: {
    port: 5173,
    proxy: {
      "/message": "http://localhost:3000",
      "/api": "http://localhost:3000",
      "/monitor": "http://localhost:3000",
      "/kill": "http://localhost:3000",
      "/artifacts": "http://localhost:3000",
      "/auth": "http://localhost:3000",
      "/annie-mascot.json": "http://localhost:3000",
    },
  },
});

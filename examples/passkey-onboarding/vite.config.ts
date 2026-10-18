import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import path from "path";

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      "stellar-hooks": path.resolve(__dirname, "../.."),
    },
  },
  define: {
    global: "globalThis",
  },
  server: {
    port: 3000,
  },
});

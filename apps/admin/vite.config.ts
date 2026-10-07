import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

// dev 代理到 admin-bff（:8889）；prod 由网关同域反代，无需 base 改写
export default defineConfig({
  plugins: [react()],
  server: {
    proxy: {
      "/api/v1": {
        target: "http://127.0.0.1:8889",
        changeOrigin: true,
      },
    },
  },
});

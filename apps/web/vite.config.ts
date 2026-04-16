import { defineConfig } from "vite";
import react from "@vitejs/plugin-react-swc";

export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    proxy: {
      "/auth": "http://localhost:3000",
      "/hosts": "http://localhost:3000",
      "/tags": "http://localhost:3000",
      "/socket.io": {
        target: "http://localhost:3000",
        ws: true
      }
    }
  }
});


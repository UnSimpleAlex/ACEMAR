import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react";
export default defineConfig({
  plugins: [react()],
  server: { allowedHosts: ["terminal.local"] },
  test: {
    environment: "jsdom",
    include: ["apps/web/src/**/*.test.{ts,tsx}"],
    setupFiles: ["./apps/web/src/test-setup.ts"],
  },
  build: { chunkSizeWarningLimit: 600 },
});

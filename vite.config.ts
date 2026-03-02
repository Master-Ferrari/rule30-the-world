import { defineConfig } from "vite";

export default defineConfig({
  base: "./",
  server: {
    hmr: true,
    watch: {
      // More reliable file change detection on synced/network folders.
      usePolling: true,
      interval: 120,
    },
  },
});

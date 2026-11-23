import { localSyncPlugin } from "./scripts/sync/plugin.ts";
import { defineConfig } from "vite";
export default defineConfig({
  base: process.env.VITE_BASE || "./",
  plugins: [localSyncPlugin()],
});

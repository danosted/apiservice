import { statfsSync } from "node:fs";
import { homedir } from "node:os";
import { fileURLToPath } from "node:url";
import { cloudflare } from "@cloudflare/vite-plugin";
import tailwindcss from "@tailwindcss/vite";
import { tanstackRouter } from "@tanstack/router-plugin/vite";
import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

// File-change events don't arrive on a 9p (Windows/WSL) mount, so poll there.
const V9FS_MAGIC = 0x01021997;
const usePolling = statfsSync(import.meta.dirname).type === V9FS_MAGIC;

export default defineConfig({
  server: {
    // "localhost" can resolve to IPv6 only ([::1]); VS Code's port forwarding connects over IPv4.
    host: "127.0.0.1",
    watch: usePolling ? { usePolling: true, interval: 300 } : undefined,
  },
  plugins: [
    tanstackRouter({ target: "react", autoCodeSplitting: true }),
    react(),
    tailwindcss(),
    cloudflare({
      // Local D1 lives on the Linux fs; SQLite can't lock files on the Windows mount.
      persistState: { path: `${homedir()}/.wrangler-state/admin` },
      inspectorPort: 9230,
    }),
  ],
  resolve: { alias: { "@": fileURLToPath(new URL("./src", import.meta.url)) } },
});

import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { cloudflare } from "@cloudflare/vite-plugin";
import { fileURLToPath } from "node:url";

const repoRoot = fileURLToPath(new URL(".", import.meta.url));

export default defineConfig({
  root: fileURLToPath(new URL("./web", import.meta.url)),
  plugins: [
    react(),
    cloudflare({
      configPath: `${repoRoot}/wrangler.jsonc`,
      viteEnvironment: { name: "worker" },
      persistState: true,
    }),
  ],
  environments: {
    worker: { build: { sourcemap: true } },
  },
  resolve: {
    alias: {
      "@shared": fileURLToPath(new URL("./shared/src", import.meta.url)),
    },
  },
  server: { port: 5173, strictPort: true, host: "127.0.0.1" },
  build: { sourcemap: true },
});

// @lovable.dev/vite-tanstack-config already includes the following — do NOT add them manually
// or the app will break with duplicate plugins:
//   - TanStack devtools (dev-only, first), tanstackStart, viteReact, tailwindcss, tsConfigPaths,
//     nitro (build-only using cloudflare as a default target), VITE_* env injection, @ path alias,
//     React/TanStack dedupe, error logger plugins, and sandbox detection (port/host/strictPort).
// You can pass additional config via defineConfig({ vite: { ... }, etc... }) if needed.
import { defineConfig } from "@lovable.dev/vite-tanstack-config";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

function getProfileFromEnv(): string {
  try {
    const envPath = path.resolve(__dirname, ".env");
    if (fs.existsSync(envPath)) {
      const text = fs.readFileSync(envPath, "utf-8");
      const match = text.match(/^PROFILE\s*=\s*([^#\r\n]+)/m);
      if (match) {
        return match[1].trim().replace(/^['"]|['"]$/g, "").toUpperCase();
      }
    }
  } catch (e) {}
  return (process.env.PROFILE || process.env.VITE_PROFILE || "").trim().toUpperCase();
}

const activeProfile = getProfileFromEnv();

export default defineConfig({
  vite: {
    server: { port: 8080 },
    envPrefix: ["VITE_", "PROFILE"],
    define: {
      "import.meta.env.PROFILE": JSON.stringify(activeProfile),
    },
  },
  tanstackStart: {
    ssr: false,
    server: { entry: "server" },
  },
});

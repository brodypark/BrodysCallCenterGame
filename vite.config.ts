import { fileURLToPath } from "node:url";
import react from "@vitejs/plugin-react";
import { loadEnv } from "vite";
import { defineConfig } from "vitest/config";
import { ServerConfig } from "./src/server/config.ts";

function fromRoot(relativePath: string): string {
  return fileURLToPath(new URL(relativePath, import.meta.url));
}

// One config for the client (dev server and build), the server build (`vite build --ssr`)
// and Vitest. The aliases here must match "paths" in tsconfig.base.json.
export default defineConfig(({ mode }) => {
  // Only PORT is read from .env here, so the dev proxy reaches the game server wherever it
  // listens. The server itself rejects a bad PORT on startup.
  const env = loadEnv(mode, fromRoot("."), "PORT");
  const serverPort = Number(env.PORT) || ServerConfig.DefaultPort;

  return {
    plugins: [react()],
    resolve: {
      alias: {
        "@client": fromRoot("./src/client"),
        "@server": fromRoot("./src/server"),
        "@shared": fromRoot("./src/shared"),
      },
    },
    build: {
      outDir: "dist/client",
      emptyOutDir: true,
    },
    server: {
      proxy: {
        "/socket.io": {
          target: `http://localhost:${serverPort}`,
          ws: true,
        },
      },
    },
    test: {
      include: ["src/**/*.test.{ts,tsx}"],
      environment: "node",
    },
  };
});

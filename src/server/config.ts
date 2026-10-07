// Server-only tunables. Values both sides need live in src/shared/Config.ts.
// vite.config.ts imports this file before the @ aliases exist, so keep it free of imports.

export const ServerConfig = {
  // Port and host the game server listens on when PORT / HOST aren't set in .env. Vite's dev
  // server forwards /socket.io here.
  DefaultPort: 3000,
  DefaultHost: "localhost",
  // The built client, relative to the built server (dist/server). Served in production only;
  // in development Vite serves the client.
  ClientBuildDir: "../client",
  // On SIGINT/SIGTERM, how long to wait for open requests to finish before exiting anyway.
  ShutdownTimeoutMs: 5000,
} as const;

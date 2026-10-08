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
  // The biggest Socket.IO message a client may send. Game events are tiny; voice clips go
  // over HTTP instead (step 10).
  MaxSocketMessageBytes: 16 * 1024,

  Database: {
    // The SQLite file with everyone's saves, relative to the server's own folder (src/server
    // in development, dist/server when built), so both use the project's gitignored data/
    // folder wherever the server is started from.
    Path: "../../data/scamgpt.sqlite",
    // Database calls block the whole server while they wait, so the waits are kept short.
    // SQLite waits up to BusyTimeoutMs for a lock; a call still busy after that is tried
    // again up to MaxRetries times, pausing RetryBaseMs, then twice that. Worst case:
    // 3 x 250 + 50 + 100 = 900 ms.
    BusyTimeoutMs: 250,
    MaxRetries: 2,
    RetryBaseMs: 50,
  },

  PlayerCookie: {
    Name: "scamgpt_player",
    // A year. Every visit starts it again.
    MaxAgeSeconds: 365 * 24 * 60 * 60,
    // Signs the cookie in development when COOKIE_SECRET isn't set, so restarting the dev
    // server keeps your player id. Never used in production, which refuses to start without
    // a real secret.
    DevSecret: "scamgpt-development-only-cookie-secret",
    // The shortest COOKIE_SECRET production accepts.
    MinSecretLength: 32,
  },
} as const;

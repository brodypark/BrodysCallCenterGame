// HTTP routes the client calls on the game server. vite.config.ts imports this file before
// the @ aliases exist, so keep it free of imports.

// Every route starts with this, so Vite's dev server knows to forward it.
export const ApiPrefix = "/api";

export const ApiRoutes = {
  // Gives this browser a player id cookie if it doesn't have a valid one.
  Session: `${ApiPrefix}/session`,
} as const;

// The one Socket.IO connection to the game server. Same origin in both modes: in development
// Vite forwards /socket.io to the server, in production the server serves this page.

import { io, type Socket } from "socket.io-client";
import type { ClientToServerEvents, ServerToClientEvents } from "@shared/events";

export type GameSocket = Socket<ServerToClientEvents, ClientToServerEvents>;

// Connects when main.tsx calls connect(), after the stores have added their listeners.
export const socket: GameSocket = io({ autoConnect: false });

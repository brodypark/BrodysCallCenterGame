// Client entry point: renders the app and opens the connection to the server.

import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { App } from "@client/App";
import { startConnection } from "@client/net/session";
import { startMusic } from "@client/ui/music";
import { startSoundCues } from "@client/ui/soundCues";
import { startPlayerVoice } from "@client/voice/PlayerVoice";
import { startVictimVoice } from "@client/voice/VictimVoice";
import "@client/global.css";

const rootElement = document.getElementById("root");
if (rootElement === null) {
  throw new Error("index.html is missing the #root element.");
}

createRoot(rootElement).render(
  <StrictMode>
    <App />
  </StrictMode>,
);

startVictimVoice();
startPlayerVoice();
startSoundCues();
startMusic();
startConnection();

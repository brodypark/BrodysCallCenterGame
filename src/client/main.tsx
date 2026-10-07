// Client entry point: renders the app and opens the connection to the server.

import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { App } from "@client/App";
import { socket } from "@client/net/socket";
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

socket.connect();

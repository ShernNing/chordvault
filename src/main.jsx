import React from "react";
import ReactDOM from "react-dom/client";
import App from "./App.jsx";
import "./index.css";
import ErrorBoundary from "./components/ErrorBoundary";
import { reloadOnceForStaleChunk } from "./lib/chunkReload";

// Vite fires this when a lazy chunk's preload fails (typically: tab opened
// before a deploy, old hashed file now gone). Reload once to pick up the new
// build instead of leaving a dead view.
window.addEventListener("vite:preloadError", (event) => {
  if (reloadOnceForStaleChunk()) event.preventDefault();
});

ReactDOM.createRoot(document.getElementById("root")).render(
  <React.StrictMode>
    {/* Outer boundary: catches crashes in providers / AppShell itself. */}
    <ErrorBoundary>
      <App />
    </ErrorBoundary>
  </React.StrictMode>,
);

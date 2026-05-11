import React from "react";
import ReactDOM from "react-dom/client";
import App from "./App.jsx";
import "./index.css";
import { setupDexieCloudProxy } from "./lib/dexieProxy.js";

// Setup CORS proxy for Dexie Cloud before app initialization
setupDexieCloudProxy();

ReactDOM.createRoot(document.getElementById("root")).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
);

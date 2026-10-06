import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { App } from "./App.js";
import "@fontsource-variable/schibsted-grotesk/wght.css";
import "@fontsource/ibm-plex-mono/500.css";
import "@fontsource/ibm-plex-mono/600.css";
import "@fontsource/young-serif/400.css";
import "./styles.css";

const rootElement = document.querySelector("#root");

if (!rootElement) {
  throw new Error("Staff application root element is missing.");
}

createRoot(rootElement).render(
  <StrictMode>
    <App />
  </StrictMode>,
);

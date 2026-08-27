if (
  import.meta.env.DEV &&
  import.meta.env.VITE_DISABLE_REACT_DIAGNOSTICS !== "true"
) {
  void import("react-grab");
}

import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { App } from "./App.js";
import { startReactDiagnostics } from "./react-diagnostics.js";
import "./styles.css";

const rootElement = document.querySelector("#root");

if (!rootElement) {
  throw new Error("Staff application root element is missing.");
}

await startReactDiagnostics();

createRoot(rootElement).render(
  <StrictMode>
    <App />
  </StrictMode>,
);

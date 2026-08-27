if (
  import.meta.env.DEV &&
  import.meta.env.VITE_DISABLE_REACT_DIAGNOSTICS !== "true"
) {
  void import("react-grab");
}

import { createRoot } from "react-dom/client";
import { App } from "./App.js";
import { startReactDiagnostics } from "./react-diagnostics.js";
import "./styles.css";

const root = document.querySelector("#root");
if (!root) throw new Error("Customer application root element is missing.");

await startReactDiagnostics();

createRoot(root).render(<App />);

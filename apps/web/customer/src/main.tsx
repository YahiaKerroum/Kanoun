import { createRoot } from "react-dom/client";
import { App } from "./App.js";
import "@fontsource-variable/archivo/wdth.css";
import "@fontsource/young-serif/400.css";
import "./styles.css";

const root = document.querySelector("#root");
if (!root) throw new Error("Customer application root element is missing.");

createRoot(root).render(<App />);

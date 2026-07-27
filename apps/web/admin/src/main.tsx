import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import "./styles.css";

function AdminFoundation() {
  return (
    <main>
      <p>MISE · ADMINISTRATION WEB</p>
      <h1>Administration begins with protected owner and branch bootstrap.</h1>
      <span>Application bootstrap · Slice 001</span>
    </main>
  );
}

const root = document.querySelector("#root");
if (!root)
  throw new Error("Administration application root element is missing.");

createRoot(root).render(
  <StrictMode>
    <AdminFoundation />
  </StrictMode>,
);

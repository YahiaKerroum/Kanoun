import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import "./styles.css";

function CustomerFoundation() {
  return (
    <main>
      <p>MISE · CUSTOMER WEB</p>
      <h1>Customer ordering begins after secure table QR foundations.</h1>
      <span>Application bootstrap · Slice 001</span>
    </main>
  );
}

const root = document.querySelector("#root");
if (!root) throw new Error("Customer application root element is missing.");

createRoot(root).render(
  <StrictMode>
    <CustomerFoundation />
  </StrictMode>,
);

import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { BrowserRouter } from "react-router-dom";
import "@fontsource-variable/instrument-sans/index.css";
import "./styles.css";
import { App } from "./App";
import { BrandProvider } from "./brand/Brand";

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <BrowserRouter>
      <BrandProvider>
        <App />
      </BrandProvider>
    </BrowserRouter>
  </StrictMode>,
);

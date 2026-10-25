import React from "react";
import ReactDOM from "react-dom/client";
import App from "./App";
import { ConfirmationProvider } from "./components/Overlays";

ReactDOM.createRoot(document.getElementById("root") as HTMLElement).render(
  <React.StrictMode>
    <ConfirmationProvider>
      <App />
    </ConfirmationProvider>
  </React.StrictMode>,
);

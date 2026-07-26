import React from "react";
import ReactDOM from "react-dom/client";
import "@fontsource-variable/noto-sans-sc";
import App from "./App";
import { AppStoreProvider } from "./store/AppStore";
import "../tokens.css";
import "./styles.css";

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <AppStoreProvider>
      <App />
    </AppStoreProvider>
  </React.StrictMode>
);

import React from "react";
import ReactDOM from "react-dom/client";
import "@fontsource-variable/noto-sans-sc";
import App from "./App";
import { AppStoreProvider } from "./store/AppStore";
import { applyStoredContentStyle } from "./utils/contentDisplay";
import { applyStoredFontPreferences } from "./utils/fontPreferences";
import "../tokens.css";
import "./styles.css";

applyStoredFontPreferences();
applyStoredContentStyle();

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <AppStoreProvider>
      <App />
    </AppStoreProvider>
  </React.StrictMode>
);

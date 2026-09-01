import React from "react";
import ReactDOM from "react-dom/client";
import "@fontsource-variable/noto-sans-sc";
import "katex/dist/katex.min.css";
import App from "./App";
import { AppStoreProvider } from "./store/AppStore";
import { applyStoredContentStyle } from "./utils/contentDisplay";
import { applyStoredFontPreferences } from "./utils/fontPreferences";
import { applyStoredAppTheme } from "./utils/themePreferences";
import "./styles/tokens.css";
import "./styles/01-base.css";
import "./styles/02-generation.css";
import "./styles/03-home.css";
import "./styles/04-reader.css";
import "./styles/05-topology.css";

applyStoredFontPreferences();
applyStoredContentStyle();
applyStoredAppTheme();

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <AppStoreProvider>
      <App />
    </AppStoreProvider>
  </React.StrictMode>
);

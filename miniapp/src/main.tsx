import React from "react";
import ReactDOM from "react-dom/client";
import { BrowserRouter } from "react-router-dom";
import { App } from "./App";
import { BotProvider } from "./domains/bot/store";
import "./shared/styles.css";

if (window.Telegram?.WebApp) {
  window.Telegram.WebApp.ready();
  window.Telegram.WebApp.expand();
}

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <BrowserRouter>
      <BotProvider>
        <App />
      </BotProvider>
    </BrowserRouter>
  </React.StrictMode>,
);








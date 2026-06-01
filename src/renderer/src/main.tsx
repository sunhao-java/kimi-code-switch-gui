import React from "react";
import ReactDOM from "react-dom/client";

import { App } from "./App";
import "./styles.css";

function render(): void {
  ReactDOM.createRoot(document.getElementById("root")!).render(
    <React.StrictMode>
      <App />
    </React.StrictMode>,
  );
}

// Tauri 环境下先注入 window.kimiSwitch 适配器再渲染（Electron 下由 preload 提供）。
if ("__TAURI_INTERNALS__" in window) {
  void import("./tauri/kimiSwitch").then(({ installKimiSwitchTauri }) => {
    installKimiSwitchTauri();
    render();
  });
} else {
  render();
}

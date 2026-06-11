/// <reference types="vite/client" />

import type { kimiSwitchTauri } from "./tauri/kimiSwitch";

type KimiSwitchApi = typeof kimiSwitchTauri;

declare global {
  interface Window {
    kimiSwitch: KimiSwitchApi;
  }
}

export {};

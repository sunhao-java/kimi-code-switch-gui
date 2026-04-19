/// <reference types="vite/client" />

import type { KimiSwitchApi } from "../../preload";

declare global {
  interface Window {
    kimiSwitch: KimiSwitchApi;
  }
}

export {};

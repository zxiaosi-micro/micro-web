/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_SCREEN_MOBILE?: string;
  readonly VITE_SCREEN_PASSWORD?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}

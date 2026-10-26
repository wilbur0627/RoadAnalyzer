/// <reference types="vite/client" />

interface ImportMetaEnv {
  /** Analysis server URL for local builds; production builds leave it unset */
  readonly VITE_SERVER_URL?: string;
}

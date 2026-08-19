/// <reference types="vite/client" />

interface ImportMetaEnv {
  /** Google OAuth 2.0 Web Client ID used for Sign in with Google */
  readonly VITE_GOOGLE_CLIENT_ID?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}

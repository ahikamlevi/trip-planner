/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_SUPABASE_URL: string
  readonly VITE_SUPABASE_ANON_KEY: string
  /** Optional — when set, enables Sentry error monitoring. */
  readonly VITE_SENTRY_DSN?: string
  /** Optional — when set, map tiles come from Stadia Maps instead of public OSM. */
  readonly VITE_STADIA_API_KEY?: string
}

interface ImportMeta {
  readonly env: ImportMetaEnv
}

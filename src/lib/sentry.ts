import * as Sentry from '@sentry/react'

// Error monitoring. Initializes ONLY when VITE_SENTRY_DSN is set, so the app runs
// fine locally / for anyone without a Sentry project (it's opt-in via env).
// Errors only — no performance tracing or session replay (the heavy parts), so the
// static import tree-shakes down to a small footprint. Uncaught errors + unhandled
// rejections are captured automatically via Sentry's global handlers; render errors
// come through captureException() (see ErrorBoundary).
export function initSentry(): void {
  const dsn = import.meta.env.VITE_SENTRY_DSN
  if (!dsn) return
  Sentry.init({
    dsn,
    environment: import.meta.env.MODE,
    sendDefaultPii: false, // don't attach IPs / request bodies
  })
}

// Report a caught error (no-op until Sentry has initialized).
export function captureException(error: unknown, extra?: Record<string, unknown>): void {
  Sentry.captureException(error, extra ? { extra } : undefined)
}
